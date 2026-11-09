import { describe, expect, it } from "vitest";
import { testDbAvailable, withTestSchema } from "../setup/db";

// Needs the compose Postgres locally (docker compose -f docker/compose.dev.yml up -d)
// or the CI service. Skipped when no database answers, so plain unit runs still work.
const hasDb = await testDbAvailable();

describe.skipIf(!hasDb)("database", () => {
  it("has the extensions the booking rules need", async () => {
    await withTestSchema(async (client) => {
      const { rows } = await client.query<{ extname: string }>(
        "select extname from pg_extension where extname in ('btree_gist', 'pgcrypto') order by extname",
      );
      expect(rows.map((row) => row.extname)).toEqual(["btree_gist", "pgcrypto"]);
    });
  });
});
