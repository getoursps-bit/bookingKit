import type { Locale } from "./locales";

/** The owner's text in the page's language: the English field when filled, the Hebrew one otherwise. */
export function pick(locale: Locale, he: string, en: string | null | undefined): string;
export function pick(locale: Locale, he: string | null, en: string | null | undefined): string | null;
export function pick(locale: Locale, he: string | null, en: string | null | undefined): string | null {
  return locale === "en" && en?.trim() ? en : he;
}
