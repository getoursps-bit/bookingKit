import { brand, brandName } from "../brand";
import { extensions } from "../extension/registry";
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

/** `extra` laid over `base`, group by group. */
function merge(base: Group, extra: Group): Group {
  const out: Group = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    out[key] = typeof value === "object" && typeof current === "object" ? merge(current, value) : value;
  }
  return out;
}

/** A language's strings, the enabled extensions' strings and the client's own wording (client.json), in that order. */
function forClient(locale: Locale, base: Messages): Messages {
  const name = brandName(locale);
  let strings = named(base, name);
  for (const extension of extensions()) {
    const own = extension.messages?.[locale];
    if (own) strings = merge(strings, named(own, name));
  }
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
// Built on first use, not on import: an extension's own code reads strings too,
// so the registry and this file would otherwise wait on each other.
const ready = new Map<Locale, Messages>();

export function messagesFor(locale: Locale): Messages {
  let strings = ready.get(locale);
  if (!strings) ready.set(locale, (strings = forClient(locale, packs[locale])));
  return strings;
}
