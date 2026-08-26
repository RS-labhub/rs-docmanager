"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Document } from "@/lib/supabase/types";
import { requireUser, requireRole, AuthError } from "@/lib/auth/require";
import { hasValidUnlock } from "@/lib/document-unlock";
import { hasPermission, RESOURCES, ACTIONS } from "@/lib/permissions";
import {
  createDocumentSchema,
  updateDocumentSchema,
} from "@/lib/schemas";
import { ZodError } from "zod";

// Document server actions — identity derived from session, never from client arguments. RLS enforces org-scoping at the DB level.
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

// Gets documents for the current user (org-scoped).
export async function getDocuments(): Promise<Document[]> {
  try {
    const authed = await requireUser();
    const supabase = await createServerClient();

    if (!authed.profile.org_id) return [];

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("org_id", authed.profile.org_id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[getDocuments]", error);
      return [];
    }

    // Show public docs + user's own private docs
    return (data || []).filter(
      (doc) => doc.is_public || doc.owner_id === authed.id
    );
  } catch {
    return [];
  }
}

// Gets all org documents (admins).
export async function getAllOrgDocuments(): Promise<Document[]> {
  try {
    const authed = await requireRole("admin");
    if (!authed.profile.org_id) return [];

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("org_id", authed.profile.org_id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[getAllOrgDocuments]", error);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

// Gets all documents across all orgs (god only).
export async function getAllDocuments(): Promise<Document[]> {
  try {
    await requireRole("god");
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[getAllDocuments]", error);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

// Gets a single document.
export async function getDocument(id: string): Promise<Document | null> {
  try {
    const authed = await requireUser();
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;

    // Authorization: must be same org (god bypass), and either public, the owner, or at least admin.
    if (authed.profile.role !== "god") {
      if (data.org_id !== authed.profile.org_id) return null;
      if (!data.is_public && data.owner_id !== authed.id) {
        const canRead = hasPermission(
          authed.profile.role,
          ACTIONS.READ,
          RESOURCES.DOCUMENT,
          {
            ownerId: data.owner_id,
            userId: authed.id,
            orgId: data.org_id,
            userOrgId: authed.profile.org_id ?? undefined,
          }
        );
        if (!canRead) return null;
      }
    }

    // Password protection is enforced server-side: non-owners (god exempt)
    // get redacted content until they verify via /api/document-password.
    if (
      data.is_password_protected &&
      data.owner_id !== authed.id &&
      authed.profile.role !== "god"
    ) {
      const unlocked = await hasValidUnlock(data.id, authed.id);
      if (!unlocked) {
        return { ...data, content: "", file_url: null };
      }
    }

    return data;
  } catch {
    return null;
  }
}

// Creates a document.

export async function createDocument(payload: {
  title: string;
  content: string;
  is_public: boolean;
  tags?: string[];
}): Promise<{ success: boolean; document?: Document; error?: string }> {
  try {
    const authed = await requireUser();
    const parsed = createDocumentSchema.parse(payload);

    if (!authed.profile.org_id) {
      return { success: false, error: "You must belong to an organization to create documents" };
    }

    const allowed = hasPermission(
      authed.profile.role,
      ACTIONS.CREATE,
      RESOURCES.DOCUMENT,
      { userId: authed.id, userOrgId: authed.profile.org_id }
    );
    if (!allowed) {
      return { success: false, error: "You do not have permission to create documents" };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        title: parsed.title,
        content: parsed.content,
        is_public: parsed.is_public,
        tags: parsed.tags ?? [],
        owner_id: authed.id,
        org_id: authed.profile.org_id,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("[createDocument]", error);
      return { success: false, error: "Failed to create document" };
    }

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "create",
      resource_type: "document",
      resource_id: data.id,
      details: { title: data.title },
      org_id: authed.profile.org_id,
    });

    revalidatePath("/dashboard/documents");
    return { success: true, document: data };
  } catch (err) {
    return errorResult(err, "Failed to create document");
  }
}

// Updates a document.

export async function updateDocument(
  id: string,
  payload: { title: string; content: string; is_public: boolean; tags?: string[] }
): Promise<{ success: boolean; document?: Document; error?: string }> {
  try {
    const authed = await requireUser();
    const parsed = updateDocumentSchema.parse({ id, ...payload });
    const supabase = await createServerClient();

    // Fetch for ownership + org check
    const { data: existing } = await supabase
      .from("documents")
      .select("owner_id, org_id")
      .eq("id", id)
      .single();

    if (!existing) return { success: false, error: "Document not found" };

    const allowed = hasPermission(
      authed.profile.role,
      ACTIONS.UPDATE,
      RESOURCES.DOCUMENT,
      {
        ownerId: existing.owner_id,
        userId: authed.id,
        orgId: existing.org_id,
        userOrgId: authed.profile.org_id ?? undefined,
      }
    );
    if (!allowed) return { success: false, error: "Forbidden" };

    const { data, error } = await supabase
      .from("documents")
      .update({
        title: parsed.title,
        content: parsed.content,
        is_public: parsed.is_public,
        tags: parsed.tags ?? [],
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("[updateDocument]", error);
      return { success: false, error: "Failed to update document" };
    }

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "update",
      resource_type: "document",
      resource_id: id,
      details: { title: data.title },
      org_id: data.org_id,
    });

    revalidatePath("/dashboard/documents");
    revalidatePath(`/dashboard/documents/${id}`);
    return { success: true, document: data };
  } catch (err) {
    return errorResult(err, "Failed to update document");
  }
}

// Deletes a document.

export async function deleteDocument(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const authed = await requireUser();
    const supabase = await createServerClient();

    const { data: doc } = await supabase
      .from("documents")
      .select("owner_id, org_id, title")
      .eq("id", id)
      .single();

    if (!doc) return { success: false, error: "Document not found" };

    const allowed = hasPermission(
      authed.profile.role,
      ACTIONS.DELETE,
      RESOURCES.DOCUMENT,
      {
        ownerId: doc.owner_id,
        userId: authed.id,
        orgId: doc.org_id,
        userOrgId: authed.profile.org_id ?? undefined,
      }
    );
    if (!allowed) return { success: false, error: "Forbidden" };

    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) {
      console.error("[deleteDocument]", error);
      return { success: false, error: "Failed to delete document" };
    }

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "delete",
      resource_type: "document",
      resource_id: id,
      details: { title: doc.title },
      org_id: doc.org_id,
    });

    revalidatePath("/dashboard/documents");
    return { success: true };
  } catch (err) {
    return errorResult(err, "Failed to delete document");
  }
}
