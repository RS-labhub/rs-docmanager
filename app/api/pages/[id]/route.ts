// /api/pages/[id] — read/update/delete a single page. Writes resolve permission via resolvePagePermission, then use the admin client for audit details.
import { NextRequest, NextResponse } from "next/server";
import { withAuth, getClientIp } from "@/lib/auth/require";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuid, updatePageSchema } from "@/lib/schemas";
import {
  permissionAtLeast,
  resolvePagePermission,
} from "@/lib/permissions";
import { blocksToMarkdown } from "@/lib/pages/markdown";
import type { Page, PagePermission, PageShare } from "@/lib/supabase/types";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

async function loadPageForCaller(
  pageId: string,
  userId: string
): Promise<{ page: Page | null; share: PageShare | null }> {
  // Admin client so we can compute permission ourselves for a precise 403/404.
  const admin = createAdminClient();
  const [{ data: page }, { data: share }] = await Promise.all([
    admin.from("pages").select("*").eq("id", pageId).maybeSingle(),
    admin
      .from("page_shares")
      .select("*")
      .eq("page_id", pageId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return {
    page: (page as Page | null) ?? null,
    share: (share as PageShare | null) ?? null,
  };
}

export const GET = withAuth(async (authed, _req: NextRequest, ctx: RouteCtx) => {
  const { id } = await ctx.params;
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { page, share } = await loadPageForCaller(parsedId.data, authed.id);
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
  if (!perm) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ page, permission: perm satisfies PagePermission });
});

export const PATCH = withAuth(
  async (authed, req: NextRequest, ctx: RouteCtx) => {
    const { id } = await ctx.params;
    const parsedId = uuid.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    let body;
    try {
      body = updatePageSchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { page, share } = await loadPageForCaller(parsedId.data, authed.id);
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

    // Visibility / min_role changes require full_access; covers are content.
    const isVisibilityChange =
      body.visibility !== undefined || body.min_role !== undefined;
    const requires: PagePermission = isVisibilityChange
      ? "full_access"
      : "edit";
    if (!permissionAtLeast(perm, requires)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const update: Partial<Page> = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.emoji !== undefined) update.emoji = body.emoji;
    if (body.cover_url !== undefined) update.cover_url = body.cover_url;
    if (body.is_archived !== undefined) update.is_archived = body.is_archived;
    if (body.visibility !== undefined) {
      // Personal pages (no org) can only be private or public_link.
      if (
        page.org_id === null &&
        body.visibility !== "private" &&
        body.visibility !== "public_link"
      ) {
        return NextResponse.json(
          {
            error:
              "Personal pages can only be set to private or public link. Join an organization to use org, role, or restricted visibility.",
          },
          { status: 400 }
        );
      }
      update.visibility = body.visibility;
      // Clear min_role when visibility leaves 'role'.
      if (body.visibility !== "role") {
        update.min_role = null;
      } else if (body.min_role !== undefined) {
        update.min_role = body.min_role;
      } else if (page.min_role === null) {
        return NextResponse.json(
          { error: "min_role is required for role visibility" },
          { status: 400 }
        );
      }
    } else if (body.min_role !== undefined) {
      // Standalone min_role change is only valid when already 'role'.
      if (page.visibility !== "role") {
        return NextResponse.json(
          { error: "min_role only applies when visibility is 'role'" },
          { status: 400 }
        );
      }
      update.min_role = body.min_role;
    }
    if (body.content !== undefined) {
      update.content = body.content;
      update.markdown_cache =
        body.markdown_cache ?? blocksToMarkdown(body.content);
    } else if (body.markdown_cache !== undefined) {
      update.markdown_cache = body.markdown_cache;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ page });
    }

    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("pages")
      .update(update)
      .eq("id", page.id)
      .select("*")
      .single();
    if (error || !updated) {
      console.error("[PATCH /api/pages/:id]", error);
      return NextResponse.json(
        { error: "Failed to update page" },
        { status: 500 }
      );
    }

    await admin.from("audit_logs").insert({
      user_id: authed.id,
      action: "page.update",
      resource_type: "page",
      resource_id: page.id,
      org_id: page.org_id,
      ip_address: getClientIp(req),
      details: {
        fields: Object.keys(update),
      },
    });

    return NextResponse.json({ page: updated as Page });
  }
);

// DELETE

export const DELETE = withAuth(
  async (authed, req: NextRequest, ctx: RouteCtx) => {
    const { id } = await ctx.params;
    const parsedId = uuid.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const { page, share } = await loadPageForCaller(parsedId.data, authed.id);
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
    if (perm !== "full_access") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("pages").delete().eq("id", page.id);
    if (error) {
      console.error("[DELETE /api/pages/:id]", error);
      return NextResponse.json(
        { error: "Failed to delete page" },
        { status: 500 }
      );
    }

    await admin.from("audit_logs").insert({
      user_id: authed.id,
      action: "page.delete",
      resource_type: "page",
      resource_id: page.id,
      org_id: page.org_id,
      ip_address: getClientIp(req),
      details: { title: page.title },
    });

    return NextResponse.json({ ok: true });
  }
);
