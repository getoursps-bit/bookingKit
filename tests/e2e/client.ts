import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import client from "../../client.json" with { type: "json" };
import type { MessageKey } from "../../src/i18n/t";
import { MESSAGES } from "../../src/i18n/packs.generated";

// What the browser tests need to know about the client they run for: which
// extensions are on, and the wording as the site shows it.

/** True when the client books pets: the tests of the pet fields, rules and photos run only then. */
export const PETS = (client.extensions as string[]).includes("pets");
/** True when the client keeps a second opening range a day. */
export const SPLIT_HOURS = (client.extensions as string[]).includes("split-hours");
/** True when the client's online bookings are requests the owner approves. */
export const APPROVAL = (client.extensions as string[]).includes("approval");
/** True when the client has the ai extension: pet photos are analysed, and offered, only then. */
export const AI = (client.extensions as string[]).includes("ai");

type Group = { [key: string]: string | Group };

function flat(group: Group, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(group)) {
    if (typeof value === "string") out[prefix + key] = value;
    else flat(value, `${prefix}${key}.`, out);
  }
  return out;
}

/** Every core key is there; an extension's own key may not be, so it reads as possibly missing. */
export type Strings = Record<MessageKey, string> & Record<string, string>;

/**
 * A language's strings as the site shows them: the pack, then the strings of
 * the extensions that are on, then the client's own wording. The same order
 * as src/i18n/messages.ts, read from the files so the tests load no server code.
 */
export function strings(lang: string): Strings {
  const out = flat((MESSAGES as unknown as Record<string, Group>)[lang]!);
  for (const id of client.extensions as string[]) {
    const file = path.join(process.cwd(), "extensions", id, "languages", `${lang}.json`);
    if (existsSync(file)) Object.assign(out, flat(JSON.parse(readFileSync(file, "utf8")) as Group));
  }
  Object.assign(out, (client.brand.messages as Record<string, Record<string, string>>)[lang] ?? {});
  const name = (client.brand.name as Record<string, string>)[lang] ?? "";
  for (const key of Object.keys(out)) out[key] = out[key]!.replaceAll("{brand}", name);
  return out as Strings;
}
