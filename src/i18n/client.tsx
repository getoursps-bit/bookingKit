"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, dirOf, type Locale, localePath } from "./locales";
import { translator } from "./t";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once by the root layout, so client components write in the page's language. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  return useMemo(
    () => ({ locale, dir: dirOf(locale), t: translator(locale), lp: (path: string) => localePath(locale, path) }),
    [locale],
  );
}
