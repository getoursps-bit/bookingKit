// The two interface languages. Hebrew is the default and keeps the plain
// addresses; English pages live under /en. The owner area has no prefix and
// follows the language cookie instead.

export const LOCALES = ["he", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "he";

/** Remembers the last language a visitor chose, for form posts and the owner area. */
export const LOCALE_COOKIE = "ff_locale";
/** Set by the proxy on every page request; read through getLocale(). */
export const LOCALE_HEADER = "x-ff-locale";

export function isLocale(value: unknown): value is Locale {
  return value === "he" || value === "en";
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
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
  return bare === "/" ? "/en" : bare.startsWith("/?") || bare.startsWith("/#") ? `/en${bare.slice(1)}` : `/en${bare}`;
}

/** Splits "/en/book?x=1" into its language and the plain path "/book?x=1". */
export function splitLocale(path: string): { locale: Locale; path: string } {
  const match = /^\/en(?=$|[/?#])/.exec(path);
  if (!match) return { locale: DEFAULT_LOCALE, path };
  const rest = path.slice(3);
  return { locale: "en", path: rest === "" ? "/" : rest.startsWith("/") ? rest : `/${rest}` };
}
