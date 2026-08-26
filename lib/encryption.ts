// AES-256-GCM encryption for API keys — unique IV + auth tag per encryption.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;           // 128-bit IV
const AUTH_TAG_LENGTH = 16;     // 128-bit auth tag

let _cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  // Key must be exactly 32 bytes (256 bits) hex-encoded = 64 hex chars
  if (key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("ENCRYPTION_KEY must be valid hex (0-9, a-f)");
  }
  _cachedKey = Buffer.from(key, "hex");
  return _cachedKey;
}

// Validate the key at load time so misconfiguration fails fast (skipped in tests).
if (process.env.NODE_ENV !== "test" && typeof process.env.ENCRYPTION_KEY === "string") {
  try {
    getEncryptionKey();
  } catch (err) {
    throw new Error(`[encryption] Invalid ENCRYPTION_KEY: ${(err as Error).message}`);
  }
}

export interface EncryptedPayload {
  encrypted_key: string;   // hex-encoded ciphertext
  iv: string;              // hex-encoded IV
  auth_tag: string;        // hex-encoded auth tag
}

// Encrypt a plaintext API key with AES-256-GCM; returns IV + auth tag for DB storage.
export function encryptApiKey(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return {
    encrypted_key: encrypted,
    iv: iv.toString("hex"),
    auth_tag: authTag.toString("hex"),
  };
}

// Decrypt an API key; the auth tag check rejects tampered ciphertext.
export function decryptApiKey(payload: EncryptedPayload): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.auth_tag, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.encrypted_key, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// Generate a random 32-byte hex key for initial setup.
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}
