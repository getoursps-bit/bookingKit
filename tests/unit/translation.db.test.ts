import { describe, expect, it } from "vitest";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { pick } from "@/i18n/content";
import { messageLocale } from "@/server/notify/deliver";
import { getTemplate, updateTemplate } from "@/server/notify/templates";
import { listServices, upsertService } from "@/server/repos/catalog";
import { cleanTranslations, saveTranslations, translatedSql, translationsFrom } from "@/server/translation/content";

// Needs the compose Postgres locally or the CI service; skipped otherwise.
const hasDb = await testDbAvailable();

const service = {
  name: "תספורת",
  includes: "רחצה",
  durationMin: 60,
  priceFromAgorot: 20000,
  bookableOnline: true,
  active: true,
  sortOrder: 99,
};

describe("content translations", () => {
  it("keeps only a row's own fields, trimmed, without empty ones", () => {
    expect(cleanTranslations("service", { en: { name: " Haircut ", includes: " ", price: "1" } })).toEqual({
      en: { name: "Haircut" },
    });
  });

  it("reads each other language from a form's \"field:language\" inputs", () => {
    expect(translationsFrom({ "name:en": " Haircut ", "name:xx": "ignored" }, { name: 80, includes: 500 })).toEqual({
      en: { name: "Haircut", includes: "" },
    });
  });

  it("writes plain SQL for the default language and refuses anything that is not a language code", () => {
    expect(translatedSql("service", "name", "s.id", "s.name_he", "he")).toBe("s.name_he");
    expect(translatedSql("service", "name", "s.id", "s.name_he", "en")).toContain("t.locale = 'en'");
    expect(() => translatedSql("service", "name", "s.id", "s.name_he", "en'; drop" as never)).toThrow();
  });
});

describe.skipIf(!hasDb)("content translations in the database", () => {
  it("stores a service's other-language text beside it and shows the default language when one is empty", async () => {
    await withMigratedSchema(async (pool) => {
      const writer = { staffId: null, db: pool };
      const saved = await upsertService({ ...service, translations: { en: { name: "Haircut", includes: "" } } }, writer);
      expect(saved.translations).toEqual({ en: { name: "Haircut" } });

      const [read] = (await listServices({}, pool)).filter((row) => row.id === saved.id);
      expect(read).toMatchObject({ name: "תספורת", translations: { en: { name: "Haircut" } } });
      expect(pick("en", read!, "name")).toBe("Haircut");
      expect(pick("en", read!, "includes")).toBe("רחצה");
      expect(pick("he", read!, "name")).toBe("תספורת");

      // Clearing the field removes the translation.
      const cleared = await upsertService({ ...service, id: saved.id, translations: { en: { name: "" } } }, writer);
      expect(cleared.translations).toEqual({ en: {} });
      expect((await listServices({}, pool)).find((row) => row.id === saved.id)?.translations).toEqual({});
    });
  });

  it("leaves a language alone when a save does not mention it", async () => {
    await withMigratedSchema(async (pool) => {
      const saved = await upsertService({ ...service, translations: {} }, { staffId: null, db: pool });
      await saveTranslations("service", saved.id, { ar: { name: "قص" } }, pool);
      await saveTranslations("service", saved.id, { en: { name: "Haircut" } }, pool);
      expect((await listServices({}, pool)).find((row) => row.id === saved.id)?.translations).toEqual({
        ar: { name: "قص" },
        en: { name: "Haircut" },
      });
    });
  });

  it("sends a message in the customer's language only when the template has wording in it", async () => {
    await withMigratedSchema(async (pool) => {
      const [{ id: staffId }] = (
        await pool.query<{ id: number }>(
          "insert into staff (email, password_hash, totp_secret) values ('owner@example.test', 'x', 'x') returning id::int",
        )
      ).rows as [{ id: number }];
      const seeded = (await getTemplate("confirmation", "email", pool))!;
      expect(seeded.translations.en?.body).toContain("{when}");
      expect(messageLocale(seeded, { phone: null, email: "a@example.test", locale: "en" })).toBe("en");

      // Wording in another language must keep the placeholders.
      const broken = { body: seeded.body, subject: seeded.subject, translations: { en: { body: "No time here" } } };
      expect(await updateTemplate("confirmation", "email", broken, staffId, pool)).toBe("placeholders");

      // With the English wording removed, an English-speaking customer gets the default language.
      const hebrewOnly = { body: seeded.body, subject: seeded.subject, translations: { en: { body: "", subject: "" } } };
      expect(await updateTemplate("confirmation", "email", hebrewOnly, staffId, pool)).toBe("ok");
      const after = (await getTemplate("confirmation", "email", pool))!;
      expect(after.translations).toEqual({});
      expect(messageLocale(after, { phone: null, email: "a@example.test", locale: "en" })).toBe("he");
    });
  });
});

describe.skipIf(!hasDb)("the seed", () => {
  it("puts English text in the translations table and leaves the old English columns empty", async () => {
    await withMigratedSchema(async (pool) => {
      const seeded = await pool.query<{ n: number }>(
        "select count(*)::int as n from content_translations where locale = 'en' and entity = 'service'",
      );
      expect(seeded.rows[0]!.n).toBeGreaterThan(0);
      const stale = await pool.query<{ n: number }>("select count(*)::int as n from services where name_en is not null");
      expect(stale.rows[0]!.n).toBe(0);
    });
  });
});
