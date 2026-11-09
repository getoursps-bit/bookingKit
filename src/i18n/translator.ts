import { createTranslator } from "use-intl/core";
import type { Locale } from "./locales";
import { messagesFor } from "./messages";
import { type Translate, withIsolation } from "./t";

// The string lookup for code that runs outside a page: the worker's messages,
// the app manifests and redirects. Pages use getI18n() or useI18n().

const libraries = new Map<Locale, ReturnType<typeof create>>();
const cached = new Map<Locale, Translate>();

function create(locale: Locale) {
  return createTranslator({ locale, messages: messagesFor(locale) });
}

/** next-intl's own translator for one language, for strings that use its plural syntax. */
export function libraryTranslator(locale: Locale) {
  let library = libraries.get(locale);
  if (!library) libraries.set(locale, (library = create(locale)));
  return library;
}

/** The string lookup for one language. */
export function translator(locale: Locale): Translate {
  let translate = cached.get(locale);
  if (!translate) cached.set(locale, (translate = withIsolation(libraryTranslator(locale))));
  return translate;
}
