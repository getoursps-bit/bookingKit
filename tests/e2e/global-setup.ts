import pg from "pg";
import { searchPathOption } from "../../src/core/platform/db-schema";
import { DEV_DATABASE_URL } from "../setup/dev-db";
import { APPROVAL } from "./client";

/**
 * For a client with the approval extension, the browser tests still book
 * appointments that are confirmed at once; the approval test switches
 * approval on for itself. Same as tests/setup/db.ts does for the unit tests.
 */
export default async function globalSetup() {
  if (!APPROVAL) return;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? DEV_DATABASE_URL, options: searchPathOption() });
  await client.connect();
  try {
    await client.query(
      `insert into settings (key, value) values ('booking.approval', 'false') on conflict (key) do update set value = 'false'`,
    );
  } finally {
    await client.end();
  }
}
