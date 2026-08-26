// Server-side unlock tokens for password-protected documents.
// A successful password verify issues a short-lived HMAC cookie; reads of
// protected documents require it. Without this the lock is client-side only.
import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const UNLOCK_TTL_MS = 30 * 60 * 1000;

function getSecret(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not set");
  return key;
}

function sign(documentId: string, userId: string, expiresAt: number): string {
  return createHmac("sha256", getSecret())
    .update(`${documentId}:${userId}:${expiresAt}`)
    .digest("hex");
}

export function cookieNameFor(documentId: string): string {
  return `doc_unlock_${documentId}`;
}

export async function issueUnlockCookie(documentId: string, userId: string) {
  const expiresAt = Date.now() + UNLOCK_TTL_MS;
  const token = `${expiresAt}.${sign(documentId, userId, expiresAt)}`;
  const store = await cookies();
  store.set(cookieNameFor(documentId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
  });
}

export async function hasValidUnlock(
  documentId: string,
  userId: string
): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(cookieNameFor(documentId))?.value;
  if (!raw) return false;

  const dot = raw.indexOf(".");
  if (dot === -1) return false;
  const expiresAt = Number(raw.slice(0, dot));
  const mac = raw.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = sign(documentId, userId, expiresAt);
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
