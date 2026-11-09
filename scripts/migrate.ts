// Applies db/migrations/*.sql in name order, then each extension's
// extensions/<id>/migrations/*.sql (recorded as "<id>/<file>"), one
// transaction per file, recorded in schema_migrations. Every extension's
// tables are made whether it is on or not, so there is one database shape.
// Run as a release step, never on app start:
//   pnpm migrate           apply pending files
//   pnpm migrate --check   list pending files, exit 1 if any
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { searchPathOption } from "../src/server/db-schema";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../db/migrations/", import.meta.url));
export const EXTENSIONS_DIR = fileURLToPath(new URL("../extensions/", import.meta.url));

/** Every migration file: the core's by name, then each extension's as "<id>/<file>". */
async function allMigrations(dir: string, extensionsDir: string): Promise<{ name: string; file: string }[]> {
  const core = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  const files = core.map((name) => ({ name, file: path.join(dir, name) }));
  const ids = (await readdir(extensionsDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const id of ids) {
    const own = (await readdir(path.join(extensionsDir, id, "migrations")).catch(() => []))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    files.push(...own.map((name) => ({ name: `${id}/${name}`, file: path.join(extensionsDir, id, "migrations", name) })));
  }
  return files;
}

type Queryable = pg.Client | pg.PoolClient;

async function ensureTable(db: Queryable): Promise<void> {
  await db.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
  await db.query("alter table schema_migrations enable row level security");
}

export async function pendingMigrations(
  db: Queryable,
  dir = MIGRATIONS_DIR,
  extensionsDir = EXTENSIONS_DIR,
): Promise<string[]> {
  await ensureTable(db);
  const files = await allMigrations(dir, extensionsDir);
  const { rows } = await db.query<{ name: string }>("select name from schema_migrations");
  const applied = new Set(rows.map((row) => row.name));
  return files.filter(({ name }) => !applied.has(name)).map(({ name }) => name);
}

/** Applies every pending migration and returns the names applied. */
export async function migrate(db: Queryable, dir = MIGRATIONS_DIR, extensionsDir = EXTENSIONS_DIR): Promise<string[]> {
  const files = new Map((await allMigrations(dir, extensionsDir)).map(({ name, file }) => [name, file]));
  const pending = await pendingMigrations(db, dir, extensionsDir);
  for (const name of pending) {
    const sql = await readFile(files.get(name)!, "utf8");
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
