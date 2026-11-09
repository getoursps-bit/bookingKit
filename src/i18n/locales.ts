import { DEFAULT_LOCALE, type Locale, LOCALES, PACKS } from "./languages.generated";

// The site's languages come from client.json (see languages.generated.ts).
// The default language keeps the plain addresses; each other language lives
// under /<code>. The owner area has no prefix and follows the language cookie.

export { DEFAULT_LOCALE, type Locale, LOCALES, PACKS };

/** The languages that have an address prefix: every one but the default. */
export const OTHER_LOCALES: readonly Locale[] = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/** Remembers the last language a visitor chose, for form posts and the owner area. */
export const LOCALE_COOKIE = "bk_locale";
/** Set by the proxy on every page request; read through getLocale(). */
export const LOCALE_HEADER = "x-bk-locale";

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return PACKS[locale].dir;
}

/** Paths that never get a language prefix: the owner area, APIs, redirects and files. */
function unprefixed(path: string): boolean {
  return /^\/(admin|api|go|lang|healthz|app-icon|_next)(\/|$)|^\/[^/]+\.\w+$/.test(path);
}

/** True for public pages, whose address carries the language; false for everything in unprefixed(). */
export function isLocalizedPath(pathname: string): boolean {
  return !unprefixed(pathname);
}

/** The address of a public page in a language: "/book" → "/en/book" in English. */
export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || unprefixed(path)) return path;
  const { path: bare } = splitLocale(path);
  if (locale === DEFAULT_LOCALE) return bare;
  const prefix = `/${locale}`;
  return bare === "/" ? prefix : bare.startsWith("/?") || bare.startsWith("/#") ? `${prefix}${bare.slice(1)}` : `${prefix}${bare}`;
}

const PREFIX = OTHER_LOCALES.length ? new RegExp(`^/(${OTHER_LOCALES.join("|")})(?=$|[/?#])`) : null;

/** Splits "/en/book?x=1" into its language and the plain path "/book?x=1". */
export function splitLocale(path: string): { locale: Locale; path: string } {
  const match = PREFIX?.exec(path);
  if (!match) return { locale: DEFAULT_LOCALE, path };
  const rest = path.slice(match[0].length);
  return { locale: match[1] as Locale, path: rest === "" ? "/" : rest.startsWith("/") ? rest : `/${rest}` };
}
