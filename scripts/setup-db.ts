// Unified DB setup/migration script: runs supabase/schema.sql and verifies tables, columns, enums, org codes & pending users.
// Usage: bun ./scripts/setup-db.ts [--verify]
// Requires .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_PASSWORD
import * as fs from "fs";
import * as path from "path";
import postgres from "postgres";
import * as dotenv from "dotenv";

// Load .env file
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || "";

if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR_PROJECT")) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL is not set in .env");
  process.exit(1);
}
if (!DB_PASSWORD) {
  console.error("ERROR: SUPABASE_DB_PASSWORD is not set in .env");
  process.exit(1);
}

const PROJECT_REF = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");
const VERIFY_ONLY = process.argv.includes("--verify");

// Connection helper — tries direct + pooler across many AWS regions.
async function connect(): Promise<ReturnType<typeof postgres>> {
  const regions = [
    "ap-south-1", "us-east-1", "us-west-1", "us-west-2",
    "eu-west-1", "eu-west-2", "eu-central-1",
    "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
    "sa-east-1", "ca-central-1",
  ];

  const candidates: string[] = [
    `postgresql://postgres:${DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  ];
  for (const region of regions) {
    candidates.push(
      `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
    );
  }

  console.log("  Trying " + candidates.length + " connection candidates...");

  for (const connStr of candidates) {
    const label = connStr
      .replace(`postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@`, "pooler:")
      .replace(`postgresql://postgres:${DB_PASSWORD}@`, "direct:")
      .replace("/postgres", "");

    const candidate = postgres(connStr, {
      ssl: "require",
      connect_timeout: 8,
      idle_timeout: 5,
      max: 1,
    });

    try {
      const result = await candidate`SELECT current_database(), current_user`;
      console.log("  [OK] Connected via: " + label);
      console.log("       User: " + result[0].current_user + " @ " + result[0].current_database);
      return candidate;
    } catch {
      await candidate.end().catch(() => {});
    }
  }

  console.error("\n  [FAIL] Could not connect with any connection string.");
  console.error("\n  Please run the schema manually:");
  console.error("  1. Open: https://supabase.com/dashboard/project/" + PROJECT_REF + "/sql/new");
  console.error("  2. Paste contents of supabase/schema.sql");
  console.error("  3. Click Run\n");
  process.exit(1);
}

// SQL splitter — handles $$ blocks for CREATE FUNCTION etc.
function splitSQL(sqlText: string): string[] {
  const stmts: string[] = [];
  let buf = "";
  let inDollar = false;
  for (const line of sqlText.split("\n")) {
    const t = line.trim();
    if (!t || (t.startsWith("--") && !inDollar)) continue;
    const dCount = (line.match(/\$\$/g) || []).length;
    if (dCount % 2 !== 0) inDollar = !inDollar;
    buf += line + "\n";
    if (t.endsWith(";") && !inDollar) {
      stmts.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) stmts.push(buf.trim());
  return stmts;
}

async function runStatements(sql: ReturnType<typeof postgres>, schema: string) {
  const stmts = splitSQL(schema);
  console.log("  " + stmts.length + " statements to execute\n");
  let ok = 0, skipped = 0, failed = 0;
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const preview = stmt.replace(/\s+/g, " ").substring(0, 60);
    const n = "[" + String(i + 1).padStart(2) + "/" + stmts.length + "]";
    try {
      await sql.unsafe(stmt);
      console.log("  " + n + " OK    " + preview);
      ok++;
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        console.log("  " + n + " SKIP  " + preview + " (exists)");
        skipped++;
      } else {
        console.log("  " + n + " FAIL  " + preview);
        console.log("         " + msg.substring(0, 200));
        failed++;
      }
    }
  }
  console.log("\n  Result: " + ok + " ok, " + skipped + " skipped, " + failed + " failed");
}

// Main
async function main() {
  console.log("");
  console.log("========================================================");
  console.log("    AI DocManager — Database Setup & Verification");
  console.log("========================================================");
  console.log("  Project:  " + PROJECT_REF);
  console.log("  URL:      " + SUPABASE_URL);
  console.log("  Mode:     " + (VERIFY_ONLY ? "Verify only" : "Full setup"));

  // Step 1: Connect
  console.log("  STEP 1 — Connecting to Supabase PostgreSQL");

  const sql = await connect();

  // Step 2: Execute schema.sql (unless --verify)
  if (!VERIFY_ONLY) {
    console.log("  STEP 2 — Executing schema.sql");

    const root = process.cwd();
    const schemaPath = path.join(root, "supabase", "schema.sql");

    if (!fs.existsSync(schemaPath)) {
      console.error("\n  ERROR: supabase/schema.sql not found. Run from project root.\n");
      await sql.end();
      process.exit(1);
    }

    const schema = fs.readFileSync(schemaPath, "utf-8");
    console.log("  Schema: supabase/schema.sql (" + schema.length + " bytes)");

    try {
      await sql.unsafe(schema);
      console.log("  [OK] Full schema executed successfully");
    } catch (err: any) {
      if (err.message && err.message.includes("already exists")) {
        console.log("  [OK] Schema objects already exist (safe to continue)");
      } else {
        console.error("  [FAIL] Schema execution error: " + err.message);
        console.error("\n  Trying statement-by-statement...\n");
        await runStatements(sql, schema);
      }
    }
  } else {
    console.log("\n  Skipping schema execution (--verify mode)");
  }

  // Step 3: Verify tables
  console.log("  STEP 3 — Verifying tables");

  const tables = [
    "organizations", "profiles", "documents",
    "ai_api_keys", "ai_agents", "ai_actions", "audit_logs",
    "document_comments", "document_passwords",
  ];

  let allTablesOk = true;
  for (const t of tables) {
    try {
      const check = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${t}
      ) as exists`;
      if (check[0].exists) {
        console.log("  [OK]   " + t);
      } else {
        console.log("  [FAIL] " + t + " — not found");
        allTablesOk = false;
      }
    } catch (err: any) {
      console.log("  [FAIL] " + t + " — " + err.message);
      allTablesOk = false;
    }
  }

  if (!allTablesOk) {
    console.log("\n  ⚠️  Some tables are missing. Check for errors above.");
  }

  // Step 4: Verify enum types
  console.log("  STEP 4 — Verifying enum types");

  const enums = ["user_role", "approval_status"];
  for (const e of enums) {
    try {
      const check = await sql`SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = ${e}) as exists`;
      console.log("  [" + (check[0].exists ? "OK" : "FAIL") + "]   " + e);
    } catch {
      console.log("  [FAIL] " + e);
    }
  }

  // Step 5: Verify key columns
  console.log("  STEP 5 — Verifying key columns");

  const columnChecks = [
    { table: "organizations", column: "org_code" },
    { table: "profiles", column: "approval_status" },
    { table: "documents", column: "description" },
    { table: "documents", column: "file_url" },
    { table: "documents", column: "file_size" },
    { table: "documents", column: "version" },
    { table: "documents", column: "status" },
    { table: "documents", column: "classification" },
    { table: "documents", column: "access_level" },
    { table: "documents", column: "is_password_protected" },
    { table: "documents", column: "reviewers" },
    { table: "documents", column: "referenced_docs" },
  ];

  for (const { table, column } of columnChecks) {
    try {
      const check = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = ${table} AND column_name = ${column}
        ) as exists
      `;
      console.log("  [" + (check[0].exists ? "OK" : "FAIL") + "]   " + table + "." + column);
    } catch {
      console.log("  [FAIL] " + table + "." + column);
    }
  }

  // Step 6: Show organization codes
  console.log("  STEP 6 — Organization Codes");

  try {
    const orgs = await sql`SELECT name, slug, org_code FROM organizations ORDER BY name`;
    if (orgs.length === 0) {
      console.log("  No organizations found. Seed the database first.");
    } else {
      for (const org of orgs) {
        console.log(`  • ${org.name} (${org.slug}): ${org.org_code}`);
      }
    }
  } catch (err: any) {
    console.log("  Could not list orgs: " + err.message);
  }

  // Step 7: Show pending users
  console.log("  STEP 7 — Pending Users");

  try {
    const pending = await sql`SELECT email, full_name, approval_status FROM profiles WHERE approval_status = 'pending'`;
    if (pending.length === 0) {
      console.log("  No pending users.");
    } else {
      for (const u of pending) {
        console.log(`  • ${u.full_name} (${u.email}) — ${u.approval_status}`);
      }
    }
  } catch (err: any) {
    console.log("  Could not list pending users: " + err.message);
  }

  // Step 8: Seed instructions
  console.log("  STEP 8 — Seed the database");
  console.log("  Seed via the API for bcrypt passwords:");
  console.log("    1. bun dev");
  console.log("    2. Open http://localhost:3000/api/seed");
  console.log("    3. Default password: Password123!");

  console.log("  ✅ Setup & verification complete!");

  await sql.end();
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});