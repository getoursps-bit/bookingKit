import { brand } from "../brand";
import en from "./en.json";
import he from "./he.json";
import type { Locale } from "./locales";

// Every language's strings, ready for one client. Server and worker only: it
// carries all the languages, and the browser is sent just the one in use.

export type Messages = typeof he;
type Group = { [key: string]: string | Group };

/** A copy with `{brand}` filled with the client's name in every string. */
function named(group: Group, name: string): Group {
  return Object.fromEntries(
    Object.entries(group).map(([key, value]) => [
      key,
      typeof value === "string" ? value.replaceAll("{brand}", name) : named(value, name),
    ]),
  );
}

/** A language file with the client's own wording (client.json) laid over it. */
function forClient(locale: Locale, base: Messages): Messages {
  const strings = named(base, brand.name[locale]);
  for (const [key, text] of Object.entries(brand.messages[locale])) {
    const parts = key.split(".");
    let group = strings;
    for (const part of parts.slice(0, -1)) group = (group[part] ??= {}) as Group;
    group[parts.at(-1)!] = text.replaceAll("{brand}", brand.name[locale]);
  }
  return strings as Messages;
}

// Both files carry every key; the type check fails if English misses one.
const MESSAGES: Record<Locale, Messages> = { he: forClient("he", he), en: forClient("en", en satisfies Messages) };

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}
