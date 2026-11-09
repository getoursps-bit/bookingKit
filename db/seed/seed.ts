// Inserts the business's starting content from data.he.json. Rows that already
// exist are skipped, so running it twice changes nothing and never overwrites
// the owner's edits. English text from data.en.json only fills English
// translations that are still empty, matched by the seeded Hebrew name or template key.
//   pnpm seed
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { brandName } from "../../src/brand";
import { SETTINGS_DEFAULTS } from "../../src/server/repos/settings";
// Imported, not read from disk, so the bundled release script carries it.
import data from "./data.he.json" with { type: "json" };
import english from "./data.en.json" with { type: "json" };
import { searchPathOption } from "../../src/server/db-schema";

type Queryable = pg.Client | pg.PoolClient | pg.Pool;

type SeedData = {
  services: {
    key: string;
    name_he: string;
    includes_he: string;
    duration_min: number;
    price_from_agorot: number;
    bookable_online: boolean;
  }[];
  service_rules: {
    species: string;
    age_group: string | null;
    weight_group: string | null;
    request: string;
    service: string;
  }[];
  products: { name_he: string; description_he: string; price_agorot: number }[];
  opening_hours: { weekday: number; opens: string | null; closes: string | null; closed: boolean }[];
  business_profile: { name: string };
  message_templates: {
    key: string;
    channel: string;
    body_he: string;
    subject_he?: string;
    provider_template?: string;
    category?: string;
  }[];
};

type SeedEnglish = {
  services: Record<string, { name_en: string; includes_en: string }>;
  products: Record<string, { name_en: string; description_en: string }>;
  /** Keyed "key:channel". */
  message_templates: Record<string, { body_en: string; subject_en: string | null }>;
};

/**
 * The seed text says %BRAND% where the client's name goes, and it is filled in
 * here. Not a {placeholder}: those are filled when a message is sent and are
 * counted as its parameters.
 */
function named<T>(content: T, name: string): T {
  return JSON.parse(JSON.stringify(content).replaceAll("%BRAND%", JSON.stringify(name).slice(1, -1))) as T;
}

/** Fills English text that is still empty; never overwrites what the owner wrote. */
async function translate(
  db: Queryable,
  entity: string,
  key: string | number,
  fields: Record<string, string | null | undefined>,
): Promise<void> {
  for (const [field, value] of Object.entries(fields)) {
    if (!value?.trim()) continue;
    await db.query(
      `insert into content_translations (entity, entity_key, field, locale, value) values ($1, $2, $3, 'en', $4)
       on conflict (entity, entity_key, field, locale) do nothing`,
      [entity, String(key), field, value],
    );
  }
}

export async function seed(db: Queryable, hebrew: SeedData = data, inEnglish: SeedEnglish = english): Promise<void> {
  const content = named(hebrew, brandName("he"));
  const en = named(inEnglish, brandName("en"));

  const serviceIds = new Map<string, number>();
  for (const [index, service] of content.services.entries()) {
    await db.query(
      `insert into services (name_he, includes_he, duration_min, price_from_agorot, bookable_online, sort_order)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (name_he) do nothing`,
      [
        service.name_he,
        service.includes_he,
        service.duration_min,
        service.price_from_agorot,
        service.bookable_online,
        index,
      ],
    );
    const { rows } = await db.query<{ id: string }>("select id from services where name_he = $1", [service.name_he]);
    serviceIds.set(service.key, Number(rows[0]!.id));
    const english = en.services[service.key];
    if (english) {
      await translate(db, "service", serviceIds.get(service.key)!, { name: english.name_en, includes: english.includes_en });
    }
  }

  for (const rule of content.service_rules) {
    const serviceId = serviceIds.get(rule.service);
    if (!serviceId) throw new Error(`Seed rule points to unknown service "${rule.service}"`);
    await db.query(
      `insert into service_rules (species, age_group, weight_group, request, service_id)
       values ($1, $2, $3, $4, $5)
       on conflict (species, age_group, weight_group, request) do nothing`,
      [rule.species, rule.age_group, rule.weight_group, rule.request, serviceId],
    );
  }

  for (const [index, product] of content.products.entries()) {
    await db.query(
      `insert into products (name_he, description_he, price_agorot, sort_order)
       values ($1, $2, $3, $4)
       on conflict (name_he) do nothing`,
      [product.name_he, product.description_he, product.price_agorot, index],
    );
    const english = en.products[product.name_he];
    if (english) {
      const { rows } = await db.query<{ id: string }>("select id from products where name_he = $1", [product.name_he]);
      await translate(db, "product", rows[0]!.id, { name: english.name_en, description: english.description_en });
    }
  }

  for (const day of content.opening_hours) {
    await db.query(
      `insert into opening_hours (weekday, opens, closes, closed)
       values ($1, $2, $3, $4)
       on conflict (weekday) do nothing`,
      [day.weekday, day.opens, day.closes, day.closed],
    );
  }

  await db.query("insert into business_profile (id, name) values (1, $1) on conflict (id) do nothing", [
    content.business_profile.name,
  ]);

  for (const template of content.message_templates) {
    await db.query(
      `insert into message_templates (key, channel, body_he, subject_he, provider_template, category)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (key, channel) do nothing`,
      [
        template.key,
        template.channel,
        template.body_he,
        template.subject_he ?? null,
        template.provider_template ?? null,
        template.category ?? null,
      ],
    );
    const english = en.message_templates[`${template.key}:${template.channel}`];
    if (english) {
      await translate(db, "message_template", `${template.key}:${template.channel}`, {
        body: english.body_en,
        subject: english.subject_en,
      });
    }
  }

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
