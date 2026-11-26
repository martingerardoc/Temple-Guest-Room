// Usage: node --env-file=.env scripts/migrate.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

await client.query(
  "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
);

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
  if (done.rowCount) {
    console.log(`skip   ${file}`);
    continue;
  }
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(join(dir, file), "utf8"));
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    await client.query("COMMIT");
    console.log(`applied ${file}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`FAILED ${file}:`, err.message);
    process.exitCode = 1;
    break;
  }
}
await client.end();