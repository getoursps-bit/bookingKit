import { DEFAULT_LOCALE } from "./locales";
import { messagesFor } from "./messages";
import type { MessageKey } from "./t";

type Group = { [key: string]: string | Group };

/**
 * True when a string with this dotted key exists: "admin.error.photo". The
 * strings of the extensions that are on count too, so an extension's own
 * error ("err.vetRequired") is shown like one of the core's. Server only.
 */
export function isMessageKey(key: string): key is MessageKey {
  let node: string | Group | undefined = messagesFor(DEFAULT_LOCALE) as Group;
  for (const part of key.split(".")) {
    if (typeof node !== "object") return false;
    node = node[part];
  }
  return typeof node === "string";
}
