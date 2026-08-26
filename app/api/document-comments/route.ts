import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/auth/require";
import { createCommentSchema } from "@/lib/schemas";
import { isAtLeast } from "@/lib/permissions";
import type { UserRole } from "@/lib/supabase/types";
import { ZodError, z } from "zod";

export const runtime = "nodejs";

const docIdSchema = z.string().uuid();

async function canAccessDocument(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  documentId: string,
  userId: string,
  userRole: UserRole,
  userOrgId: string | null
): Promise<boolean> {
  const { data: doc } = await supabase
    .from("documents")
    .select("org_id, owner_id, is_public")
    .eq("id", documentId)
    .single();
  if (!doc) return false;
  if (userRole === "god") return true;
  if (doc.org_id !== userOrgId) return false;
  if (doc.is_public || doc.owner_id === userId) return true;
  // Admin+ can access non-public docs in their org
  return isAtLeast(userRole, "admin");
}

// GET comments
export const GET = withAuth(async (authed, req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const documentId = docIdSchema.parse(searchParams.get("documentId"));

    const supabase = await createServerClient();
    const ok = await canAccessDocument(
      supabase,
      documentId,
      authed.id,
      authed.profile.role as UserRole,
      authed.profile.org_id
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: comments, error } = await supabase
      .from("document_comments")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[comments GET]", error);
      return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
    }

    const userIds = [...new Set((comments ?? []).map((c: any) => c.user_id))];
    let profiles: any[] = [];
    if (userIds.length > 0) {
      // Admin client: we've already authorized the caller's access to the document; exposing commenter names/avatars on that document is intentional and RLS would block cross-user profile reads.
      const admin = createAdminClient();
      const { data } = await admin
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      profiles = data ?? [];
    }

    const enriched = (comments ?? []).map((c: any) => {
      const p = profiles.find((x) => x.id === c.user_id);
      return {
        ...c,
        user_name: p?.full_name ?? "Unknown",
        user_avatar: p?.avatar_url ?? null,
      };
    });

    return NextResponse.json({ comments: enriched });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("[comments GET] error:", err);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
});

// POST
export const POST = withAuth(async (authed, req: NextRequest) => {
  try {
    const raw = await req.json();
    const { documentId, content, parentId } = createCommentSchema.parse(raw);

    const supabase = await createServerClient();
    const ok = await canAccessDocument(
      supabase,
      documentId,
      authed.id,
      authed.profile.role as UserRole,
      authed.profile.org_id
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // If a parent comment is specified it must belong to the same doc.
    if (parentId) {
      const { data: parent } = await supabase
        .from("document_comments")
        .select("document_id")
        .eq("id", parentId)
        .single();
      if (!parent || parent.document_id !== documentId) {
        return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from("document_comments")
      .insert({
        document_id: documentId,
        user_id: authed.id,
        content,
        parent_id: parentId ?? null,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("[comments POST]", error);
      return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
    }

    return NextResponse.json({
      comment: {
        ...data,
        user_name: authed.profile.full_name,
        user_avatar: authed.profile.avatar_url,
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    console.error("[comments POST] error:", err);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
});

// DELETE
export const DELETE = withAuth(async (authed, req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const commentId = z.string().uuid().parse(searchParams.get("id"));

    const supabase = await createServerClient();
    const { data: comment } = await supabase
      .from("document_comments")
      .select("user_id, document_id")
      .eq("id", commentId)
      .single();

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const isAuthor = comment.user_id === authed.id;
    let canModerate = false;

    if (!isAuthor && isAtLeast(authed.profile.role as UserRole, "admin")) {
      // Moderator override only within the same org (god always allowed).
      const { data: parentDoc } = await supabase
        .from("documents")
        .select("org_id")
        .eq("id", comment.document_id)
        .single();
      if (parentDoc) {
        canModerate =
          authed.profile.role === "god" ||
          parentDoc.org_id === authed.profile.org_id;
      }
    }

    if (!isAuthor && !canModerate) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("document_comments")
      .delete()
      .eq("id", commentId);
    if (error) {
      console.error("[comments DELETE]", error);
      return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("[comments DELETE] error:", err);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
});
