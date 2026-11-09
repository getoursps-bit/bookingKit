import { randomBytes } from "node:crypto";
import pg from "pg";
import { seed } from "../../db/seed/seed";
import { migrate } from "../../scripts/migrate";

/**
 * Gives a test its own throwaway schema on the local or CI Postgres, and drops
 * it afterwards. Creating schemas needs more rights than the app's restricted
 * role has, so tests connect with TEST_ADMIN_DATABASE_URL.
 */
export async function withTestSchema<T>(fn: (client: pg.Client, schema: string) => Promise<T>): Promise<T> {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  const client = new pg.Client({ connectionString: process.env.TEST_ADMIN_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`create schema ${schema}`);
    await client.query(`set search_path = ${schema}, public`);
    return await fn(client, schema);
  } finally {
    await client.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await client.end();
  }
}

/**
 * A throwaway schema with every migration applied (and the seed, unless
 * `seed: false`), plus a pool whose connections use it, like the app's pool.
 */
export async function withMigratedSchema<T>(
  fn: (pool: pg.Pool, schema: string) => Promise<T>,
  opts: { seed?: boolean } = {},
): Promise<T> {
  return withTestSchema(async (client, schema) => {
    await migrate(client);
    if (opts.seed !== false) await seed(client);
    const pool = new pg.Pool({
      connectionString: process.env.TEST_ADMIN_DATABASE_URL,
      options: `-c search_path=${schema},public`,
      max: 25,
    });
    try {
      return await fn(pool, schema);
    } finally {
      await pool.end();
    }
  });
}

/** True when the test database answers; database tests are skipped otherwise. */
export async function testDbAvailable(): Promise<boolean> {
  try {
    await withTestSchema(async () => undefined);
    return true;
  } catch (error) {
    console.warn(`Database tests skipped: ${(error as Error).message || String(error)}`);
    return false;
  }
}
