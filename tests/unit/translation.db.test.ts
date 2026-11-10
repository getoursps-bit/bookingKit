import { describe, expect, it } from "vitest";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { pick } from "@/i18n/content";
import { CONTENT } from "@/i18n/packs.generated";
import { DEFAULT_LOCALE, type Locale, LOCALES } from "@/i18n/locales";
import { messageLocale } from "@/core/platform/notify/deliver";
import { getTemplate, updateTemplate } from "@/core/platform/notify/templates";
import { listServices, upsertService } from "@/core/booking/catalog";
import { cleanTranslations, saveTranslations, translatedSql, translationsFrom } from "@/core/platform/translation";

// Needs the compose Postgres locally or the CI service; skipped otherwise.
const hasDb = await testDbAvailable();
// The site's first language after the default one; the translation tests use it.
const OTHER = LOCALES.find((locale) => locale !== DEFAULT_LOCALE) ?? DEFAULT_LOCALE;

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
    const form = { [`name:${OTHER}`]: " Haircut ", "name:xx": "ignored" };
    expect(translationsFrom(form, { name: 80, includes: 500 })).toEqual(
      OTHER === DEFAULT_LOCALE ? {} : { [OTHER]: { name: "Haircut", includes: "" } },
    );
  });

  it("writes plain SQL for the default language and refuses anything that is not a language code", () => {
    expect(translatedSql("service", "name", "s.id", "s.name_he", "he")).toBe("s.name_he");
    expect(translatedSql("service", "name", "s.id", "s.name_he", "en" as Locale)).toContain("t.locale = 'en'");
    expect(() => translatedSql("service", "name", "s.id", "s.name_he", "en'; drop" as never)).toThrow();
  });
});

describe.skipIf(!hasDb)("content translations in the database", () => {
  it("stores a service's other-language text beside it and shows the default language when one is empty", async () => {
    await withMigratedSchema(async (pool) => {
      const writer = { staffId: null, db: pool };
      const saved = await upsertService({ ...service, translations: { [OTHER]: { name: "Haircut", includes: "" } } }, writer);
      expect(saved.translations).toEqual({ [OTHER]: { name: "Haircut" } });

      const [read] = (await listServices({}, pool)).filter((row) => row.id === saved.id);
      expect(read).toMatchObject({ name: "תספורת", translations: { [OTHER]: { name: "Haircut" } } });
      expect(pick(OTHER, read!, "name")).toBe(OTHER === DEFAULT_LOCALE ? "תספורת" : "Haircut");
      expect(pick(OTHER, read!, "includes")).toBe("רחצה");
      expect(pick(DEFAULT_LOCALE, read!, "name")).toBe("תספורת");

      // Clearing the field removes the translation.
      const cleared = await upsertService({ ...service, id: saved.id, translations: { [OTHER]: { name: "" } } }, writer);
      expect(cleared.translations).toEqual({ [OTHER]: {} });
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
      if (OTHER !== DEFAULT_LOCALE) expect(seeded.translations[OTHER]?.body).toContain("{when}");
      expect(messageLocale(seeded, { phone: null, email: "a@example.test", locale: OTHER })).toBe(OTHER);

      // Wording in another language must keep the placeholders.
      const broken = { body: seeded.body, subject: seeded.subject, translations: { [OTHER]: { body: "No time here" } } };
      expect(await updateTemplate("confirmation", "email", broken, staffId, pool)).toBe("placeholders");

      // With the other language's wording removed, a customer in it gets the default language.
      const defaultOnly = { body: seeded.body, subject: seeded.subject, translations: { [OTHER]: { body: "", subject: "" } } };
      expect(await updateTemplate("confirmation", "email", defaultOnly, staffId, pool)).toBe("ok");
      const after = (await getTemplate("confirmation", "email", pool))!;
      expect(after.translations).toEqual({});
      expect(messageLocale(after, { phone: null, email: "a@example.test", locale: OTHER })).toBe(DEFAULT_LOCALE);
    });
  });
});

describe.skipIf(!hasDb)("the seed", () => {
  it("puts the other languages' text in the translations table and leaves the old English columns empty", async () => {
    await withMigratedSchema(async (pool) => {
      const seeded = await pool.query<{ n: number }>(
        "select count(*)::int as n from content_translations where locale = $1 and entity = 'service'",
        [OTHER],
      );
      // One row for each text field a service has in that language's pack.
      const fields = Object.values((CONTENT[OTHER as keyof typeof CONTENT] as { service: Record<string, Record<string, string>> }).service).flatMap(
        (service) => Object.values(service).filter((value) => value.trim()),
      ).length;
      expect(fields).toBeGreaterThan(0);
      expect(seeded.rows[0]!.n).toBe(OTHER === DEFAULT_LOCALE ? 0 : fields);
      const stale = await pool.query<{ n: number }>("select count(*)::int as n from services where name_en is not null");
      expect(stale.rows[0]!.n).toBe(0);
    });
  });
});
