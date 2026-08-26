// Zod schemas for request validation. All API routes should parse
// bodies/queries through one of these instead of raw req.json().
import { z } from "zod";

export const uuid = z.string().uuid();
export const email = z.string().email().max(254).toLowerCase().trim();

// Auth
export const loginSchema = z.object({
  email,
  password: z.string().min(8).max(128),
});

export const registerSchema = z.object({
  email,
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(200).trim(),
  org_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,16}$/, "Organization code must be 4-16 alphanumeric characters")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// Documents
export const createDocumentSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  content: z.string().max(2_000_000).default(""),
  is_public: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(30).optional(),
});

export const updateDocumentSchema = createDocumentSchema.partial();

export const deleteDocumentSchema = z.object({
  documentId: uuid,
});

export const reparseDocumentSchema = z.object({
  documentId: uuid,
});

// Document comments
export const createCommentSchema = z.object({
  documentId: uuid,
  content: z.string().min(1).max(4000).trim(),
  parentId: uuid.optional().nullable(),
});

// Document passwords
export const setDocumentPasswordSchema = z.object({
  documentId: uuid,
  password: z.string().regex(/^\d{9}$/, "Password must be exactly 9 digits"),
});

export const verifyDocumentPasswordSchema = z.object({
  documentId: uuid,
  password: z.string().regex(/^\d{9}$/),
});

// AI keys
export const aiProvider = z.enum(["groq", "openai", "anthropic"]);

export const createAiKeySchema = z.object({
  provider: aiProvider,
  api_key: z.string().min(8).max(500),
  label: z.string().max(100).optional(),
});

// AI actions
export const aiActionSchema = z.object({
  action: z.enum([
    "summarize",
    "analyze",
    "improve",
    "generate",
    "extract_keywords",
    "translate",
    "qa",
  ]),
  title: z.string().max(300).optional(),
  content: z.string().max(200_000).optional(),
  // Provider is required — picking the wrong key silently is a footgun,
  // and `undefined` gets dropped from supabase filters, returning a
  // random active key.
  provider: aiProvider,
  question: z.string().max(2000).optional(),
});

// Uploads
export const uploadDocumentQuerySchema = z.object({
  documentId: uuid.optional(),
});

export const documentFileQuerySchema = z.object({
  documentId: uuid,
});

// Pages
export const pageVisibilitySchema = z.enum([
  "private",
  "org",
  "role",
  "restricted",
  "public_link",
]);

export const pagePermissionSchema = z.enum([
  "view",
  "comment",
  "edit",
  "full_access",
]);

export const userRoleSchema = z.enum(["god", "super_admin", "admin", "user"]);

// BlockNote document — opaque on the server; we only bound size/shape.
export const blockTreeSchema = z
  .array(z.unknown())
  .max(5000, "Page is too large");

export const createPageSchema = z.object({
  title: z.string().min(1).max(200).trim().default("Untitled"),
  emoji: z.string().max(16).nullable().optional(),
  parent_id: uuid.nullable().optional(),
  content: blockTreeSchema.optional(),
  markdown_cache: z.string().max(2_000_000).optional(),
  visibility: pageVisibilitySchema.default("org"),
  min_role: userRoleSchema.nullable().optional(),
  cover_url: z.string().url().max(2048).nullable().optional(),
});

export const updatePageSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  emoji: z.string().max(16).nullable().optional(),
  content: blockTreeSchema.optional(),
  markdown_cache: z.string().max(2_000_000).optional(),
  visibility: pageVisibilitySchema.optional(),
  min_role: userRoleSchema.nullable().optional(),
  cover_url: z.string().url().max(2048).nullable().optional(),
  is_archived: z.boolean().optional(),
});

export const upsertShareSchema = z.object({
  user_id: uuid,
  permission: pagePermissionSchema,
});

export const importPageSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  markdown: z.string().min(1).max(2_000_000),
  visibility: pageVisibilitySchema.default("org"),
});
