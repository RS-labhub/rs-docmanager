// Server-side authorization helpers. Every API route / Server Action must
// start with one of these; identity comes from the Supabase cookie session,
// never the request body. On failure they throw a Response (see withAuth).
import "server-only";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isAtLeast } from "@/lib/permissions";
import type { Profile, UserRole } from "@/lib/supabase/types";

// A thrown NextResponse short-circuits the route.
export class AuthError extends Error {
  response: NextResponse;
  constructor(response: NextResponse) {
    super(`AuthError ${response.status}`);
    this.response = response;
  }
}

function unauthorized(msg = "Authentication required") {
  return new AuthError(NextResponse.json({ error: msg }, { status: 401 }));
}

function forbidden(msg = "Forbidden") {
  return new AuthError(NextResponse.json({ error: msg }, { status: 403 }));
}

export interface AuthedUser {
  id: string;
  email: string;
  profile: Profile;
}

// Resolves the caller from the cookie session. Throws AuthError(401) if
// unauthenticated, or 403 if inactive/pending/rejected.
export async function requireUser(): Promise<AuthedUser> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw unauthorized();
  }

  // User-scoped client so RLS is enforced (a user can read their own profile).
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    throw forbidden("Profile not found");
  }

  if (!profile.is_active) {
    throw forbidden("Account is disabled");
  }

  if (profile.approval_status === "pending") {
    throw forbidden("Account is pending approval");
  }

  if (profile.approval_status === "rejected") {
    throw forbidden("Account is rejected");
  }

  return {
    id: user.id,
    email: user.email ?? profile.email,
    profile: profile as Profile,
  };
}

// Like requireUser but enforces a minimum role tier.
export async function requireRole(min: UserRole): Promise<AuthedUser> {
  const authed = await requireUser();
  if (!isAtLeast(authed.profile.role, min)) {
    throw forbidden("Insufficient permissions");
  }
  return authed;
}

// Ensures the caller belongs to the given org, or is `god`.
export async function requireOrgAccess(orgId: string | null | undefined): Promise<AuthedUser> {
  const authed = await requireUser();
  if (authed.profile.role === "god") return authed;
  if (!orgId) throw forbidden("Missing org scope");
  if (authed.profile.org_id !== orgId) {
    throw forbidden("Cross-org access denied");
  }
  return authed;
}

type Handler<TArgs extends unknown[]> = (
  authed: AuthedUser,
  ...args: TArgs
) => Promise<Response> | Response;

// Wraps a route handler with auth + AuthError → Response conversion + error handling.
export function withAuth<TArgs extends unknown[]>(
  handler: Handler<TArgs>,
  opts: { role?: UserRole } = {}
) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      const authed = opts.role
        ? await requireRole(opts.role)
        : await requireUser();
      return await handler(authed, ...args);
    } catch (err) {
      if (err instanceof AuthError) return err.response;
      console.error("[withAuth] Unhandled route error:", err);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

export function getClientIp(req: Request): string | null {
  // x-real-ip is set by the hosting proxy and can't be spoofed by clients.
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  // In x-forwarded-for only the LAST entry is appended by the trusted proxy;
  // clients can prepend arbitrary values to defeat IP-keyed rate limits.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",");
    return parts[parts.length - 1]!.trim();
  }
  return null;
}
