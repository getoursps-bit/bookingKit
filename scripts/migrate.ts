// Applies db/migrations/*.sql in name order, one transaction per file, and
// records each in schema_migrations. Run as a release step, never on app start:
//   pnpm migrate           apply pending files
//   pnpm migrate --check   list pending files, exit 1 if any
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { searchPathOption } from "../src/server/db-schema";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../db/migrations/", import.meta.url));

type Queryable = pg.Client | pg.PoolClient;

async function ensureTable(db: Queryable): Promise<void> {
  await db.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
  await db.query("alter table schema_migrations enable row level security");
}

export async function pendingMigrations(db: Queryable, dir = MIGRATIONS_DIR): Promise<string[]> {
  await ensureTable(db);
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  const { rows } = await db.query<{ name: string }>("select name from schema_migrations");
  const applied = new Set(rows.map((row) => row.name));
  return files.filter((file) => !applied.has(file));
}

/** Applies every pending migration and returns the names applied. */
export async function migrate(db: Queryable, dir = MIGRATIONS_DIR): Promise<string[]> {
  const pending = await pendingMigrations(db, dir);
  for (const name of pending) {
    const sql = await readFile(path.join(dir, name), "utf8");
    await db.query("begin");
    try {
      await db.query(sql);
      await db.query("insert into schema_migrations (name) values ($1)", [name]);
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
    }
  }
  return pending;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: url, options: searchPathOption() });
  await client.connect();
  try {
    if (process.argv.includes("--check")) {
      const pending = await pendingMigrations(client);
      console.log(pending.length ? `Pending: ${pending.join(", ")}` : "No pending migrations");
      process.exitCode = pending.length ? 1 : 0;
      return;
    }
    const applied = await migrate(client);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No pending migrations");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
