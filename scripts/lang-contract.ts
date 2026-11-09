import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TRANSLATABLE } from "../src/server/translation/content";
import { flatten } from "../src/i18n/flatten";
import seed from "../db/seed/data.json";

// Describes everything a language pack holds, so that a person or an AI can
// fill one from this file alone: every interface string with its
// placeholders, and every piece of starting content with its field limits.
// The text of each pack already in the kit is shown beside each entry.
// Written to languages/contract.json by `pnpm brand`; checked against the
// packs by `pnpm lang:check`.

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LANGUAGES_DIR = path.join(ROOT, "languages");
/** The pack every other one is measured against: it is the one the code is written with. */
export const REFERENCE = "he";

export type Content = Record<string, Record<string, Record<string, string>>>;

/** Every value a string takes, plural ones included: "{when}", "{hours, plural, …}". */
export const placeholders = (text: string) => [...text.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1]!).sort();

/** The codes of every pack in the kit, the reference first. */
export function packCodes(): string[] {
  const codes = readdirSync(LANGUAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return [REFERENCE, ...codes.filter((code) => code !== REFERENCE)];
}

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export const messagesOf = (code: string, dir = LANGUAGES_DIR): Record<string, string> | null => {
  const file = readJson<Record<string, unknown>>(path.join(dir, code, "messages.json"));
  return file ? flatten(file as Record<string, string>) : null;
};
export const contentOf = (code: string, dir = LANGUAGES_DIR): Content | null =>
  readJson<Content>(path.join(dir, code, "content.json"));

/** The keys the starting content has for each kind of row, from the seed's structure. */
export function seedKeys(): Record<string, string[]> {
  return {
    service: seed.services.map((service) => service.key),
    product: seed.products.map((product) => product.key),
    message_template: seed.message_templates.map((template) => `${template.key}:${template.channel}`),
  };
}

export type Contract = {
  /** Which pack the keys and placeholders come from. */
  reference: string;
  /** How to fill a pack, in plain words. */
  howTo: string[];
  strings: Record<string, { placeholders: string[]; text: Record<string, string> }>;
  content: Record<
    string,
    {
      fields: Record<string, { max: number; keepPlaceholders?: true }>;
      items: Record<string, Record<string, { placeholders: string[]; text: Record<string, string> }>>;
    }
  >;
};

export function contract(): Contract {
  const codes = packCodes();
  const messages = Object.fromEntries(codes.map((code) => [code, messagesOf(code) ?? {}]));
  const content = Object.fromEntries(codes.map((code) => [code, contentOf(code) ?? {}]));
  const reference = messages[REFERENCE]!;
  const strings: Contract["strings"] = {};
  for (const [key, text] of Object.entries(reference)) {
    const texts = Object.fromEntries(codes.filter((code) => messages[code]![key] !== undefined).map((code) => [code, messages[code]![key]!]));
    strings[key] = { placeholders: placeholders(text), text: texts };
  }
  const contentSpec: Contract["content"] = {};
  for (const [entity, keys] of Object.entries(seedKeys())) {
    const limits: Record<string, number> = TRANSLATABLE[entity as keyof typeof TRANSLATABLE];
    const fields = Object.fromEntries(
      Object.entries(limits).map(([field, max]) => [
        field,
        entity === "message_template" && field === "body" ? { max, keepPlaceholders: true as const } : { max },
      ]),
    );
    const items: Contract["content"][string]["items"] = {};
    for (const key of keys) {
      const row: Record<string, { placeholders: string[]; text: Record<string, string> }> = {};
      for (const field of Object.keys(limits)) {
        const texts = Object.fromEntries(
          codes.filter((code) => content[code]![entity]?.[key]?.[field] !== undefined).map((code) => [code, content[code]![entity]![key]![field]!]),
        );
        if (Object.keys(texts).length === 0) continue;
        row[field] = { placeholders: placeholders(texts[REFERENCE] ?? ""), text: texts };
      }
      items[key] = row;
    }
    contentSpec[entity] = { fields, items };
  }
  return {
    reference: REFERENCE,
    howTo: [
      "A language pack is the folder languages/<code>/ with pack.json, messages.json and content.json.",
      "messages.json: every key under `strings`, nested by the dots in the key, with the same placeholders as the reference text. Plural strings use ICU syntax, as the reference does.",
      "content.json: for each kind of row under `content`, the same item keys and fields; keep every field within `max` characters, and keep the placeholders of a message body exactly.",
      "%BRAND% stands for the business name and is filled in when the content is seeded.",
      "Run `pnpm lang:check <code>` until it reports nothing missing and nothing wrong.",
    ],
    strings,
    content: contentSpec,
  };
}
