import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/auth/require";
import { email as emailSchema } from "@/lib/schemas";

export const runtime = "nodejs";

const forgotPasswordSchema = z.object({ email: emailSchema });

// POST /api/auth/forgot-password — sends a recovery email via Supabase
// Auth. Always responds generically to avoid account enumeration.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req) ?? "unknown";
    // 5 attempts per 15 minutes per IP.
    const rl = await checkRateLimit("forgot-password", ip, 5, 15 * 60);
    if (rl) return rl;

    const raw = await req.json().catch(() => null);
    if (!raw) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { email } = forgotPasswordSchema.parse(raw);

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      req.headers.get("origin") ??
      new URL(req.url).origin;

    const admin = createAdminClient();

    // Only fire the email if a profile exists, to avoid needless Auth calls.
    const { data: profile } = await admin
      .from("profiles")
      .select("id, is_active, approval_status")
      .eq("email", email)
      .maybeSingle();

    if (
      profile &&
      profile.is_active &&
      profile.approval_status !== "rejected"
    ) {
      // Must use the anon-key client — service-role calls send no email.
      // redirectTo points at /auth/callback, which forwards to /reset-password.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const publicClient = createSupabaseJsClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { error: resetError } = await publicClient.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${origin}/reset-password` }
      );

      if (resetError) {
        console.error("[forgot-password] resetPasswordForEmail error:", resetError);
      }

      await admin
        .from("audit_logs")
        .insert({
          user_id: profile.id,
          action: "password_reset_requested",
          resource_type: "auth",
          ip_address: ip,
        })
        .then(() => undefined, () => undefined);
    }

    return NextResponse.json({
      ok: true,
      message:
        "If an account exists for that email, a password reset link has been sent.",
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    console.error("[forgot-password] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
