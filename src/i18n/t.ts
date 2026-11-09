import en from "./en.json";
import he from "./he.json";
import type { Locale } from "./locales";

export type MessageKey = keyof typeof he;
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

// Both dictionaries carry every key; the type check fails if English misses one.
const STRINGS: Record<Locale, Record<MessageKey, string>> = { he, en };

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
