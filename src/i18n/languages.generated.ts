// Generated from client.json by `pnpm brand`. Do not edit: change client.json and run it again.

/** The site's languages. The default one comes first and has the plain addresses. */
export const LOCALES = ["he","en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "he";

/** What the code needs to know about each language (languages/<code>/pack.json). */
export const PACKS: Record<Locale, { name: string; dir: "rtl" | "ltr"; formats: string; openGraph: string }> = {
  he: {"name":"עברית","dir":"rtl","formats":"he-IL","openGraph":"he_IL"},
  en: {"name":"English","dir":"ltr","formats":"en-IL","openGraph":"en_IL"},
};
