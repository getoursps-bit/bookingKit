import he from "./he.json";
import type { MessageKey } from "./t";

type Group = { [key: string]: string | Group };

/** True when a string with this dotted key exists: "admin.error.photo". */
export function isMessageKey(key: string): key is MessageKey {
  let node: string | Group | undefined = he as Group;
  for (const part of key.split(".")) {
    if (typeof node !== "object") return false;
    node = node[part];
  }
  return typeof node === "string";
}
