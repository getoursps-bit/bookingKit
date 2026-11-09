import { brand, brandName } from "../brand";
import type { Locale } from "./locales";
import { MESSAGES as PACK_MESSAGES } from "./packs.generated";
import type { Messages } from "./t";

// Every language's strings, ready for one client. Server and worker only: it
// carries all the client's languages, and the browser is sent just the one in use.

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

/** A language's strings with the client's own wording (client.json) laid over them. */
function forClient(locale: Locale, base: Messages): Messages {
  const name = brandName(locale);
  const strings = named(base, name);
  for (const [key, text] of Object.entries(brand.messages[locale] ?? {})) {
    const parts = key.split(".");
    let group = strings;
    for (const part of parts.slice(0, -1)) group = (group[part] ??= {}) as Group;
    group[parts.at(-1)!] = text.replaceAll("{brand}", name);
  }
  return strings as Messages;
}

// Every pack must carry every key of the Hebrew one; the type check fails if one misses a key.
const packs: Record<Locale, Messages> = PACK_MESSAGES;
const MESSAGES = Object.fromEntries(
  Object.entries(packs).map(([locale, base]) => [locale, forClient(locale as Locale, base)]),
) as Record<Locale, Messages>;

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}
