import client from "../client.json";
import type { Client } from "./brand.schema";

// The one place the client's name, wording, look and languages come from:
// client.json. Plain data with no other imports, so pages, browser code, the
// worker and the scripts can all read it. `pnpm brand` writes the stylesheet
// (src/app/brand.css) and the language list (src/i18n/*.generated.ts) from
// the same file.
const checked = client as Client;

export const brand = checked.brand;
export const theme = checked.theme;
export const languages = checked.languages;

/** The business name in a language, or in the default language when it has no name of its own. */
export function brandName(locale: string): string {
  return brand.name[locale] ?? brand.name[languages.default]!;
}
