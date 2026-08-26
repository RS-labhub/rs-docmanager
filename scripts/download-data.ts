// Download all Supabase data to JSON files. Usage: bunx tsx scripts/download-data.ts
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import postgres from "postgres";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || "";

if (!SUPABASE_URL || !DB_PASSWORD) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD must be set in .env");
  process.exit(1);
}

const PROJECT_REF = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");

// All tables to export
const TABLES = [
  "organizations",
  "profiles",
  "documents",
  "document_comments",
  "document_passwords",
  "ai_api_keys",
  "ai_agents",
  "ai_actions",
  "audit_logs",
];

async function main() {
  console.log("");
  console.log("    AI DocManager — Download All Data");
  console.log("  Project: " + PROJECT_REF);

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

  // Create output directory
  const outputDir = path.join(process.cwd(), "data-export");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const exportDir = path.join(outputDir, `export-${timestamp}`);
  fs.mkdirSync(exportDir, { recursive: true });

  console.log(`\n  Output: ${exportDir}\n`);

  const summary: Record<string, number> = {};

  for (const table of TABLES) {
    try {
      const rows = await sql.unsafe(`SELECT * FROM ${table} ORDER BY created_at ASC`);
      const count = rows.length;
      summary[table] = count;

      const filePath = path.join(exportDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), "utf-8");
      console.log(`  ✅ ${table}: ${count} rows → ${table}.json`);
    } catch (err: any) {
      console.log(`  ⚠️  ${table}: ${err.message?.slice(0, 60) || "error"}`);
      summary[table] = -1;
    }
  }

  // Write a manifest
  const manifest = {
    exported_at: new Date().toISOString(),
    project: PROJECT_REF,
    tables: summary,
  };
  fs.writeFileSync(
    path.join(exportDir, "_manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  console.log("\n  ────────────────────────────────");
  console.log("  Summary:");
  let totalRows = 0;
  for (const [table, count] of Object.entries(summary)) {
    if (count >= 0) totalRows += count;
  }
  console.log(`  Total: ${totalRows} rows across ${TABLES.length} tables`);
  console.log(`  Files: ${exportDir}`);
  console.log("");

  await sql.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
