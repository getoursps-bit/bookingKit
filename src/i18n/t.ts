import type he from "./he.json";

// The types and the two small helpers every caller shares. This file holds no
// strings, so browser code can import it freely; the strings reach the browser
// through next-intl's provider in the root layout.

/** The dotted keys of a nested language file. */
export type Paths<Group, Prefix extends string = ""> = {
  [Key in keyof Group & string]: Group[Key] extends string ? `${Prefix}${Key}` : Paths<Group[Key], `${Prefix}${Key}.`>;
}[keyof Group & string];

/** Every string's key, written with dots: "home.heroTitle". */
export type MessageKey = Paths<typeof he>;
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

// Unicode first-strong isolate and pop-directional isolate. Wrapping a value in
// them keeps phone numbers, prices and times in the right order inside Hebrew
// text, in HTML and in plain-text messages alike. In English they do no harm.
const FSI = "⁨";
const PDI = "⁩";

/** Wraps a value so it keeps its own direction inside surrounding text. */
export function isolate(value: string | number): string {
  return `${FSI}${value}${PDI}`;
}

/** next-intl's translator, whatever strings it was made for. */
type LibraryTranslator = { raw(key: never): unknown };
/** The part of it used here: format a string, or read it as written. */
type Lookup = { (key: string, values?: Record<string, string>): string; raw(key: string): unknown };

/**
 * Our string lookup on top of the library's: every value is isolated, and a
 * placeholder with no value stays visible as `{name}` instead of failing.
 */
export function withIsolation(library: LibraryTranslator): Translate {
  const translate = library as unknown as Lookup;
  return (key, vars = {}) => {
    const names = [...String(translate.raw(key)).matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
    if (names.length === 0) return translate(key);
    const values: Record<string, string> = {};
    for (const name of names) {
      const value = vars[name];
      values[name] = value === undefined ? `{${name}}` : isolate(value);
    }
    return translate(key, values);
  };
}
