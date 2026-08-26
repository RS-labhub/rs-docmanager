// Clears ALL data from Supabase tables. DESTRUCTIVE.
// Usage: bunx tsx scripts/clear-data.ts [--yes]
import * as dotenv from "dotenv";
import * as path from "path";
import * as readline from "readline";
import postgres from "postgres";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || "";

if (!SUPABASE_URL || !DB_PASSWORD) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD must be set in .env");
  process.exit(1);
}

const PROJECT_REF = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");

// Order matters for foreign key dependencies — delete children first
const TABLES_IN_DELETE_ORDER = [
  "audit_logs",
  "ai_actions",
  "ai_agents",
  "ai_api_keys",
  "document_passwords",
  "document_comments",
  "documents",
  "profiles",
  "organizations",
];

async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
    });
  });
}

async function main() {
  const skipConfirm = process.argv.includes("--yes");

  console.log("");
  console.log("    AI DocManager — CLEAR ALL DATA");
  console.log("  Project: " + PROJECT_REF);
  console.log("");
  console.log("  ⚠️  WARNING: This will DELETE ALL DATA from:");
  for (const table of TABLES_IN_DELETE_ORDER) {
    console.log(`      • ${table}`);
  }
  console.log("");

  if (!skipConfirm) {
    const confirmed = await askConfirmation("  Type 'yes' to confirm deletion: ");
    if (!confirmed) {
      console.log("\n  Aborted. No data was deleted.\n");
      process.exit(0);
    }
  }

  // Connect
  const regions = [
    "ap-south-1", "us-east-1", "us-west-1", "us-west-2",
    "eu-west-1", "eu-west-2", "eu-central-1",
    "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
  ];

  const connectionCandidates: string[] = [
    `postgresql://postgres:${DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  ];
  for (const region of regions) {
    connectionCandidates.push(
      `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
    );
  }

  console.log("\n  Connecting...");

  let sql: ReturnType<typeof postgres> | null = null;
  for (const connStr of connectionCandidates) {
    const candidate = postgres(connStr, { ssl: "require", connect_timeout: 8, idle_timeout: 5, max: 1 });
    try {
      await candidate`SELECT 1`;
      sql = candidate;
      console.log("  [OK] Connected");
      break;
    } catch {
      await candidate.end().catch(() => {});
    }
  }

  if (!sql) {
    console.error("\n  [FAIL] Could not connect to database.");
    process.exit(1);
  }

  console.log("\n  Clearing data...\n");

  let deleted = 0;
  let failed = 0;

  // Step 1: delete auth.users first — cascades to profiles and all child tables.
  console.log("  Step 1: Clearing Supabase Auth users (cascades to profiles & children)...\n");
  try {
    const authCountResult = await sql`SELECT COUNT(*) as cnt FROM auth.users`;
    const authCount = parseInt(authCountResult[0]?.cnt || "0", 10);
    await sql`DELETE FROM auth.users`;
    console.log(`  ✅ auth.users: ${authCount} rows deleted (cascaded to profiles & all children)`);
    deleted += authCount;
  } catch (err: any) {
    console.log(`  ⚠️  auth.users: ${err.message?.slice(0, 80) || "could not clear"}`);
    console.log("  Falling back to deleting profiles directly...\n");
  }

  // Step 2: Clean up remaining tables (some may already be empty from cascade)
  console.log("\n  Step 2: Cleaning up remaining tables...\n");
  for (const table of TABLES_IN_DELETE_ORDER) {
    try {
      // Get count before deletion
      const countResult = await sql.unsafe(`SELECT COUNT(*) as cnt FROM ${table}`);
      const count = parseInt(countResult[0]?.cnt || "0", 10);

      if (count === 0) {
        console.log(`  ✅ ${table}: already empty`);
        continue;
      }

      // Delete all rows
      await sql.unsafe(`DELETE FROM ${table}`);
      console.log(`  ✅ ${table}: ${count} rows deleted`);
      deleted += count;
    } catch (err: any) {
      console.log(`  ❌ ${table}: ${err.message?.slice(0, 60) || "error"}`);
      failed++;
    }
  }

  console.log("\n  ────────────────────────────────");
  console.log(`  Total deleted: ${deleted} rows`);
  console.log(`  Tables processed: ${TABLES_IN_DELETE_ORDER.length + 1}`);
  if (failed > 0) console.log(`  Failed: ${failed}`);

  console.log("");

  await sql.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
