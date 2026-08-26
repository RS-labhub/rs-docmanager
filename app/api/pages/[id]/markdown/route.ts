// GET /api/pages/[id]/markdown — markdown export.
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuid } from "@/lib/schemas";
import { resolvePagePermission } from "@/lib/permissions";
import { blocksToMarkdown } from "@/lib/pages/markdown";
import type { Page, PageShare } from "@/lib/supabase/types";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export const GET = withAuth(async (authed, req: NextRequest, ctx: RouteCtx) => {
  const { id } = await ctx.params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: page }, { data: share }] = await Promise.all([
    admin.from("pages").select("*").eq("id", parsed.data).maybeSingle(),
    admin
      .from("page_shares")
      .select("*")
      .eq("page_id", parsed.data)
      .eq("user_id", authed.id)
      .maybeSingle(),
  ]);

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  const typedPage = page as Page;
  const perm = resolvePagePermission({
    page: typedPage,
    user: {
      id: authed.id,
      role: authed.profile.role,
      org_id: authed.profile.org_id,
    },
    share: (share as PageShare | null) ?? null,
  });
  if (!perm) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prefer the cached markdown; fall back to a fresh render if empty.
  const md =
    typedPage.markdown_cache && typedPage.markdown_cache.trim().length > 0
      ? typedPage.markdown_cache
      : blocksToMarkdown(typedPage.content as unknown[]);

  const heading = `# ${typedPage.title || "Untitled"}\n\n`;
  const body = md.startsWith("# ") ? md : heading + md;

  // Sanitize title for use as a filename.
  const safeTitle = (typedPage.title || "page")
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "page";

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}.md"`,
      "Cache-Control": "no-store",
    },
  });
});
