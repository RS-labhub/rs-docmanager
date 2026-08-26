import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDocument } from "@/lib/parsers";
import { withAuth } from "@/lib/auth/require";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAtLeast } from "@/lib/permissions";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  documentId: z.string().uuid(),
});

export const POST = withAuth(async (authed, req: NextRequest) => {
  try {
    const rl = await checkRateLimit("reparse", authed.id, 10, 300);
    if (rl) return rl;

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "documentId (uuid) required" },
        { status: 400 }
      );
    }
    const { documentId } = parsed.data;

    const supabase = await createServerClient();

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, file_url, file_type, owner_id, org_id")
      .eq("id", documentId)
      .single();

    if (docError || !doc || !doc.file_url) {
      return NextResponse.json(
        { error: "Document not found or no file attached" },
        { status: 404 }
      );
    }

    // Authorization: owner, or admin+ within same org, or god
    const isOwner = doc.owner_id === authed.id;
    const isGod = authed.profile.role === "god";
    const isAdminInOrg =
      isAtLeast(authed.profile.role, "admin") &&
      authed.profile.org_id === doc.org_id;

    if (!isOwner && !isGod && !isAdminInOrg) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parts = doc.file_url.split("/documents/");
    if (parts.length < 2) {
      return NextResponse.json(
        { error: "Invalid file URL format" },
        { status: 400 }
      );
    }
    const storagePath = parts[parts.length - 1];

    // The documents bucket is service-role-only; ACL was checked above.
    const admin = createAdminClient();
    const { data: fileData, error: downloadError } = await admin.storage
      .from("documents")
      .download(storagePath);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: "Failed to download file" },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const filename =
      storagePath.split("/").pop() || `file.${doc.file_type || "txt"}`;

    const result = await parseDocument(buffer, filename);

    if (!result.content || result.content.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text content from this file" },
        { status: 422 }
      );
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({ content: result.content })
      .eq("id", documentId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update document content" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      content: result.content,
      metadata: result.metadata,
    });
  } catch (err: any) {
    console.error("[reparse] error:", err);
    return NextResponse.json(
      { error: "Failed to re-parse document" },
      { status: 500 }
    );
  }
});
