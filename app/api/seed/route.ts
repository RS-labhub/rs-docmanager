import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual, randomBytes } from "crypto";

export const runtime = "nodejs";

// Random per-run password, returned once in the seed response.
const DEFAULT_PASSWORD = `Seed-${randomBytes(9).toString("base64url")}`;

function checkSecret(req: NextRequest): boolean {
  const expected = process.env.SEED_SECRET;
  if (!expected) return false;
  const provided = req.headers.get("x-seed-token") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Seeds the database with demo data. Requires x-seed-token header matching SEED_SECRET; refuses to run if any profile already exists.
export async function POST(req: NextRequest) {
  // Refuse in production unless explicitly opted-in.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PROD_SEED !== "true"
  ) {
    return NextResponse.json(
      { error: "Seeding is disabled in production" },
      { status: 403 }
    );
  }

  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();

    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    if (existingProfiles && existingProfiles.length > 0) {
      return NextResponse.json(
        { message: "Database already seeded." },
        { status: 409 }
      );
    }

    // Organizations
    const orgs = [
      { id: "00000000-0000-0000-0000-000000000001", name: "Acme Corporation", slug: "acme", org_code: "ACME2026", description: "The Acme Corporation — makers of everything" },
      { id: "00000000-0000-0000-0000-000000000002", name: "Globex Industries", slug: "globex", org_code: "GLOBEX01", description: "Globex — pushing the boundaries of innovation" },
      { id: "00000000-0000-0000-0000-000000000003", name: "Initech Labs", slug: "initech", org_code: "INIT3CHX", description: "Initech — enterprise solutions" },
    ];

    const { error: orgErr } = await supabase.from("organizations").insert(orgs);
    if (orgErr) throw new Error(`Org insert failed: ${orgErr.message}`);

    //Profiles 
    const profiles = [
      { id: "10000000-0000-0000-0000-000000000001", email: "god@system.local", full_name: "System God", role: "god" as const, org_id: null, is_active: true },
      { id: "20000000-0000-0000-0000-000000000001", email: "superadmin@acme.com", full_name: "Alice Wong", role: "super_admin" as const, org_id: "00000000-0000-0000-0000-000000000001", is_active: true },
      { id: "20000000-0000-0000-0000-000000000002", email: "superadmin@globex.com", full_name: "Bob Martinez", role: "super_admin" as const, org_id: "00000000-0000-0000-0000-000000000002", is_active: true },
      { id: "30000000-0000-0000-0000-000000000001", email: "admin@acme.com", full_name: "Carol Chen", role: "admin" as const, org_id: "00000000-0000-0000-0000-000000000001", is_active: true },
      { id: "30000000-0000-0000-0000-000000000002", email: "admin@globex.com", full_name: "David Kim", role: "admin" as const, org_id: "00000000-0000-0000-0000-000000000002", is_active: true },
      { id: "30000000-0000-0000-0000-000000000003", email: "admin@initech.com", full_name: "Eve Johnson", role: "admin" as const, org_id: "00000000-0000-0000-0000-000000000003", is_active: true },
      { id: "40000000-0000-0000-0000-000000000001", email: "user1@acme.com", full_name: "Frank Lee", role: "user" as const, org_id: "00000000-0000-0000-0000-000000000001", is_active: true },
      { id: "40000000-0000-0000-0000-000000000002", email: "user2@acme.com", full_name: "Grace Park", role: "user" as const, org_id: "00000000-0000-0000-0000-000000000001", is_active: true },
      { id: "40000000-0000-0000-0000-000000000003", email: "user1@globex.com", full_name: "Hank Wilson", role: "user" as const, org_id: "00000000-0000-0000-0000-000000000002", is_active: true },
      { id: "40000000-0000-0000-0000-000000000004", email: "user1@initech.com", full_name: "Ivy Nguyen", role: "user" as const, org_id: "00000000-0000-0000-0000-000000000003", is_active: true },
    ];

    // Create Supabase Auth users. Password is managed by Supabase Auth.
    for (const p of profiles) {
      const { error: authErr } = await supabase.auth.admin.createUser({
        id: p.id,
        email: p.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: p.full_name },
      });
      if (authErr) {
        throw new Error(`Auth user creation failed for ${p.email}: ${authErr.message}`);
      }
    }

    const { error: profileErr } = await supabase.from("profiles").insert(profiles);
    if (profileErr) throw new Error(`Profile insert failed: ${profileErr.message}`);

    // Documents
    const docs = [
      {
        title: "Getting Started Guide",
        content: "Welcome to the AI Document Management System.",
        owner_id: "20000000-0000-0000-0000-000000000001",
        org_id: "00000000-0000-0000-0000-000000000001",
        is_public: true,
        tags: ["guide", "onboarding"],
      },
      {
        title: "Security Policy",
        content: "Role-based access control, organization isolation, audit logging.",
        owner_id: "20000000-0000-0000-0000-000000000001",
        org_id: "00000000-0000-0000-0000-000000000001",
        is_public: false,
        tags: ["security", "policy"],
      },
      {
        title: "Product Roadmap Q1 2026",
        content: "Enhanced AI parsing, multi-org support, real-time collaboration.",
        owner_id: "30000000-0000-0000-0000-000000000001",
        org_id: "00000000-0000-0000-0000-000000000001",
        is_public: false,
        tags: ["roadmap", "planning"],
      },
      {
        title: "Globex Innovation Brief",
        content: "Globex pioneers next-generation AI integration for enterprise workflows.",
        owner_id: "20000000-0000-0000-0000-000000000002",
        org_id: "00000000-0000-0000-0000-000000000002",
        is_public: true,
        tags: ["innovation", "brief"],
      },
      {
        title: "Initech Compliance Report",
        content: "Annual compliance report covering GDPR, SOC2, and ISO 27001.",
        owner_id: "30000000-0000-0000-0000-000000000003",
        org_id: "00000000-0000-0000-0000-000000000003",
        is_public: false,
        tags: ["compliance", "report"],
      },
    ];

    const { error: docErr } = await supabase.from("documents").insert(docs);
    if (docErr) throw new Error(`Document insert failed: ${docErr.message}`);

    // AI Agents
    const agents: Array<{
      name: string
      description: string
      role: "assistant" | "analyzer" | "editor" | "admin"
      capabilities: string[]
      org_id: string
      created_by: string
      is_active: boolean
    }> = [
      {
        name: "Document Assistant",
        description: "Helps with document organization, summarization, and basic tasks",
        role: "assistant",
        capabilities: ["read_documents", "suggest_edits", "summarize_content"],
        org_id: "00000000-0000-0000-0000-000000000001",
        created_by: "20000000-0000-0000-0000-000000000001",
        is_active: true,
      },
      {
        name: "Content Editor",
        description: "AI that can edit and improve document content with suggestions",
        role: "editor",
        capabilities: ["read_documents", "edit_documents", "generate_content"],
        org_id: "00000000-0000-0000-0000-000000000001",
        created_by: "20000000-0000-0000-0000-000000000001",
        is_active: true,
      },
      {
        name: "Document Analyzer",
        description: "Analyzes document content and provides deep insights",
        role: "analyzer",
        capabilities: ["read_documents", "analyze_content", "summarize_content"],
        org_id: "00000000-0000-0000-0000-000000000002",
        created_by: "20000000-0000-0000-0000-000000000002",
        is_active: true,
      },
    ];

    const { error: agentErr } = await supabase.from("ai_agents").insert(agents);
    if (agentErr) throw new Error(`Agent insert failed: ${agentErr.message}`);

    return NextResponse.json({
      success: true,
      message: "Database seeded successfully",
      data: {
        organizations: orgs.length,
        profiles: profiles.length,
        documents: docs.length,
        agents: agents.length,
        defaultPassword: DEFAULT_PASSWORD,
      },
    });
  } catch (err) {
    console.error("[seed] error:", err);
    return NextResponse.json(
      { error: "Seed failed" },
      { status: 500 }
    );
  }
}
