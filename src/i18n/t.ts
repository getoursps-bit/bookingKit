import { brand } from "../brand";
import en from "./en.json";
import he from "./he.json";
import type { Locale } from "./locales";

export type MessageKey = keyof typeof he;
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

type Dictionary = Record<MessageKey, string>;

/** A dictionary with the client's own wording laid over it, and `{brand}` filled with the client's name. */
function forClient(locale: Locale, base: Dictionary): Dictionary {
  const strings = { ...base, ...brand.messages[locale] } as Dictionary;
  for (const key of Object.keys(strings) as MessageKey[])
    strings[key] = strings[key].replaceAll("{brand}", brand.name[locale]);
  return strings;
}

// Both dictionaries carry every key; the type check fails if English misses one.
const STRINGS: Record<Locale, Dictionary> = { he: forClient("he", he), en: forClient("en", en) };

// Unicode first-strong isolate and pop-directional isolate. Wrapping a value in
// them keeps phone numbers, prices and times in the right order inside Hebrew
// text, in HTML and in plain-text messages alike. In English they do no harm.
const FSI = "⁨";
const PDI = "⁩";

/** Wraps a value so it keeps its own direction inside surrounding text. */
export function isolate(value: string | number): string {
  return `${FSI}${value}${PDI}`;
}

/** The string lookup for one language: fills `{name}` placeholders, isolating each value. */
export function translator(locale: Locale): Translate {
  const strings = STRINGS[locale];
  return (key, vars = {}) =>
    strings[key].replace(/\{(\w+)\}/g, (placeholder, name: string) => {
      const value = vars[name];
      return value === undefined ? placeholder : isolate(value);
    });
}
