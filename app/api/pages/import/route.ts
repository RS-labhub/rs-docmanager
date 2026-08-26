// POST /api/pages/import — create a page from a markdown upload. Accepts multipart/form-data with `file` (.md) or JSON { title?, markdown, visibility? }.
import { NextRequest, NextResponse } from "next/server";
import { withAuth, getClientIp } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { importPageSchema } from "@/lib/schemas";
import { blocksToMarkdown, markdownToBlocks } from "@/lib/pages/markdown";
import type { Page } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MAX_MD_SIZE = 2 * 1024 * 1024; // 2 MB

function inferTitle(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim().slice(0, 200);
  return fallback;
}

export const POST = withAuth(async (authed, req: NextRequest) => {
  const rl = await checkRateLimit("page-import", authed.id, 20, 300);
  if (rl) return rl;

  // Callers without an org get a personal page, defaulting to private.
  const hasOrg = !!authed.profile.org_id;

  let title: string | undefined;
  let markdown: string;
  let visibility: "private" | "org" | "role" | "restricted" | "public_link" =
    hasOrg ? "org" : "private";

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    if (file.size > MAX_MD_SIZE) {
      return NextResponse.json(
        { error: "File must be under 2 MB" },
        { status: 400 }
      );
    }
    if (!file.name.toLowerCase().endsWith(".md")) {
      return NextResponse.json(
        { error: "Only .md files are supported in this round" },
        { status: 400 }
      );
    }
    markdown = await file.text();
    title =
      (form.get("title") as string | null) ||
      inferTitle(markdown, file.name.replace(/\.md$/i, ""));
    const v = form.get("visibility") as string | null;
    if (v === "private" || v === "org") visibility = v;
  } else {
    let body;
    try {
      body = importPageSchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    markdown = body.markdown;
    title = body.title ?? inferTitle(markdown, "Imported page");
    visibility = body.visibility;
  }

  // Personal pages (no org) can only be private or public_link.
  if (!hasOrg && visibility !== "private" && visibility !== "public_link") {
    visibility = "private";
  }

  const blocks = markdownToBlocks(markdown);
  const cache = blocksToMarkdown(blocks);

  const admin = createAdminClient();
  const { data: created, error } = await admin
    .from("pages")
    .insert({
      owner_id: authed.id,
      org_id: authed.profile.org_id ?? null,
      title: (title || "Imported page").slice(0, 200),
      content: blocks,
      markdown_cache: cache,
      visibility,
    })
    .select("*")
    .single();

  if (error || !created) {
    console.error("[POST /api/pages/import]", error);
    return NextResponse.json(
      { error: "Failed to import page" },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    user_id: authed.id,
    action: "page.import",
    resource_type: "page",
    resource_id: created.id,
    org_id: authed.profile.org_id ?? null,
    ip_address: getClientIp(req),
    details: { source: "markdown" },
  });

  return NextResponse.json({ page: created as Page }, { status: 201 });
});
