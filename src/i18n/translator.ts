import { createTranslator } from "use-intl/core";
import type { Locale } from "./locales";
import { messagesFor } from "./messages";
import { type Translate, withIsolation } from "./t";

// The string lookup for code that runs outside a page: the worker's messages,
// the app manifests and redirects. Pages use getI18n() or useI18n().

const cached = new Map<Locale, Translate>();

/** The string lookup for one language. */
export function translator(locale: Locale): Translate {
  let translate = cached.get(locale);
  if (!translate) {
    translate = withIsolation(createTranslator({ locale, messages: messagesFor(locale) }));
    cached.set(locale, translate);
  }
  return translate;
}
