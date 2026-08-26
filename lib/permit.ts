// Permit.io integration for fine-grained access control, layered on top
// of the local RBAC (lib/permissions.ts). Calls the Permit.io PDP to
// evaluate configured RBAC/ABAC policies.
import { Permit } from "permitio";
import type { UserRole } from "./supabase/types";

const permit = new Permit({
  pdp: process.env.PERMIT_PDP_URL || "https://cloudpdp.api.permit.io",
  token: process.env.PERMIT_SDK_TOKEN || "",
});


export type PermitResource =
  | "document"
  | "user"
  | "organization"
  | "ai_key"
  | "audit_log"
  | "ai_agent";

export type PermitAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "ai_action"
  | "change_role"
  | "manage";

// Checks if a user is permitted to perform an action on a resource via
// the Permit.io PDP. Falls back to local RBAC if the PDP is unavailable.
export async function checkPermission(
  userId: string,
  action: PermitAction,
  resource: PermitResource,
  context?: Record<string, unknown>
): Promise<boolean> {
  // Permit.io is a secondary/optional layer; primary checks are hasPermission()
  // (lib/permissions.ts) + RLS. No token configured means "no opinion".
  if (!process.env.PERMIT_SDK_TOKEN) {
    return true;
  }

  try {
    const permitted = await permit.check(
      userId,
      action,
      { type: resource, ...(context || {}) }
    );
    return permitted;
  } catch (error) {
    console.error("[Permit] Permission check failed (fail-closed):", error);
    // Fail CLOSED on PDP errors — deny instead of allow.
    return false;
  }
}

// Bulk check — checks multiple permissions, returns a map of "action:resource" → boolean.
export async function checkPermissions(
  userId: string,
  checks: Array<{ action: PermitAction; resource: PermitResource }>
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  await Promise.all(
    checks.map(async ({ action, resource }) => {
      const key = `${action}:${resource}`;
      results[key] = await checkPermission(userId, action, resource);
    })
  );

  return results;
}

// Syncs a user to Permit.io on register or role change so the PDP knows their role.
export async function syncUserToPermit(
  userId: string,
  email: string,
  role: UserRole,
  orgId?: string | null
): Promise<void> {
  try {
    if (!process.env.PERMIT_SDK_TOKEN) return;

    // Sync user to Permit
    await permit.api.syncUser({
      key: userId,
      email,
      attributes: {
        role,
        org_id: orgId || null,
      },
    });

    // Assign role in Permit (tenant = org or "global")
    const tenant = orgId || "global";
    await permit.api.assignRole({
      user: userId,
      role: role,
      tenant: tenant,
    });

    console.log(`[Permit] Synced user ${email} as ${role} in tenant ${tenant}`);
  } catch (error) {
    console.error("[Permit] Failed to sync user:", error);
    // Non-fatal — local RBAC still works
  }
}

// Removes a user from Permit.io when they are deleted.
export async function removeUserFromPermit(userId: string): Promise<void> {
  try {
    if (!process.env.PERMIT_SDK_TOKEN) return;
    await permit.api.deleteUser(userId);
    console.log(`[Permit] Removed user ${userId}`);
  } catch (error) {
    console.error("[Permit] Failed to remove user:", error);
  }
}

// Updates a user's role in Permit.io when it changes.
export async function updateUserRoleInPermit(
  userId: string,
  oldRole: UserRole,
  newRole: UserRole,
  orgId?: string | null
): Promise<void> {
  try {
    if (!process.env.PERMIT_SDK_TOKEN) return;

    const tenant = orgId || "global";

    // Unassign old role
    try {
      await permit.api.unassignRole({
        user: userId,
        role: oldRole,
        tenant: tenant,
      });
    } catch {
      // May not exist — ignore
    }

    // Assign new role
    await permit.api.assignRole({
      user: userId,
      role: newRole,
      tenant: tenant,
    });

    console.log(`[Permit] Updated user ${userId} role: ${oldRole} → ${newRole}`);
  } catch (error) {
    console.error("[Permit] Failed to update role:", error);
  }
}

export async function canReadDocument(userId: string): Promise<boolean> {
  return checkPermission(userId, "read", "document");
}

export async function canCreateDocument(userId: string): Promise<boolean> {
  return checkPermission(userId, "create", "document");
}

export async function canUpdateDocument(userId: string): Promise<boolean> {
  return checkPermission(userId, "update", "document");
}

export async function canDeleteDocument(userId: string): Promise<boolean> {
  return checkPermission(userId, "delete", "document");
}

export async function canPerformAiAction(userId: string): Promise<boolean> {
  return checkPermission(userId, "ai_action", "document");
}

export async function canManageUsers(userId: string): Promise<boolean> {
  return checkPermission(userId, "manage", "user");
}

export async function canManageOrganization(userId: string): Promise<boolean> {
  return checkPermission(userId, "manage", "organization");
}

export async function canViewAuditLogs(userId: string): Promise<boolean> {
  return checkPermission(userId, "read", "audit_log");
}

export { permit };
