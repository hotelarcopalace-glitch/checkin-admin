// Creates the sms_messages table (and optionally seeds demo rows).
// Usage:  node scripts/db-setup.mjs [--seed]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// Minimal .env.local loader so the script works without extra deps.
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local first.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
});

await client.connect();
await client.query(readFileSync(join(root, "db/schema.sql"), "utf8"));
console.log("✓ schema applied (sms_messages)");

if (process.argv.includes("--seed")) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS c FROM sms_messages");
  if (rows[0].c > 0) {
    console.log(`• skipped seed — table already has ${rows[0].c} rows`);
  } else {
    await client.query(readFileSync(join(root, "db/seed.sql"), "utf8"));
    console.log("✓ demo rows inserted");
  }
}

await client.end();
