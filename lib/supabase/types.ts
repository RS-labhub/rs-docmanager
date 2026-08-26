// Database type definitions — mirrors the Supabase schema.
export type UserRole = "god" | "super_admin" | "admin" | "user";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  org_code: string;
  description: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  org_id: string | null;
  approval_status: ApprovalStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DocumentStatus = "draft" | "published" | "archived" | "under_review";

export type Document = {
  id: string;
  ref_number: number;
  title: string;
  content: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  file_size: number;
  owner_id: string;
  org_id: string;
  is_public: boolean;
  tags: string[];
  classification: "general" | "confidential" | "internal" | "public" | "organization";
  access_level: "view_only" | "comment" | "edit" | "full_access";
  is_password_protected: boolean;
  version: number;
  status: DocumentStatus;
  reviewers: string[];
  referenced_docs: string[];
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentComment = {
  id: string;
  document_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentPassword = {
  id: string;
  document_id: string;
  password_hash: string;
  set_by: string;
  created_at: string;
  updated_at: string;
}

export type AiApiKey = {
  id: string;
  user_id: string;
  provider: "groq" | "openai" | "anthropic";
  encrypted_key: string;
  iv: string;
  auth_tag: string;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AiAgent = {
  id: string;
  name: string;
  description: string;
  role: "assistant" | "analyzer" | "editor" | "admin";
  capabilities: string[];
  org_id: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AiAction = {
  id: string;
  agent_id: string;
  action_type: string;
  resource_type: string;
  resource_id: string;
  status: "pending" | "approved" | "rejected" | "completed" | "failed";
  requested_by: string;
  approved_by: string | null;
  rejected_by: string | null;
  metadata: Record<string, any>;
  result: any;
  org_id: string;
  created_at: string;
  updated_at: string;
}

export type AuditLog = {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, any>;
  org_id: string | null;
  ip_address: string | null;
  created_at: string;
}

// Notion-style pages

export type PageVisibility =
  | "private"
  | "org"
  | "role"
  | "restricted"
  | "public_link";

export type PagePermission = "view" | "comment" | "edit" | "full_access";

export type Page = {
  id: string;
  // NULL for personal pages — users with no organization can still create pages.
  org_id: string | null;
  owner_id: string;
  parent_id: string | null;
  title: string;
  emoji: string | null;
  cover_url: string | null;
  cover_storage: string | null;
  // BlockNote document, stored as JSONB and opaque on the client.
  content: unknown[];
  markdown_cache: string;
  visibility: PageVisibility;
  // Only meaningful when visibility = 'role'.
  min_role: UserRole | null;
  is_archived: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export type PageShare = {
  id: string;
  page_id: string;
  user_id: string;
  permission: PagePermission;
  granted_by: string;
  created_at: string;
  updated_at: string;
}

export type PageInvite = {
  id: string;
  page_id: string;
  invitee_email: string | null;
  invitee_user_id: string | null;
  permission: PagePermission;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_by: string | null;
  created_at: string;
}

// Supabase-compatible Database type. supabase-js v2.95+ requires Row/Insert/Update
// to extend Record<string, unknown>; use {} not Record<string, never> for empty Views/Functions.
export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Partial<Organization>;
        Update: Partial<Organization>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      documents: {
        Row: Document;
        Insert: Partial<Document>;
        Update: Partial<Document>;
        Relationships: [];
      };
      ai_api_keys: {
        Row: AiApiKey;
        Insert: Partial<AiApiKey>;
        Update: Partial<AiApiKey>;
        Relationships: [];
      };
      ai_agents: {
        Row: AiAgent;
        Insert: Partial<AiAgent>;
        Update: Partial<AiAgent>;
        Relationships: [];
      };
      ai_actions: {
        Row: AiAction;
        Insert: Partial<AiAction>;
        Update: Partial<AiAction>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Partial<AuditLog>;
        Update: Partial<AuditLog>;
        Relationships: [];
      };
      document_comments: {
        Row: DocumentComment;
        Insert: Partial<DocumentComment>;
        Update: Partial<DocumentComment>;
        Relationships: [];
      };
      document_passwords: {
        Row: DocumentPassword;
        Insert: Partial<DocumentPassword>;
        Update: Partial<DocumentPassword>;
        Relationships: [];
      };
      pages: {
        Row: Page;
        Insert: Partial<Page>;
        Update: Partial<Page>;
        Relationships: [];
      };
      page_shares: {
        Row: PageShare;
        Insert: Partial<PageShare>;
        Update: Partial<PageShare>;
        Relationships: [];
      };
      page_invites: {
        Row: PageInvite;
        Insert: Partial<PageInvite>;
        Update: Partial<PageInvite>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      user_role: UserRole;
      page_visibility: PageVisibility;
      page_permission: PagePermission;
    };
    CompositeTypes: {};
  };
}
