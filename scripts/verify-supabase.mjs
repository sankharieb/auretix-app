import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const root = process.cwd();
const envFiles = [".env.local", ".env"];

async function loadEnvFile(fileName) {
  try {
    const raw = await readFile(path.join(root, fileName), "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...parts] = trimmed.split("=");
      const value = parts.join("=").trim().replace(/^['"]|['"]$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code === "EISDIR") {
      console.error(`${fileName} is a directory, but it must be a file.`);
      console.error(`Remove the directory and create a ${fileName} file with the Supabase values.`);
      process.exit(1);
    }

    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

for (const fileName of envFiles) {
  await loadEnvFile(fileName);
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing Supabase environment values: ${missing.join(", ")}`);
  console.error("Create .env.local from .env.example, paste the project keys, then rerun.");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket,
    },
  },
);

const checks = [
  { table: "companies", select: "id,name,slug" },
  { table: "users", select: "id,email,role,company_id" },
  { table: "workspaces", select: "id,name,business_type,company_id" },
  { table: "decision_runs", select: "id,workspace_id,trigger,created_at" },
  { table: "audit_events", select: "id,workspace_id,action,created_at" },
  { table: "integration_accounts", select: "id,workspace_id,provider,status" },
  { table: "roi_snapshots", select: "id,workspace_id,proof_status,proof_score" },
];

const results = [];

for (const check of checks) {
  const { data, error } = await supabase
    .from(check.table)
    .select(check.select)
    .limit(1);

  if (error) {
    results.push({
      table: check.table,
      ok: false,
      error: error.message,
    });
    continue;
  }

  results.push({
    table: check.table,
    ok: true,
    sampleRows: data.length,
  });
}

const failed = results.filter((result) => !result.ok);

console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));

if (failed.length > 0) {
  console.error("Supabase connected, but at least one Auretix table is missing or blocked.");
  console.error("Run db/schema.sql in the Supabase SQL editor, then rerun this check.");
  process.exit(1);
}
