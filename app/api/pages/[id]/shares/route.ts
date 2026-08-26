// /api/pages/[id]/shares — manage explicit page_shares. GET lists shares,  PUT upserts { user_id, permission }, DELETE removes by ?user_id. Only full_access callers can mutate; shared users must be in the same org.
import { NextRequest, NextResponse } from "next/server";
import { withAuth, getClientIp, type AuthedUser } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuid, upsertShareSchema } from "@/lib/schemas";
import {
  permissionAtLeast,
  resolvePagePermission,
} from "@/lib/permissions";
import type { Page, PageShare, Profile } from "@/lib/supabase/types";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

// Loads page + caller's own share so we can gate on full_access.
async function loadPageAndCallerShare(pageId: string, authed: AuthedUser) {
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

function gate(
  page: Page | null,
  share: PageShare | null,
  authed: AuthedUser
): NextResponse | null {
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
  if (!permissionAtLeast(perm, "full_access")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export const GET = withAuth(async (authed, _req: NextRequest, ctx: RouteCtx) => {
  const { id } = await ctx.params;
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { admin, page, share } = await loadPageAndCallerShare(
    parsedId.data,
    authed
  );
  const denied = gate(page, share, authed);
  if (denied) return denied;

  const { data: shares, error } = await admin
    .from("page_shares")
    .select("*")
    .eq("page_id", parsedId.data)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[GET /api/pages/:id/shares]", error);
    return NextResponse.json(
      { error: "Failed to load shares" },
      { status: 500 }
    );
  }

  const rows = (shares ?? []) as PageShare[];
  // Hydrate with minimal profile info for the UI list.
  const userIds = Array.from(new Set(rows.map((s) => s.user_id)));
  let profiles: Pick<
    Profile,
    "id" | "full_name" | "email" | "avatar_url" | "org_id"
  >[] = [];
  if (userIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name, email, avatar_url, org_id")
      .in("id", userIds);
    profiles = (profs ?? []) as typeof profiles;
  }
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  return NextResponse.json({
    shares: rows.map((s) => ({
      ...s,
      profile: profileMap.get(s.user_id) ?? null,
    })),
  });
});

export const PUT = withAuth(async (authed, req: NextRequest, ctx: RouteCtx) => {
  const { id } = await ctx.params;
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body;
  try {
    body = upsertShareSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { admin, page, share } = await loadPageAndCallerShare(
    parsedId.data,
    authed
  );
  const denied = gate(page, share, authed);
  if (denied) return denied;
  // page is non-null past `gate`.
  const pageRow = page as Page;

  // Cannot share to yourself.
  if (body.user_id === authed.id) {
    return NextResponse.json(
      { error: "Cannot share a page with yourself" },
      { status: 400 }
    );
  }

  // Cannot demote the owner through a share.
  if (body.user_id === pageRow.owner_id) {
    return NextResponse.json(
      { error: "Owner already has full access" },
      { status: 400 }
    );
  }

  // Validate the target user: must exist, be active, approved.
  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, is_active, approval_status")
    .eq("id", body.user_id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!target.is_active || target.approval_status !== "approved") {
    return NextResponse.json(
      { error: "User is not active" },
      { status: 400 }
    );
  }

  // Same-org required unless: god role, public_link page, or personal page (no org).
  const sameOrg = target.org_id === pageRow.org_id;
  const isGod = authed.profile.role === "god";
  const isPersonalPage = pageRow.org_id === null;
  const isPublicLink = pageRow.visibility === "public_link";
  if (!sameOrg && !isGod && !isPublicLink && !isPersonalPage) {
    return NextResponse.json(
      { error: "User must belong to the same organization" },
      { status: 400 }
    );
  }

  const { data: upserted, error } = await admin
    .from("page_shares")
    .upsert(
      {
        page_id: pageRow.id,
        user_id: body.user_id,
        permission: body.permission,
        granted_by: authed.id,
      },
      { onConflict: "page_id,user_id" }
    )
    .select("*")
    .single();
  if (error || !upserted) {
    console.error("[PUT /api/pages/:id/shares]", error);
    return NextResponse.json(
      { error: "Failed to save share" },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    user_id: authed.id,
    action: "page.share.upsert",
    resource_type: "page",
    resource_id: pageRow.id,
    org_id: pageRow.org_id,
    ip_address: getClientIp(req),
    details: {
      grantee: body.user_id,
      permission: body.permission,
    },
  });

  return NextResponse.json({ share: upserted as PageShare });
});

// DELETE

export const DELETE = withAuth(
  async (authed, req: NextRequest, ctx: RouteCtx) => {
    const { id } = await ctx.params;
    const parsedId = uuid.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const url = new URL(req.url);
    const rawUserId = url.searchParams.get("user_id");
    const parsedUser = uuid.safeParse(rawUserId);
    if (!parsedUser.success) {
      return NextResponse.json(
        { error: "user_id query param is required" },
        { status: 400 }
      );
    }

    const { admin, page, share } = await loadPageAndCallerShare(
      parsedId.data,
      authed
    );
    const denied = gate(page, share, authed);
    if (denied) return denied;
    const pageRow = page as Page;

    const { error } = await admin
      .from("page_shares")
      .delete()
      .eq("page_id", pageRow.id)
      .eq("user_id", parsedUser.data);
    if (error) {
      console.error("[DELETE /api/pages/:id/shares]", error);
      return NextResponse.json(
        { error: "Failed to remove share" },
        { status: 500 }
      );
    }

    await admin.from("audit_logs").insert({
      user_id: authed.id,
      action: "page.share.remove",
      resource_type: "page",
      resource_id: pageRow.id,
      org_id: pageRow.org_id,
      ip_address: getClientIp(req),
      details: { grantee: parsedUser.data },
    });

    return NextResponse.json({ ok: true });
  }
);
