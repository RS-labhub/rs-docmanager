import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { withAuth } from "@/lib/auth/require";
import { checkRateLimit } from "@/lib/rate-limit";
import { fileTypeFromBuffer } from "file-type";

export const runtime = "nodejs";

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export const POST = withAuth(async (authed, req: NextRequest) => {
  try {
    const rl = await checkRateLimit("avatar", authed.id, 10, 300);
    if (rl) return rl;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File must be 1 byte - 5MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !ALLOWED_IMAGE_MIMES.has(detected.mime)) {
      return NextResponse.json({ error: "Only JPEG/PNG/GIF/WebP allowed" }, { status: 400 });
    }

    const ext = detected.ext;
    const filePath = `${authed.id}/avatar.${ext}`;

    const supabase = await createServerClient();
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, buffer, {
        contentType: detected.mime,
        upsert: true,
      });

    if (uploadError) {
      console.error("[avatar] upload:", uploadError);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const avatarUrl = urlData.publicUrl;

    await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", authed.id);

    return NextResponse.json({ url: avatarUrl });
  } catch (err) {
    console.error("[avatar] error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
});
