import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDocument } from "@/lib/parsers";
import { withAuth } from "@/lib/auth/require";
import { checkRateLimit } from "@/lib/rate-limit";
import { fileTypeFromBuffer } from "file-type";
import type { Document as DocumentRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const PARSEABLE_EXTENSIONS = ["docx", "doc", "txt", "md", "html", "json", "rtf", "odt", "csv"];

// Allowed MIME types from magic-byte sniffing. Plain-text formats are detected via extension since they lack reliable magic bytes.
// Restricted to formats parseDocument actually handles.
const ALLOWED_DETECTED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  // file-type reports legacy .doc as CFB (Compound File Binary).
  "application/x-cfb",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
]);

const PLAINTEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "html"]);

export const POST = withAuth(async (authed, req: NextRequest) => {
  try {
    // Must belong to an org before uploading anything. Pending / rejected accounts are already blocked in requireUser().
    if (!authed.profile.org_id) {
      return NextResponse.json(
        { error: "You must belong to an organization to upload files" },
        { status: 403 }
      );
    }

    // Rate-limit uploads: 20 per 5 minutes per user.
    const rl = await checkRateLimit("upload", authed.id, 20, 300);
    if (rl) return rl;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const documentId = formData.get("documentId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File must be under 50MB" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();

    // Magic-byte sniff for non-plaintext types. Record the server-verified MIME so we never trust `file.type` from the client.
    let trustedContentType: string;
    if (PLAINTEXT_EXTENSIONS.has(ext)) {
      const plaintextMime: Record<string, string> = {
        txt: "text/plain",
        md: "text/markdown",
        csv: "text/csv",
        json: "application/json",
        html: "text/html",
      };
      trustedContentType = plaintextMime[ext] || "text/plain";
    } else {
      const detected = await fileTypeFromBuffer(buffer);
      if (!detected || !ALLOWED_DETECTED_MIMES.has(detected.mime)) {
        return NextResponse.json(
          { error: `File content does not match a supported document type` },
          { status: 400 }
        );
      }
      trustedContentType = detected.mime;
    }

    // If updating an existing document, require ownership or admin+ in same org.
    const supabase = await createServerClient();
    if (documentId) {
      const { data: existing } = await supabase
        .from("documents")
        .select("owner_id, org_id")
        .eq("id", documentId)
        .single();
      if (!existing) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      const isOwner = existing.owner_id === authed.id;
      const isSameOrg = existing.org_id === authed.profile.org_id;
      const isAdmin =
        authed.profile.role === "admin" ||
        authed.profile.role === "super_admin" ||
        authed.profile.role === "god";
      if (!(isOwner || (isAdmin && (isSameOrg || authed.profile.role === "god")))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const timestamp = Date.now();
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_");
    const storagePath = `${authed.id}/${timestamp}_${safeName}`;

    // Storage bucket is service-role-only; DB writes below stay on the user client.
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, buffer, {
        contentType: trustedContentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[upload] storage error:", uploadError);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from("documents").getPublicUrl(storagePath);

    if (documentId) {
      const updateData: Partial<DocumentRow> = {
        file_url: publicUrl,
        file_size: file.size,
      };
      if (PARSEABLE_EXTENSIONS.includes(ext)) {
        try {
          const result = await parseDocument(buffer, file.name);
          if (result.content) updateData.content = result.content;
        } catch (parseErr) {
          console.error("[upload] parse error (non-fatal):", parseErr);
        }
      }
      await supabase.from("documents").update(updateData).eq("id", documentId);
    }

    return NextResponse.json({
      url: publicUrl,
      path: storagePath,
      size: file.size,
      name: file.name,
      type: trustedContentType,
    });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
});
