import { describe, expect, it } from "vitest";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { brandName } from "@/brand";

// Needs the compose Postgres locally or the CI service; skipped otherwise.
const hasDb = await testDbAvailable();

describe.skipIf(!hasDb)("the seed", () => {
  it("writes the client's name where the seed text says %BRAND%", async () => {
    await withMigratedSchema(async (pool) => {
      const profile = await pool.query<{ name: string }>("select name from business_profile");
      expect(profile.rows).toEqual([{ name: brandName("he") }]);

      const templates = await pool.query<{ text: string }>(
        `select concat_ws(' ', body_he, subject_he, body_en, subject_en) as text from message_templates`,
      );
      expect(templates.rows.length).toBeGreaterThan(0);
      expect(templates.rows.filter((row) => row.text.includes("%BRAND%"))).toEqual([]);
      expect(templates.rows.some((row) => row.text.includes(brandName("he")))).toBe(true);
      expect(templates.rows.some((row) => row.text.includes(brandName("en")))).toBe(true);
    });
  });
});
