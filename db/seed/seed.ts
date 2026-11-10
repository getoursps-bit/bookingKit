// Inserts the business's starting content. Its structure (durations, prices,
// hours, which templates exist) is data.json; its text comes from the language
// packs: the site's default language fills each table's own text column, and
// every other language of the site goes into the translations table. Rows
// that already exist are skipped, so running it twice changes nothing and
// never overwrites the owner's edits.
//   pnpm seed
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { brand, brandName } from "../../src/brand";
import { extensions } from "../../src/extension/registry";
import { DEFAULT_LOCALE, type Locale, LOCALES } from "../../src/i18n/locales";
import { CONTENT } from "../../src/i18n/packs.generated";
import { searchPathOption } from "../../src/core/platform/db-schema";
import { SETTINGS_DEFAULTS } from "../../src/core/platform/settings";
// Imported, not read from disk, so the bundled release script carries it.
import data from "./data.json" with { type: "json" };

type Queryable = pg.Client | pg.PoolClient | pg.Pool;

type SeedData = {
  services: { key: string; duration_min: number; price_from_agorot: number; bookable_online: boolean }[];
  products: { key: string; price_agorot: number }[];
  opening_hours: { weekday: number; opens: string | null; closes: string | null; closed: boolean }[];
  message_templates: { key: string; channel: string; provider_template?: string; category?: string }[];
};

/** A language pack's content.json: kind of row, then the row's key, then its text fields. */
type Content = Record<string, Record<string, Record<string, string | undefined> | undefined> | undefined>;

/**
 * The seed text says %BRAND% where the client's name goes, and it is filled in
 * here. Not a {placeholder}: those are filled when a message is sent and are
 * counted as its parameters.
 */
function named<T>(content: T, name: string): T {
  return JSON.parse(JSON.stringify(content).replaceAll("%BRAND%", JSON.stringify(name).slice(1, -1))) as T;
}

/** Fills translations that are still empty; never overwrites what the owner wrote. */
async function translate(
  db: Queryable,
  locale: Locale,
  entity: string,
  key: string | number,
  fields: Record<string, string | undefined> | undefined,
): Promise<void> {
  for (const [field, value] of Object.entries(fields ?? {})) {
    if (!value?.trim()) continue;
    await db.query(
      `insert into content_translations (entity, entity_key, field, locale, value) values ($1, $2, $3, $4, $5)
       on conflict (entity, entity_key, field, locale) do nothing`,
      [entity, String(key), field, locale, value],
    );
  }
}

export async function seed(db: Queryable, structure: SeedData = data): Promise<void> {
  const text = Object.fromEntries(
    LOCALES.map((locale) => [locale, named(CONTENT[locale] as Content, brandName(locale))]),
  ) as Record<Locale, Content>;
  const main = text[DEFAULT_LOCALE];
  const others = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);
  const field = (entity: string, key: string, name: string): string => {
    const value = main[entity]?.[key]?.[name];
    if (value === undefined) throw new Error(`languages/${DEFAULT_LOCALE}/content.json has no ${entity}.${key}.${name}`);
    return value;
  };

  const serviceIds = new Map<string, number>();
  for (const [index, service] of structure.services.entries()) {
    const name = field("service", service.key, "name");
    await db.query(
      `insert into services (name_he, includes_he, duration_min, price_from_agorot, bookable_online, sort_order)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (name_he) do nothing`,
      [name, main.service?.[service.key]?.includes ?? null, service.duration_min, service.price_from_agorot, service.bookable_online, index],
    );
    const { rows } = await db.query<{ id: string }>("select id from services where name_he = $1", [name]);
    const id = Number(rows[0]!.id);
    serviceIds.set(service.key, id);
    for (const locale of others) await translate(db, locale, "service", id, text[locale].service?.[service.key]);
  }

  for (const [index, product] of structure.products.entries()) {
    const name = field("product", product.key, "name");
    await db.query(
      `insert into products (name_he, description_he, price_agorot, sort_order)
       values ($1, $2, $3, $4)
       on conflict (name_he) do nothing`,
      [name, main.product?.[product.key]?.description ?? null, product.price_agorot, index],
    );
    const { rows } = await db.query<{ id: string }>("select id from products where name_he = $1", [name]);
    for (const locale of others) await translate(db, locale, "product", rows[0]!.id, text[locale].product?.[product.key]);
  }

  for (const day of structure.opening_hours) {
    await db.query(
      `insert into opening_hours (weekday, opens, closes, closed)
       values ($1, $2, $3, $4)
       on conflict (weekday) do nothing`,
      [day.weekday, day.opens, day.closes, day.closed],
    );
  }

  await db.query("insert into business_profile (id, name) values (1, $1) on conflict (id) do nothing", [
    brandName(DEFAULT_LOCALE),
  ]);
  for (const locale of others) {
    if (brand.name[locale] && brand.name[locale] !== brandName(DEFAULT_LOCALE))
      await translate(db, locale, "profile", 1, { name: brand.name[locale] });
  }

  for (const template of structure.message_templates) {
    const key = `${template.key}:${template.channel}`;
    await db.query(
      `insert into message_templates (key, channel, body_he, subject_he, provider_template, category)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (key, channel) do nothing`,
      [
        template.key,
        template.channel,
        field("message_template", key, "body"),
        main.message_template?.[key]?.subject ?? null,
        template.provider_template ?? null,
        template.category ?? null,
      ],
    );
    for (const locale of others) await translate(db, locale, "message_template", key, text[locale].message_template?.[key]);
  }

  // Each extension that is on writes its own starting content.
  for (const extension of extensions()) await extension.seed?.(db, { serviceIds });

  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    await db.query("insert into settings (key, value) values ($1, $2) on conflict (key) do nothing", [
      key,
      JSON.stringify(value),
    ]);
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: url, options: searchPathOption() });
  await client.connect();
  try {
    await client.query("begin");
    await seed(client);
    await client.query("commit");
    console.log("Seed done");
  } catch (error) {
    await client.query("rollback");
    throw error;
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
