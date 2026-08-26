import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/auth/require";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  setDocumentPasswordSchema,
  verifyDocumentPasswordSchema,
} from "@/lib/schemas";
import { isAtLeast } from "@/lib/permissions";
import { issueUnlockCookie } from "@/lib/document-unlock";
import type { UserRole } from "@/lib/supabase/types";
import { ZodError, z } from "zod";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// Same logic as document-comments — can this user even touch this document?
async function canAccessDocument(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  documentId: string,
  userId: string,
  role: UserRole,
  orgId: string | null
): Promise<{ ok: boolean; doc?: { owner_id: string; org_id: string | null; is_public: boolean } }> {
  const { data: doc } = await supabase
    .from("documents")
    .select("owner_id, org_id, is_public")
    .eq("id", documentId)
    .single();
  if (!doc) return { ok: false };
  if (role === "god") return { ok: true, doc };
  if (doc.org_id !== orgId) return { ok: false };
  if (doc.is_public || doc.owner_id === userId) return { ok: true, doc };
  return { ok: isAtLeast(role, "admin"), doc };
}

// scrypt hashing. Format: "scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>"
const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 32;

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const hash = Buffer.from(hashHex, "hex");
  const candidate = scryptSync(password, salt, hash.length, {
    N: parseInt(nStr, 10),
    r: parseInt(rStr, 10),
    p: parseInt(pStr, 10),
  });
  if (candidate.length !== hash.length) return false;
  return timingSafeEqual(candidate, hash);
}

// SET or UPDATE password.
export const POST = withAuth(async (authed, req: NextRequest) => {
  try {
    const raw = await req.json();
    const { documentId, password } = setDocumentPasswordSchema.parse(raw);

    const supabase = await createServerClient();
    const { data: doc } = await supabase
      .from("documents")
      .select("owner_id, org_id")
      .eq("id", documentId)
      .single();
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Only the document owner can set the password (the whole point — this protects documents even from admins).
    if (doc.owner_id !== authed.id) {
      return NextResponse.json(
        { error: "Only the document owner can set a password" },
        { status: 403 }
      );
    }

    const hash = hashPassword(password);

    // `document_passwords` has no authenticated-role RLS policy — service role only. ACL is enforced just above.
    const admin = createAdminClient();
    const { error } = await admin
      .from("document_passwords")
      .upsert(
        { document_id: documentId, password_hash: hash, set_by: authed.id },
        { onConflict: "document_id" }
      );
    if (error) {
      console.error("[doc-password POST]", error);
      return NextResponse.json({ error: "Failed to set password" }, { status: 500 });
    }

    await supabase
      .from("documents")
      .update({ is_password_protected: true })
      .eq("id", documentId);

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "document_password_set",
      resource_type: "document",
      resource_id: documentId,
      org_id: doc.org_id,
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    console.error("[doc-password POST] error:", err);
    return NextResponse.json({ error: "Failed to set password" }, { status: 500 });
  }
});

// VERIFY password.
export const PUT = withAuth(async (authed, req: NextRequest) => {
  try {
    const raw = await req.json();
    const { documentId, password } = verifyDocumentPasswordSchema.parse(raw);

    // Rate-limit brute force: 10 attempts / 15 min per (user, document) pair, plus 30 / 15 min globally per user across all docs.
    const rl1 = await checkRateLimit(
      "doc-password-verify-doc",
      `${authed.id}:${documentId}`,
      10,
      15 * 60
    );
    if (rl1) return rl1;
    const rl2 = await checkRateLimit(
      "doc-password-verify-user",
      authed.id,
      30,
      15 * 60
    );
    if (rl2) return rl2;

    const supabase = await createServerClient();

    // Require that the caller is allowed to even access the document.
    const access = await canAccessDocument(
      supabase,
      documentId,
      authed.id,
      authed.profile.role as UserRole,
      authed.profile.org_id
    );
    if (!access.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // document_passwords is service-role-only at the DB layer.
    const admin = createAdminClient();
    const { data } = await admin
      .from("document_passwords")
      .select("password_hash")
      .eq("document_id", documentId)
      .single();

    if (!data) {
      return NextResponse.json({ error: "No password set" }, { status: 404 });
    }

    const valid = verifyPassword(password, data.password_hash);

    // A successful verify unlocks server-side reads for 30 minutes.
    if (valid) {
      await issueUnlockCookie(documentId, authed.id);
    }

    if (!valid) {
      await supabase.from("audit_logs").insert({
        user_id: authed.id,
        action: "document_password_verify_failed",
        resource_type: "document",
        resource_id: documentId,
        org_id: access.doc?.org_id ?? null,
        details: {},
      });
    }

    return NextResponse.json({ valid });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    console.error("[doc-password PUT] error:", err);
    return NextResponse.json({ error: "Failed to verify password" }, { status: 500 });
  }
});

// REMOVE password.
export const DELETE = withAuth(async (authed, req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const documentId = z.string().uuid().parse(searchParams.get("documentId"));

    const supabase = await createServerClient();
    const { data: doc } = await supabase
      .from("documents")
      .select("owner_id, org_id")
      .eq("id", documentId)
      .single();

    if (!doc || doc.owner_id !== authed.id) {
      return NextResponse.json(
        { error: "Only the document owner can remove the password" },
        { status: 403 }
      );
    }

    // document_passwords is service-role-only at the DB layer.
    const admin = createAdminClient();
    await admin.from("document_passwords").delete().eq("document_id", documentId);
    await supabase
      .from("documents")
      .update({ is_password_protected: false })
      .eq("id", documentId);

    await supabase.from("audit_logs").insert({
      user_id: authed.id,
      action: "document_password_removed",
      resource_type: "document",
      resource_id: documentId,
      org_id: doc.org_id,
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("[doc-password DELETE] error:", err);
    return NextResponse.json({ error: "Failed to remove password" }, { status: 500 });
  }
});
