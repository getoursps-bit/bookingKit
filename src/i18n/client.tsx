"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { dirOf, type Locale, localePath } from "./locales";
import { withIsolation } from "./t";

/** Everything a browser component needs to write in the page's language. The root layout provides the strings. */
export function useI18n() {
  const locale = useLocale() as Locale;
  const translate = useTranslations();
  return useMemo(
    () => ({
      locale,
      dir: dirOf(locale),
      t: withIsolation(translate),
      lp: (path: string) => localePath(locale, path),
    }),
    [locale, translate],
  );
}
