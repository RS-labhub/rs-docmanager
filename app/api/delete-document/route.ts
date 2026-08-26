import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/auth/require";
import { deleteDocumentSchema } from "@/lib/schemas";
import { outranks } from "@/lib/permissions";
import type { UserRole } from "@/lib/supabase/types";
import { ZodError } from "zod";

export const runtime = "nodejs";

export const POST = withAuth(async (authed, req: NextRequest) => {
  try {
    const raw = await req.json();
    const { documentId } = deleteDocumentSchema.parse(raw);
    const supabase = await createServerClient();

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const isOwner = doc.owner_id === authed.id;

    if (!isOwner) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", doc.owner_id)
        .single();

      if (!ownerProfile) {
        return NextResponse.json(
          { error: "Cannot verify document owner" },
          { status: 403 }
        );
      }

      const callerRole = authed.profile.role as UserRole;
      if (callerRole === "god") {
        // God can delete public docs owned by others; private org docs are respected.
        if (!doc.is_public) {
          return NextResponse.json(
            { error: "God can only delete public documents owned by others" },
            { status: 403 }
          );
        }
      } else {
        // Admin+ can delete docs of users below them, in the same org.
        if (doc.org_id !== authed.profile.org_id) {
          return NextResponse.json({ error: "Cross-org access denied" }, { status: 403 });
        }
        if (!outranks(callerRole, ownerProfile.role as UserRole)) {
          return NextResponse.json(
            { error: "You don't have permission to delete this document" },
            { status: 403 }
          );
        }
      }
    }

    // ACL has passed — use the admin client for storage + cross-org ops. The `documents` bucket is RLS-locked to service_role and `audit_logs` has no insert policy for authenticated users.
    const admin = createAdminClient();

    // Delete storage file
    if (doc.file_url) {
      try {
        const parts = doc.file_url.split("/documents/");
        if (parts.length >= 2) {
          const storagePath = parts[parts.length - 1];
          await admin.storage.from("documents").remove([storagePath]);
        }
      } catch (storageErr) {
        console.error("[delete-document] storage non-fatal:", storageErr);
      }
    }

    // Only god can propagate a delete across all orgs (god-distribution artifacts). Everyone else deletes exactly the row they targeted.
    if (authed.profile.role === "god") {
      // Distributed copies share title, owner, AND content — title+owner alone could destroy unrelated same-named documents.
      let copyQuery = admin
        .from("documents")
        .select("id, file_url, org_id")
        .eq("title", doc.title)
        .eq("owner_id", doc.owner_id)
        .eq("content", doc.content);
      copyQuery = doc.file_url
        ? copyQuery.eq("file_url", doc.file_url)
        : copyQuery.is("file_url", null);
      const { data: allCopies } = await copyQuery;

      if (allCopies && allCopies.length > 1) {
        const urlsDeleted = new Set<string>();
        for (const copy of allCopies) {
          if (copy.file_url && !urlsDeleted.has(copy.file_url)) {
            urlsDeleted.add(copy.file_url);
            try {
              const parts = copy.file_url.split("/documents/");
              if (parts.length >= 2) {
                await admin.storage.from("documents").remove([parts[parts.length - 1]]);
              }
            } catch {
              /* silent */
            }
          }
        }

        const { error: deleteError } = await admin
          .from("documents")
          .delete()
          .in("id", allCopies.map((c) => c.id));

        if (deleteError) {
          console.error("[delete-document]", deleteError);
          return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
        }
      } else {
        const { error: deleteError } = await supabase
          .from("documents")
          .delete()
          .eq("id", documentId);

        if (deleteError) {
          console.error("[delete-document]", deleteError);
          return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
        }
      }
    } else {
      // Non-god callers only touch exactly the id they asked to delete.
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId);

      if (deleteError) {
        console.error("[delete-document]", deleteError);
        return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
      }
    }

    // audit_logs has no authenticated-role INSERT policy — must use admin.
    await admin.from("audit_logs").insert({
      user_id: authed.id,
      action: "delete",
      resource_type: "document",
      resource_id: documentId,
      details: { title: doc.title },
      org_id: doc.org_id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    console.error("[delete-document] error:", err);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
});
