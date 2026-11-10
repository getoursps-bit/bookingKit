import pg from "pg";
import { getConfig } from "./config";
import { searchPathOption } from "./db-schema";
import { log } from "./log";

export type Db = pg.Pool | pg.PoolClient;

let pool: pg.Pool | undefined;

/** The only place that opens Postgres connections. Repositories receive a `Db`. */
export function getPool(): pg.Pool {
  if (pool) return pool;
  pool = new pg.Pool({
    connectionString: getConfig().DATABASE_URL,
    // Every query runs inside the app's own schema.
    options: searchPathOption(),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  pool.on("error", (error) => log.error({ err: error }, "postgres pool error"));
  return pool;
}

export async function query<Row extends pg.QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
  db: Db = getPool(),
): Promise<Row[]> {
  const result = await db.query<Row>(sql, params as unknown[]);
  return result.rows;
}

let savepointCounter = 0;

/**
 * Runs `fn` in one transaction; rolls back on any thrown error. Given a client
 * that is already inside a transaction, it uses a savepoint instead, so
 * repositories can be called on their own or as part of a larger transaction.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>, db: Db = getPool()): Promise<T> {
  if (!(db instanceof pg.Pool)) {
    const name = `sp_${++savepointCounter}`;
    await db.query(`savepoint ${name}`);
    try {
      const result = await fn(db);
      await db.query(`release savepoint ${name}`);
      return result;
    } catch (error) {
      await db.query(`rollback to savepoint ${name}`);
      throw error;
    }
  }
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Postgres error code and constraint name, when `error` came from Postgres. */
export function pgError(error: unknown): { code?: string; constraint?: string } {
  if (typeof error !== "object" || error === null) return {};
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return {
    code: typeof code === "string" ? code : undefined,
    constraint: typeof constraint === "string" ? constraint : undefined,
  };
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = undefined;
  await closing.end();
}

/** Asks Postgres for nothing, to learn that it answers. Throws when it does not. */
export async function ping(): Promise<void> {
  await query("select 1");
}
