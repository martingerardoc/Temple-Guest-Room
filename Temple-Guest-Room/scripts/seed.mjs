// Usage: node --env-file=.env scripts/seed.mjs   (development data only)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "seed.sql");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(readFileSync(file, "utf8"));
console.log("Seed data loaded.");
await client.end();