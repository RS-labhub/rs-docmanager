// POST/DELETE /api/pages/[id]/cover — upload or clear a cover image.
// Stored in the private "page-covers" bucket; returns a long-lived signed URL.
import { NextRequest, NextResponse } from "next/server";
import { withAuth, getClientIp, type AuthedUser } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { uuid } from "@/lib/schemas";
import {
  permissionAtLeast,
  resolvePagePermission,
} from "@/lib/permissions";
import { fileTypeFromBuffer } from "file-type";
import type { Page, PageShare } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_COVER_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

interface RouteCtx {
  params: Promise<{ id: string }>;
}

async function loadAndAuthorize(pageId: string, authed: AuthedUser) {
  const admin = createAdminClient();
  const [{ data: page }, { data: share }] = await Promise.all([
    admin.from("pages").select("*").eq("id", pageId).maybeSingle(),
    admin
      .from("page_shares")
      .select("*")
      .eq("page_id", pageId)
      .eq("user_id", authed.id)
      .maybeSingle(),
  ]);
  return {
    admin,
    page: (page as Page | null) ?? null,
    share: (share as PageShare | null) ?? null,
  };
}

export const POST = withAuth(async (authed, req: NextRequest, ctx: RouteCtx) => {
  const { id } = await ctx.params;
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const rl = await checkRateLimit("page-cover-upload", authed.id, 30, 300);
  if (rl) return rl;

  const { admin, page, share } = await loadAndAuthorize(parsedId.data, authed);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  const perm = resolvePagePermission({
    page,
    user: {
      id: authed.id,
      role: authed.profile.role,
      org_id: authed.profile.org_id,
    },
    share,
  });
  // Covers are content — any editor can change them (matches the UI).
  if (!permissionAtLeast(perm, "edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_COVER_SIZE) {
    return NextResponse.json(
      { error: "Cover must be under 10 MB" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_COVER_MIMES.has(detected.mime)) {
    return NextResponse.json(
      { error: "Cover must be a PNG, JPEG, WEBP, or GIF image" },
      { status: 400 }
    );
  }

  // Path: <org|personal/owner>/<page>/<timestamp>.<ext> keeps isolation and eases cleanup.
  const ext = detected.ext;
  const scope = page.org_id ?? `personal-${page.owner_id}`;
  const path = `${scope}/${page.id}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from("page-covers")
    .upload(path, buffer, {
      contentType: detected.mime,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    console.error("[POST /api/pages/:id/cover] upload", uploadErr);
    return NextResponse.json(
      { error: "Failed to upload cover" },
      { status: 500 }
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("page-covers")
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !signed) {
    console.error("[POST /api/pages/:id/cover] sign", signErr);
    return NextResponse.json(
      { error: "Uploaded but could not sign URL" },
      { status: 500 }
    );
  }

  // Best-effort cleanup of any previous storage-backed cover.
  if (page.cover_storage) {
    await admin.storage.from("page-covers").remove([page.cover_storage]);
  }

  const { data: updated, error: updateErr } = await admin
    .from("pages")
    .update({
      cover_url: signed.signedUrl,
      cover_storage: path,
    })
    .eq("id", page.id)
    .select("*")
    .single();
  if (updateErr || !updated) {
    console.error("[POST /api/pages/:id/cover] save url", updateErr);
    return NextResponse.json(
      { error: "Failed to save cover" },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    user_id: authed.id,
    action: "page.cover.upload",
    resource_type: "page",
    resource_id: page.id,
    org_id: page.org_id,
    ip_address: getClientIp(req),
    details: { mime: detected.mime, size: file.size },
  });

  return NextResponse.json({ page: updated as Page });
});

export const DELETE = withAuth(
  async (authed, req: NextRequest, ctx: RouteCtx) => {
    const { id } = await ctx.params;
    const parsedId = uuid.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const { admin, page, share } = await loadAndAuthorize(
      parsedId.data,
      authed
    );
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    const perm = resolvePagePermission({
      page,
      user: {
        id: authed.id,
        role: authed.profile.role,
        org_id: authed.profile.org_id,
      },
      share,
    });
    if (!permissionAtLeast(perm, "edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (page.cover_storage) {
      await admin.storage.from("page-covers").remove([page.cover_storage]);
    }

    const { data: updated, error } = await admin
      .from("pages")
      .update({ cover_url: null, cover_storage: null })
      .eq("id", page.id)
      .select("*")
      .single();
    if (error || !updated) {
      return NextResponse.json(
        { error: "Failed to clear cover" },
        { status: 500 }
      );
    }
    return NextResponse.json({ page: updated as Page });
  }
);
