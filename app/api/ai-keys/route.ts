import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { encryptApiKey } from "@/lib/encryption";
import { withAuth } from "@/lib/auth/require";
import { createAiKeySchema } from "@/lib/schemas";
import { ZodError, z } from "zod";

export const runtime = "nodejs";

// GET: list the caller's API keys (metadata only, never the key).
export const GET = withAuth(async (authed) => {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("ai_api_keys")
    .select("id, provider, label, is_active, created_at, updated_at")
    .eq("user_id", authed.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ai-keys GET]", error);
    return NextResponse.json({ error: "Failed to load keys" }, { status: 500 });
  }
  return NextResponse.json({ keys: data ?? [] });
});

// POST: store a new encrypted API key owned by the caller.
export const POST = withAuth(async (authed, req: NextRequest) => {
  try {
    const raw = await req.json();
    const { provider, api_key, label } = createAiKeySchema.parse(raw);

    const encrypted = encryptApiKey(api_key);
    const supabase = await createServerClient();

    // Deactivate prior keys for same provider
    await supabase
      .from("ai_api_keys")
      .update({ is_active: false })
      .eq("user_id", authed.id)
      .eq("provider", provider);

    const { data, error } = await supabase
      .from("ai_api_keys")
      .insert({
        user_id: authed.id,
        provider,
        encrypted_key: encrypted.encrypted_key,
        iv: encrypted.iv,
        auth_tag: encrypted.auth_tag,
        label: label || `${provider} key`,
        is_active: true,
      })
      .select("id, provider, label, is_active, created_at")
      .single();

    if (error || !data) {
      console.error("[ai-keys POST]", error);
      return NextResponse.json({ error: "Failed to store key" }, { status: 500 });
    }

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "create",
      resource_type: "ai_api_key",
      resource_id: data.id,
      details: { provider },
      org_id: authed.profile.org_id,
    });

    return NextResponse.json({ key: data }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    console.error("[ai-keys POST] unexpected", err);
    return NextResponse.json({ error: "Failed to store key" }, { status: 500 });
  }
});

// DELETE: remove one of the caller's API keys.
export const DELETE = withAuth(async (authed, req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get("id");
  const parsed = z.string().uuid().safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "valid id required" }, { status: 400 });
  }
  const keyId = parsed.data;

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("ai_api_keys")
    .delete()
    .eq("id", keyId)
    .eq("user_id", authed.id); // ownership enforced

  if (error) {
    console.error("[ai-keys DELETE]", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
});
