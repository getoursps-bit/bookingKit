import { DEFAULT_LOCALE, type Locale } from "./locales";

/** A row's text in the site's other languages: language code, then field name. */
export type Translations = { [locale: string]: { [field: string]: string } | undefined };

/**
 * A row's text in the page's language: the translation when the owner filled
 * one, the default language otherwise. `pick(locale, service, "name")`.
 */
export function pick<Row extends { translations: Translations }, Field extends keyof Row & string>(
  locale: Locale,
  row: Row,
  field: Field,
): Row[Field] {
  if (locale === DEFAULT_LOCALE) return row[field];
  return (row.translations[locale]?.[field]?.trim() || row[field]) as Row[Field];
}
