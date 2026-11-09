import type { Translate } from "@/i18n/t";

// The extension's own strings are not in the core's list of keys, so its code
// reads them through a translator that takes any key.

export type Say = (key: string, vars?: Record<string, string | number>) => string;

/** The page's or a language's translator, for the extension's own keys. */
export function say(t: Translate): Say {
  return t as unknown as Say;
}
