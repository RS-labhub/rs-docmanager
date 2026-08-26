"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type {
  Profile,
  UserRole,
  Organization,
  ApprovalStatus,
} from "@/lib/supabase/types";
import {
  syncUserToPermit,
  removeUserFromPermit,
  updateUserRoleInPermit,
} from "@/lib/permit";
import {
  requireUser,
  requireRole,
  AuthError,
} from "@/lib/auth/require";
import {
  hasPermission,
  isAtLeast,
  outranks,
  RESOURCES,
  ACTIONS,
} from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { z } from "zod";

// Best-effort client IP for rate-limiting server actions (headers are forwarded by Next).
async function serverActionIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    return h.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// Admin server actions — identity, role and org are always derived from the authenticated session; client arguments only describe what to change.
function errorResult(err: unknown, fallback = "An error occurred") {
  if (err instanceof AuthError) {
    const status = err.response.status;
    if (status === 401) return { success: false, error: "Not authenticated" };
    if (status === 403) return { success: false, error: "Forbidden" };
  }
  if (err instanceof ZodError) {
    return { success: false, error: err.issues[0]?.message ?? "Invalid input" };
  }
  if (err instanceof Error) return { success: false, error: err.message || fallback };
  return { success: false, error: fallback };
}

// Generates a random 8-character alphanumeric organization code.
function generateOrgCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function getOrganizations(): Promise<Organization[]> {
  try {
    const authed = await requireUser();
    const supabase = await createServerClient();

    // god: see all. Others: only their own org.
    let query = supabase.from("organizations").select("*").order("name");
    if (authed.profile.role !== "god") {
      if (!authed.profile.org_id) return [];
      query = query.eq("id", authed.profile.org_id);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[getOrganizations]", error);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

export async function getOrganization(id: string): Promise<Organization | null> {
  try {
    const authed = await requireUser();
    if (authed.profile.role !== "god" && authed.profile.org_id !== id) {
      return null;
    }
    const supabase = await createServerClient();
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", id)
      .single();
    return data;
  } catch {
    return null;
  }
}

const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(500).optional(),
  org_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,16}$/).optional(),
});

export async function createOrganization(
  payload: z.infer<typeof createOrgSchema>
): Promise<{ success: boolean; org?: Organization; error?: string }> {
  try {
    // Creating new orgs is a god-level action.
    const authed = await requireRole("god");
    const parsed = createOrgSchema.parse(payload);
    const supabase = await createServerClient();

    const orgCode = (parsed.org_code || generateOrgCode()).toUpperCase();

    const { data, error } = await supabase
      .from("organizations")
      .insert({
        name: parsed.name,
        slug: parsed.slug,
        org_code: orgCode,
        description: parsed.description || null,
        logo_url: null,
      })
      .select()
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to create organization" };
    }

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "create",
      resource_type: "organization",
      resource_id: data.id,
      details: { name: data.name },
    });

    revalidatePath("/god");
    return { success: true, org: data };
  } catch (err) {
    return errorResult(err, "Failed to create organization");
  }
}

const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
});

export async function updateOrganization(
  id: string,
  payload: z.infer<typeof updateOrgSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    const authed = await requireRole("super_admin");
    if (authed.profile.role !== "god" && authed.profile.org_id !== id) {
      return { success: false, error: "Cross-org access denied" };
    }
    const parsed = updateOrgSchema.parse(payload);
    const supabase = await createServerClient();

    const { error } = await supabase
      .from("organizations")
      .update(parsed)
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "update",
      resource_type: "organization",
      resource_id: id,
      details: parsed,
      org_id: id,
    });

    revalidatePath("/god");
    return { success: true };
  } catch (err) {
    return errorResult(err, "Failed to update organization");
  }
}

export async function deleteOrganization(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const authed = await requireRole("god");
    const supabase = await createServerClient();

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", id)
      .single();

    if (!org) return { success: false, error: "Organization not found" };

    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "delete",
      resource_type: "organization",
      resource_id: id,
      details: { name: org.name },
    });

    revalidatePath("/god");
    return { success: true };
  } catch (err) {
    return errorResult(err, "Failed to delete organization");
  }
}

export async function getUsers(orgId?: string): Promise<Profile[]> {
  try {
    const authed = await requireRole("admin");
    const supabase = await createServerClient();

    let query = supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    // Non-god callers restricted to their own org regardless of `orgId` arg.
    if (authed.profile.role !== "god") {
      if (!authed.profile.org_id) return [];
      query = query.eq("org_id", authed.profile.org_id);
    } else if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[getUsers]", error);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

export async function getAllUsers(): Promise<Profile[]> {
  try {
    await requireRole("god");
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function getUser(id: string): Promise<Profile | null> {
  try {
    const authed = await requireUser();
    const supabase = await createServerClient();

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (!data) return null;

    // Self, admin+ in same org, or god
    if (data.id === authed.id) return data;
    if (authed.profile.role === "god") return data;
    if (
      isAtLeast(authed.profile.role, "admin") &&
      data.org_id === authed.profile.org_id
    ) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  full_name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(["god", "super_admin", "admin", "user"]),
  org_id: z.string().uuid().nullable(),
});

export async function createUser(
  payload: z.infer<typeof createUserSchema>
): Promise<{ success: boolean; user?: Profile; error?: string }> {
  try {
    const authed = await requireRole("admin");
    const parsed = createUserSchema.parse(payload);

    // Non-god users: can only create users in their own org, and cannot create users with a role >= their own.
    if (authed.profile.role !== "god") {
      if (parsed.org_id !== authed.profile.org_id) {
        return { success: false, error: "Cannot create users in other organizations" };
      }
      if (!outranks(authed.profile.role, parsed.role)) {
        return { success: false, error: "Cannot create users with equal or higher privileges" };
      }
    }

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", parsed.email)
      .maybeSingle();
    if (existing) {
      return { success: false, error: "Email already in use" };
    }

    // Create Supabase Auth user (password managed by Supabase).
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.full_name },
    });
    if (authErr || !authData.user) {
      return { success: false, error: authErr?.message || "Failed to create user" };
    }
    const userId = authData.user.id;

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .insert({
        id: userId,
        email: parsed.email,
        full_name: parsed.full_name,
        role: parsed.role,
        org_id: parsed.org_id,
        is_active: true,
        approval_status: "approved" as ApprovalStatus,
      })
      .select()
      .single();

    if (profileErr || !profile) {
      await admin.auth.admin.deleteUser(userId);
      return { success: false, error: profileErr?.message || "Failed to create profile" };
    }

    await admin.from("audit_logs").insert({
      user_id: authed.id,
      action: "create_user",
      resource_type: "user",
      resource_id: userId,
      details: { email: parsed.email, role: parsed.role },
      org_id: parsed.org_id,
    });

    await syncUserToPermit(userId, parsed.email, parsed.role, parsed.org_id);

    revalidatePath("/dashboard/users");
    revalidatePath("/god");
    return { success: true, user: profile };
  } catch (err) {
    return errorResult(err, "Failed to create user");
  }
}

export async function updateUserRole(
  userId: string,
  newRole: UserRole
): Promise<{ success: boolean; error?: string }> {
  try {
    const authed = await requireRole("super_admin");
    const supabase = await createServerClient();

    const { data: target } = await supabase
      .from("profiles")
      .select("role, org_id, email")
      .eq("id", userId)
      .single();

    if (!target) return { success: false, error: "User not found" };

    // Cannot change own role; cannot set a role equal or higher than own.
    if (userId === authed.id) return { success: false, error: "Cannot change your own role" };
    if (authed.profile.role !== "god") {
      if (target.org_id !== authed.profile.org_id) {
        return { success: false, error: "Cross-org access denied" };
      }
      if (!outranks(authed.profile.role, newRole)) {
        return { success: false, error: "Cannot assign a role equal or higher than your own" };
      }
      if (!outranks(authed.profile.role, target.role as UserRole)) {
        return { success: false, error: "Cannot modify users at or above your privilege level" };
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) return { success: false, error: error.message };

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "update_role",
      resource_type: "user",
      resource_id: userId,
      details: { old_role: target.role, new_role: newRole },
      org_id: target.org_id,
    });

    await updateUserRoleInPermit(userId, target.role as UserRole, newRole, target.org_id);

    revalidatePath("/dashboard/users");
    revalidatePath("/god");
    return { success: true };
  } catch (err) {
    return errorResult(err, "Failed to update role");
  }
}

export async function updateUserOrg(
  userId: string,
  orgId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const authed = await requireRole("god");
    const supabase = await createServerClient();

    const { error } = await supabase
      .from("profiles")
      .update({ org_id: orgId })
      .eq("id", userId);

    if (error) return { success: false, error: error.message };

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "update_org",
      resource_type: "user",
      resource_id: userId,
      details: { new_org_id: orgId },
    });

    revalidatePath("/dashboard/users");
    revalidatePath("/god");
    return { success: true };
  } catch (err) {
    return errorResult(err, "Failed to update organization");
  }
}

export async function toggleUserActive(
  userId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const authed = await requireRole("admin");
    const supabase = await createServerClient();

    if (userId === authed.id) {
      return { success: false, error: "Cannot disable your own account" };
    }

    const { data: target } = await supabase
      .from("profiles")
      .select("role, org_id")
      .eq("id", userId)
      .single();
    if (!target) return { success: false, error: "User not found" };

    if (authed.profile.role !== "god") {
      if (target.org_id !== authed.profile.org_id) {
        return { success: false, error: "Cross-org access denied" };
      }
      if (!outranks(authed.profile.role, target.role as UserRole)) {
        return { success: false, error: "Cannot modify users at or above your privilege level" };
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", userId);

    if (error) return { success: false, error: error.message };

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: isActive ? "activate_user" : "deactivate_user",
      resource_type: "user",
      resource_id: userId,
      details: {},
      org_id: target.org_id,
    });

    revalidatePath("/dashboard/users");
    revalidatePath("/god");
    return { success: true };
  } catch (err) {
    return errorResult(err, "Failed to update user");
  }
}

export async function deleteUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const authed = await requireRole("admin");

    if (userId === authed.id) {
      return { success: false, error: "Cannot delete your own account" };
    }

    const admin = createAdminClient();

    const { data: target } = await admin
      .from("profiles")
      .select("role, org_id, email")
      .eq("id", userId)
      .single();
    if (!target) return { success: false, error: "User not found" };

    if (authed.profile.role !== "god") {
      if (target.org_id !== authed.profile.org_id) {
        return { success: false, error: "Cross-org access denied" };
      }
      if (!outranks(authed.profile.role, target.role as UserRole)) {
        return { success: false, error: "Cannot delete users at or above your privilege level" };
      }
    }

    // Deleting the auth user cascades the profile row via FK.
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) {
      return { success: false, error: authErr.message };
    }
    // Belt & braces: if cascade didn't fire, remove profile explicitly.
    await admin.from("profiles").delete().eq("id", userId);

    await admin.from("audit_logs").insert({
      user_id: authed.id,
      action: "delete_user",
      resource_type: "user",
      resource_id: userId,
      details: { email: target.email },
      org_id: target.org_id,
    });

    await removeUserFromPermit(userId);

    revalidatePath("/dashboard/users");
    revalidatePath("/god");
    return { success: true };
  } catch (err) {
    return errorResult(err, "Failed to delete user");
  }
}

export async function getAuditLogs(orgId?: string, limit = 100) {
  try {
    const authed = await requireRole("admin");
    const supabase = await createServerClient();

    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 500));

    if (authed.profile.role !== "god") {
      if (!authed.profile.org_id) return [];
      query = query.eq("org_id", authed.profile.org_id);
    } else if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function getOrgStats(orgId: string) {
  try {
    const authed = await requireRole("admin");
    if (authed.profile.role !== "god" && authed.profile.org_id !== orgId) {
      return { userCount: 0, documentCount: 0, agentCount: 0 };
    }
    const supabase = await createServerClient();

    const [users, docs, agents] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("ai_agents").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);

    return {
      userCount: users.count || 0,
      documentCount: docs.count || 0,
      agentCount: agents.count || 0,
    };
  } catch {
    return { userCount: 0, documentCount: 0, agentCount: 0 };
  }
}

export async function getGlobalStats() {
  try {
    await requireRole("god");
    const supabase = await createServerClient();

    const [orgs, users, docs, agents] = await Promise.all([
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("documents").select("id", { count: "exact", head: true }),
      supabase.from("ai_agents").select("id", { count: "exact", head: true }),
    ]);

    return {
      orgCount: orgs.count || 0,
      userCount: users.count || 0,
      documentCount: docs.count || 0,
      agentCount: agents.count || 0,
    };
  } catch {
    return { orgCount: 0, userCount: 0, documentCount: 0, agentCount: 0 };
  }
}

export async function getPendingUsers(orgId?: string): Promise<Profile[]> {
  try {
    const authed = await requireRole("admin");
    const supabase = await createServerClient();

    let query = supabase
      .from("profiles")
      .select("*")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false });

    if (authed.profile.role !== "god") {
      if (!authed.profile.org_id) return [];
      query = query.eq("org_id", authed.profile.org_id);
    } else if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[getPendingUsers]", error);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

export async function approveUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const authed = await requireRole("admin");
    const supabase = await createServerClient();

    const { data: target } = await supabase
      .from("profiles")
      .select("email, org_id, approval_status")
      .eq("id", userId)
      .single();

    if (!target) return { success: false, error: "User not found" };
    if (target.approval_status !== "pending") {
      return { success: false, error: "User is not pending approval" };
    }
    if (
      authed.profile.role !== "god" &&
      target.org_id !== authed.profile.org_id
    ) {
      return { success: false, error: "Cross-org access denied" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({ approval_status: "approved" })
      .eq("id", userId);
    if (error) return { success: false, error: error.message };

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "approve_membership",
      resource_type: "user",
      resource_id: userId,
      details: { email: target.email },
      org_id: target.org_id,
    });

    revalidatePath("/dashboard/users");
    revalidatePath("/god");
    return { success: true };
  } catch (err) {
    return errorResult(err, "Failed to approve user");
  }
}

export async function rejectUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const authed = await requireRole("admin");
    const supabase = await createServerClient();

    const { data: target } = await supabase
      .from("profiles")
      .select("email, org_id, approval_status")
      .eq("id", userId)
      .single();

    if (!target) return { success: false, error: "User not found" };
    if (target.approval_status !== "pending") {
      return { success: false, error: "User is not pending approval" };
    }
    if (
      authed.profile.role !== "god" &&
      target.org_id !== authed.profile.org_id
    ) {
      return { success: false, error: "Cross-org access denied" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({ approval_status: "rejected" })
      .eq("id", userId);
    if (error) return { success: false, error: error.message };

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "reject_membership",
      resource_type: "user",
      resource_id: userId,
      details: { email: target.email },
      org_id: target.org_id,
    });

    revalidatePath("/dashboard/users");
    revalidatePath("/god");
    return { success: true };
  } catch (err) {
    return errorResult(err, "Failed to reject user");
  }
}

export async function getOrganizationByCode(
  orgCode: string
): Promise<Organization | null> {
  // Public-ish: called by register/join flows. Rate-limit aggressively to prevent org-code enumeration.
  try {
    // 20 probes per IP per hour.
    const ip = await serverActionIp();
    const rl = await checkRateLimit("org-code-lookup", ip, 20, 60 * 60);
    if (rl) return null;

    const parsed = z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4,16}$/)
      .parse(orgCode);

    // Use admin client because unauthenticated callers may use this on the pre-join flow. Only return minimal non-sensitive fields.
    const admin = createAdminClient();
    const { data } = await admin
      .from("organizations")
      .select("id, name, slug, description, logo_url, org_code")
      .eq("org_code", parsed)
      .single();
    return data as Organization | null;
  } catch {
    return null;
  }
}

export async function regenerateOrgCode(
  orgId: string
): Promise<{ success: boolean; org_code?: string; error?: string }> {
  try {
    const authed = await requireRole("super_admin");
    if (authed.profile.role !== "god" && authed.profile.org_id !== orgId) {
      return { success: false, error: "Cross-org access denied" };
    }
    const supabase = await createServerClient();
    const newCode = generateOrgCode();

    const { error } = await supabase
      .from("organizations")
      .update({ org_code: newCode })
      .eq("id", orgId);

    if (error) return { success: false, error: error.message };

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "regenerate_org_code",
      resource_type: "organization",
      resource_id: orgId,
      details: { new_code: newCode },
      org_id: orgId,
    });

    revalidatePath("/god");
    return { success: true, org_code: newCode };
  } catch (err) {
    return errorResult(err, "Failed to regenerate code");
  }
}

// The caller joins an org by code; identity comes from the session, not the client.
export async function joinOrganization(
  orgCode: string
): Promise<{ success: boolean; error?: string; orgName?: string }> {
  try {
    const authed = await requireUser();

    // Rate-limit join attempts: 10 per user per hour, 30 per IP per hour.
    const rlUser = await checkRateLimit("org-join-user", authed.id, 10, 60 * 60);
    if (rlUser) return { success: false, error: "Too many attempts. Try again later." };
    const ip = await serverActionIp();
    const rlIp = await checkRateLimit("org-join-ip", ip, 30, 60 * 60);
    if (rlIp) return { success: false, error: "Too many attempts. Try again later." };

    const parsed = z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4,16}$/, "Organization code must be 4-16 alphanumeric characters")
      .parse(orgCode);

    const supabase = await createServerClient();

    if (authed.profile.org_id) {
      return { success: false, error: "You already belong to an organization." };
    }

    // Admin client used here because RLS on organizations does not permit cross-org reads; the code itself is the secret.
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("id, name")
      .eq("org_code", parsed)
      .single();

    if (!org) {
      return { success: false, error: "Invalid organization code." };
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ org_id: org.id, approval_status: "pending" as ApprovalStatus })
      .eq("id", authed.id);

    if (updateError) {
      return { success: false, error: "Failed to join organization." };
    }

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "join_organization_request",
      resource_type: "organization",
      resource_id: org.id,
      details: { org_code: parsed, org_name: org.name },
      org_id: org.id,
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/users");
    return { success: true, orgName: org.name };
  } catch (err) {
    return errorResult(err, "Failed to join organization");
  }
}

const createOrgAndAdminSchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  orgCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,16}$/).optional(),
  adminEmail: z.string().trim().toLowerCase().email().max(254),
  adminPassword: z.string().min(12).max(128),
});

export async function createOrgAndSuperAdmin(
  payload: z.infer<typeof createOrgAndAdminSchema>
): Promise<{ success: boolean; org?: Organization; user?: Profile; error?: string }> {
  try {
    const authed = await requireRole("god");
    const parsed = createOrgAndAdminSchema.parse(payload);
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("profiles")
      .select("id, org_id")
      .eq("email", parsed.adminEmail)
      .maybeSingle();

    if (existing && existing.org_id) {
      return { success: false, error: "Email already associated with an organization" };
    }

    const orgCode = (parsed.orgCode || generateOrgCode()).toUpperCase();
    const slug = parsed.orgName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name: parsed.orgName,
        slug,
        org_code: orgCode,
        description: parsed.description || null,
      })
      .select()
      .single();

    if (orgErr || !org) {
      return { success: false, error: orgErr?.message || "Failed to create org" };
    }

    let userId: string;
    let profileData: Profile;
    const adminName = parsed.adminEmail.split("@")[0] || "Admin";

    if (existing) {
      userId = existing.id;
      const { data: updated, error: updateErr } = await admin
        .from("profiles")
        .update({
          role: "super_admin",
          org_id: org.id,
          approval_status: "approved",
          is_active: true,
        })
        .eq("id", userId)
        .select()
        .single();

      if (updateErr || !updated) {
        await admin.from("organizations").delete().eq("id", org.id);
        return { success: false, error: updateErr?.message || "Failed to update existing user profile" };
      }
      profileData = updated;
    } else {
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: parsed.adminEmail,
        password: parsed.adminPassword,
        email_confirm: true,
        user_metadata: { full_name: adminName },
      });

      if (authErr || !authData.user) {
        await admin.from("organizations").delete().eq("id", org.id);
        return { success: false, error: authErr?.message || "Failed to create auth user" };
      }

      userId = authData.user.id;

      const { data: profile, error: profileErr } = await admin
        .from("profiles")
        .insert({
          id: userId,
          email: parsed.adminEmail,
          full_name: adminName,
          role: "super_admin",
          org_id: org.id,
          is_active: true,
          approval_status: "approved",
        })
        .select()
        .single();

      if (profileErr || !profile) {
        await admin.auth.admin.deleteUser(userId);
        await admin.from("organizations").delete().eq("id", org.id);
        return { success: false, error: profileErr?.message || "Failed to create profile" };
      }
      profileData = profile;
    }

    await admin.from("audit_logs").insert([
      {
        user_id: authed.id,
        action: "create_org",
        resource_type: "organization",
        resource_id: org.id,
        details: { name: org.name },
      },
      {
        user_id: authed.id,
        action: "assign_super_admin",
        resource_type: "user",
        resource_id: userId,
        details: { email: profileData.email, role: profileData.role },
        org_id: org.id,
      },
    ]);

    await syncUserToPermit(userId, profileData.email, profileData.role, org.id);

    revalidatePath("/god");
    return { success: true, org, user: profileData };
  } catch (err) {
    return errorResult(err, "Failed to create org and admin");
  }
}
