import type { Translations } from "@/i18n/content";
import { DEFAULT_LOCALE, type Locale, OTHER_LOCALES } from "@/i18n/locales";
import { type Db, query } from "../db";

// The second level of translation: what the business enters (services,
// products, photo texts, the tagline, message wording). Text in the site's
// default language stays in each table's own column; every other language is
// a row in content_translations, so a new language needs no new column.
// Nothing else reads or writes that table.

/** What can be translated: each kind of row, its text fields and their longest length. */
export const TRANSLATABLE = {
  service: { name: 80, includes: 500 },
  product: { name: 80, description: 300 },
  gallery_image: { alt: 200, caption: 200 },
  profile: { tagline: 160 },
  message_template: { body: 1000, subject: 160 },
} as const satisfies Record<string, Record<string, number>>;

export type Entity = keyof typeof TRANSLATABLE;

/**
 * SQL for one selected column, `translations`: a row's text in the other
 * languages as { language: { field: text } }. `key` is the SQL expression for
 * the row's key, written with its table name ("services.id").
 */
export function translationsColumn(entity: Entity, key: string): string {
  return `coalesce((
    select jsonb_object_agg(by_locale.locale, by_locale.fields)
    from (select t.locale, jsonb_object_agg(t.field, t.value) as fields
          from content_translations t
          where t.entity = '${entity}' and t.entity_key = (${key})::text
          group by t.locale) by_locale), '{}'::jsonb) as translations`;
}

/** Only the fields this kind of row has, trimmed, without empty ones. */
export function cleanTranslations(entity: Entity, translations: Translations): Translations {
  const limits: Record<string, number> = TRANSLATABLE[entity];
  const clean: Translations = {};
  for (const [locale, texts] of Object.entries(translations)) {
    const kept = Object.entries(texts ?? {})
      .map(([field, text]) => [field, text.trim().slice(0, limits[field] ?? 0)] as const)
      .filter(([field, text]) => field in limits && text !== "");
    clean[locale] = Object.fromEntries(kept);
  }
  return clean;
}

/**
 * Replaces a row's text in the languages given. A language that is not in
 * `translations` is left as it is, so switching a language off for a while
 * loses nothing. Returns what was stored.
 */
export async function saveTranslations(
  entity: Entity,
  key: string | number,
  translations: Translations,
  db: Db,
): Promise<Translations> {
  const clean = cleanTranslations(entity, translations);
  const locales = Object.keys(clean);
  if (locales.length === 0) return clean;
  await query(
    "delete from content_translations where entity = $1 and entity_key = $2 and locale = any($3::text[])",
    [entity, String(key), locales],
    db,
  );
  const rows = locales.flatMap((locale) =>
    Object.entries(clean[locale] ?? {}).map(([field, value]) => ({ locale, field, value })),
  );
  if (rows.length > 0) {
    await query(
      `insert into content_translations (entity, entity_key, field, locale, value)
       select $1, $2, field, locale, value from unnest($3::text[], $4::text[], $5::text[]) as row(field, locale, value)`,
      [entity, String(key), rows.map((row) => row.field), rows.map((row) => row.locale), rows.map((row) => row.value)],
      db,
    );
  }
  return clean;
}

/** Removes every translation of a row that was deleted. */
export async function dropTranslations(entity: Entity, key: string | number, db: Db): Promise<void> {
  await query("delete from content_translations where entity = $1 and entity_key = $2", [entity, String(key)], db);
}

/**
 * SQL for one text in a language, for queries that build a line of text in the
 * database: the translation when there is one, otherwise `fallback` (the
 * default-language column).
 */
export function translatedSql(
  entity: Entity,
  field: string,
  key: string,
  fallback: string,
  locale: Locale | undefined,
): string {
  if (!locale || locale === DEFAULT_LOCALE) return fallback;
  // One of the site's own language codes; checked again because it is written into the SQL.
  if (!/^[a-z]{2}$/.test(locale)) throw new Error("Not a language code");
  return `coalesce((select nullif(trim(t.value), '') from content_translations t
    where t.entity = '${entity}' and t.entity_key = (${key})::text and t.field = '${field}' and t.locale = '${locale}'), ${fallback})`;
}

/**
 * The other languages' text from a posted form, where each field is named
 * "<field>:<language>" and `limits` gives each field's longest length. A field
 * left empty clears that translation.
 */
export function translationsFrom(form: Record<string, string | undefined>, limits: Record<string, number>): Translations {
  // Limits as in TRANSLATABLE[entity]; each field is cut to its length.
  return Object.fromEntries(
    OTHER_LOCALES.map((locale) => [
      locale,
      Object.fromEntries(
        Object.entries(limits).map(([field, max]) => [field, form[`${field}:${locale}`]?.trim().slice(0, max) ?? ""]),
      ),
    ]),
  );
}
