// GET /api/users/by-email — resolves an email to a user_id for the share dialog. Requires auth, scoped to the caller's org (god sees all), rate-limited.
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { email as emailSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = withAuth(async (authed, req: NextRequest) => {
  const rl = await checkRateLimit("user-lookup", authed.id, 30, 60);
  if (rl) return rl;

  const url = new URL(req.url);
  const raw = url.searchParams.get("email");
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("profiles")
    .select("id, email, full_name, avatar_url, org_id, is_active, approval_status")
    .eq("email", parsed.data)
    .limit(1);

  // Non-god callers can only resolve members of their own org.
  if (authed.profile.role !== "god") {
    if (!authed.profile.org_id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    query = query.eq("org_id", authed.profile.org_id);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[GET /api/users/by-email]", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!data.is_active || data.approval_status !== "approved") {
    return NextResponse.json({ error: "User is not active" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      avatar_url: data.avatar_url,
    },
  });
});
