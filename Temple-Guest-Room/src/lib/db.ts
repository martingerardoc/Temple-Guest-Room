import { Pool, types } from "pg";

// Return DATE columns as plain "YYYY-MM-DD" strings (not JS Date objects)
types.setTypeParser(1082, (value: string) => value);

/** Anything that can run a query: the pool, a transaction client, or a test database. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

const globalForPool = globalThis as unknown as { pgPool?: Pool };

export const pool: Pool =
  globalForPool.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") globalForPool.pgPool = pool;

/** Runs fn inside one database transaction. Commits on success, rolls back on any error. */
export async function withTransaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}