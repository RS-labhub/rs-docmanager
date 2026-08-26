// /api/pages — list + create. Both rely on RLS (page_permission_for) via the user-scoped Supabase client to filter what the caller can see.
import { NextRequest, NextResponse } from "next/server";
import { withAuth, getClientIp } from "@/lib/auth/require";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { createPageSchema } from "@/lib/schemas";
import { blocksToMarkdown } from "@/lib/pages/markdown";
import {
  buildDefaultPageContent,
  defaultPageMarkdown,
} from "@/lib/pages/default-content";
import type { Page } from "@/lib/supabase/types";

export const runtime = "nodejs";

export const GET = withAuth(async (authed, req: NextRequest) => {
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "true";
  const parentParam = url.searchParams.get("parent_id");

  const supabase = await createServerClient();
  let query = supabase
    .from("pages")
    .select(
      "id, org_id, owner_id, parent_id, title, emoji, cover_url, visibility, min_role, is_archived, position, updated_at, created_at"
    )
    .order("updated_at", { ascending: false });

  if (!includeArchived) query = query.eq("is_archived", false);
  if (parentParam === "null") query = query.is("parent_id", null);
  else if (parentParam) query = query.eq("parent_id", parentParam);

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/pages]", error);
    return NextResponse.json(
      { error: "Failed to load pages" },
      { status: 500 }
    );
  }
  return NextResponse.json({ pages: data ?? [] });
});

export const POST = withAuth(async (authed, req: NextRequest) => {
  // Rate-limit page creation: 30 / 5 min / user.
  const rl = await checkRateLimit("page-create", authed.id, 30, 300);
  if (rl) return rl;

  let parsed;
  try {
    parsed = createPageSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const isPersonal = !authed.profile.org_id;

  // Personal pages (no org) must be private; clamp rather than 400.
  if (isPersonal) {
    parsed.visibility = "private";
    parsed.min_role = null;
    parsed.parent_id = null;
  }

  // Verify the caller can edit the parent (no smuggling into another org's tree).
  if (parsed.parent_id && authed.profile.org_id) {
    const userClient = await createServerClient();
    const { data: parent } = await userClient
      .from("pages")
      .select("id, org_id")
      .eq("id", parsed.parent_id)
      .single();
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }
    if (parent.org_id !== authed.profile.org_id) {
      return NextResponse.json(
        { error: "Cross-org parent not allowed" },
        { status: 403 }
      );
    }
  }

  // Default to a small template if no content was supplied.
  const initialContent = parsed.content ?? buildDefaultPageContent();
  const markdown =
    parsed.markdown_cache ??
    (parsed.content ? blocksToMarkdown(initialContent) : defaultPageMarkdown());

  // Admin client so we can return the row even where RLS would deny SELECT after INSERT.
  const admin = createAdminClient();
  const { data: created, error } = await admin
    .from("pages")
    .insert({
      owner_id: authed.id,
      org_id: authed.profile.org_id ?? null,
      parent_id: parsed.parent_id ?? null,
      title: parsed.title || "Untitled",
      emoji: parsed.emoji ?? null,
      cover_url: parsed.cover_url ?? null,
      content: initialContent,
      markdown_cache: markdown,
      visibility: parsed.visibility,
      min_role:
        parsed.visibility === "role" ? parsed.min_role ?? null : null,
    })
    .select(
      "id, org_id, owner_id, parent_id, title, emoji, cover_url, visibility, min_role, is_archived, position, updated_at, created_at"
    )
    .single();

  if (error || !created) {
    console.error("[POST /api/pages]", error);
    return NextResponse.json(
      { error: "Failed to create page" },
      { status: 500 }
    );
  }

  // Audit log (best-effort).
  await admin.from("audit_logs").insert({
    user_id: authed.id,
    action: "page.create",
    resource_type: "page",
    resource_id: created.id,
    org_id: authed.profile.org_id,
    ip_address: getClientIp(req),
    details: {
      title: created.title,
      visibility: created.visibility,
    },
  });

  return NextResponse.json({ page: created as Page }, { status: 201 });
});
