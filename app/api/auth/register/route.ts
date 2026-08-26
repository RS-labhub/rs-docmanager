import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUserToPermit } from "@/lib/permit";
import { registerSchema } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/auth/require";
import { ZodError } from "zod";

export const runtime = "nodejs";

// POST /api/auth/register — creates a Supabase Auth user + profile row.
// Password storage is handled entirely by Supabase Auth.
export async function POST(req: NextRequest) {
  try {
    // Rate-limit by IP: 10 signups per hour per IP.
    const ip = getClientIp(req) ?? "unknown";
    const rl = await checkRateLimit("register", ip, 10, 60 * 60);
    if (rl) return rl;

    const raw = await req.json().catch(() => null);
    if (!raw) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = registerSchema.parse(raw);
    const { email, password, full_name, org_code } = parsed;

    const admin = createAdminClient();

    // Email uniqueness check (profile table is the source of truth).
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      // Duplicate-email responses are enumerable; throttle them hard (3/hr/IP).
      const rlDup = await checkRateLimit("register-dup", ip, 3, 60 * 60);
      if (rlDup) return rlDup;
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Org code resolution — users joining an org require approval.
    let orgId: string | null = null;
    let approvalStatus: "pending" | "approved" = "approved";

    if (org_code) {
      const { data: org } = await admin
        .from("organizations")
        .select("id")
        .eq("org_code", org_code)
        .maybeSingle();

      if (!org) {
        // Throttle org-code guessing separately from normal signups (5/hr/IP).
        const rlOrg = await checkRateLimit("register-orgcode", ip, 5, 60 * 60);
        if (rlOrg) return rlOrg;
        return NextResponse.json(
          { error: "Invalid organization code" },
          { status: 404 }
        );
      }
      orgId = org.id;
      approvalStatus = "pending";
    }

    // Create the Supabase Auth user (password stored by Supabase).
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError || !authData.user) {
      console.error("[register] createUser error:", authError);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    const userId = authData.user.id;

    // Create profile row.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        id: userId,
        email,
        full_name,
        role: "user",
        org_id: orgId,
        approval_status: approvalStatus,
        is_active: true,
      })
      .select()
      .single();

    if (profileError || !profile) {
      await admin.auth.admin.deleteUser(userId);
      console.error("[register] profile insert error:", profileError);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    // Audit (best-effort).
    await admin.from("audit_logs").insert({
      user_id: userId,
      action: "register",
      resource_type: "auth",
      details: { approval_status: approvalStatus, org_code: org_code ?? null },
      org_id: orgId,
      ip_address: ip,
    });

    // Permit.io sync (best-effort).
    await syncUserToPermit(userId, email, "user", orgId);

    return NextResponse.json(
      {
        user: profile,
        pending: approvalStatus === "pending",
        message:
          approvalStatus === "pending"
            ? "Account created. Your request to join the organization is pending approval."
            : undefined,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    console.error("[register] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
