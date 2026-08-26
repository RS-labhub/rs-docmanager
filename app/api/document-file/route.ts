import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/auth/require";
import { hasValidUnlock } from "@/lib/document-unlock";
import { documentFileQuerySchema } from "@/lib/schemas";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (authed, req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const { documentId } = documentFileQuerySchema.parse({
      documentId: searchParams.get("documentId"),
    });

    const supabase = await createServerClient();

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("file_url, file_type, org_id, owner_id, is_public, is_password_protected")
      .eq("id", documentId)
      .single();

    if (docError || !doc || !doc.file_url) {
      return NextResponse.json(
        { error: "Document not found or no file attached" },
        { status: 404 }
      );
    }

    // Authorization: god bypass, else same-org; private docs further restricted to owner + admin+.
    if (authed.profile.role !== "god") {
      if (doc.org_id !== authed.profile.org_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!doc.is_public && doc.owner_id !== authed.id) {
        const role = authed.profile.role;
        const isAdmin = role === "admin" || role === "super_admin";
        if (!isAdmin) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    // Password-protected files require a server-side unlock (owner and god exempt).
    if (
      doc.is_password_protected &&
      doc.owner_id !== authed.id &&
      authed.profile.role !== "god"
    ) {
      const unlocked = await hasValidUnlock(documentId, authed.id);
      if (!unlocked) {
        return NextResponse.json(
          { error: "Document is password protected" },
          { status: 403 }
        );
      }
    }

    const urlParts = doc.file_url.split("/documents/");
    if (urlParts.length < 2) {
      return NextResponse.json({ error: "Invalid file URL" }, { status: 400 });
    }
    const storagePath = urlParts[1];

    // Private bucket, locked to service_role; ACL already checked above.
    const admin = createAdminClient();
    const { data: fileData, error: downloadError } = await admin.storage
      .from("documents")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("[document-file] download error:", downloadError);
      return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const contentType = doc.file_type === "pdf" ? "application/pdf" : "application/octet-stream";
    // Harden filename against header-injection (CR/LF/quote/backslash).
    const rawName = storagePath.split("/").pop() ?? "file";
    const safeFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    console.error("[document-file] error:", err);
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }
});
