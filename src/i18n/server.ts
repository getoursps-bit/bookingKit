import { cookies, headers } from "next/headers";
import { cache } from "react";
import { dirOf, type Locale, LOCALE_COOKIE, LOCALE_HEADER, localePath, toLocale } from "./locales";
import { translator } from "./t";

/**
 * The language of the page being rendered. Public pages take it from the
 * address (the proxy sets the header); the owner area from the cookie.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const fromProxy = (await headers()).get(LOCALE_HEADER);
  if (fromProxy) return toLocale(fromProxy);
  return toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
});

/** Everything a server component needs to write in the page's language. */
export const getI18n = cache(async () => {
  const locale = await getLocale();
  return {
    locale,
    dir: dirOf(locale),
    t: translator(locale),
    /** A public address in this language. */
    lp: (path: string) => localePath(locale, path),
  };
});
