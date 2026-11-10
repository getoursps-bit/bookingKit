import path from "node:path";
import { fileURLToPath } from "node:url";
import { packSchema } from "../src/brand.schema";
import { TRANSLATABLE } from "../src/core/platform/translation";
import {
  contentOf,
  extensionIds,
  extensionMessagesOf,
  LANGUAGES_DIR,
  messagesOf,
  packCodes,
  placeholders,
  readJson,
  REFERENCE,
  seedKeys,
} from "./lang-contract";

// Checks a language pack against the reference pack and the seed: wrong things
// are errors (unknown keys, placeholders that differ, text over its limit),
// strings or content a pack does not have yet are listed as missing.
//   pnpm lang:check          every pack in languages/
//   pnpm lang:check ar       one pack

export type Report = { code: string; errors: string[]; missing: string[] };

/** `dir` is where the pack folders are; the reference pack is always read from the kit's own. */
export function checkPack(code: string, dir = LANGUAGES_DIR): Report {
  const errors: string[] = [];
  const missing: string[] = [];
  const pack = readJson<unknown>(path.join(dir, code, "pack.json"));
  if (!pack) errors.push("pack.json is missing");
  else {
    const parsed = packSchema.safeParse(pack);
    if (!parsed.success) errors.push(...parsed.error.issues.map((issue) => `pack.json ${issue.path.join(".")}: ${issue.message}`));
  }

  const reference = messagesOf(REFERENCE)!;
  const messages = messagesOf(code, dir);
  if (!messages) errors.push("messages.json is missing");
  else {
    for (const [key, text] of Object.entries(reference)) {
      const own = messages[key];
      if (own === undefined || own.trim() === "") missing.push(`string ${key}`);
      else if (placeholders(own).join(",") !== placeholders(text).join(","))
        errors.push(`string ${key}: placeholders {${placeholders(own).join(", ")}} should be {${placeholders(text).join(", ")}}`);
    }
    for (const key of Object.keys(messages)) if (!(key in reference)) errors.push(`string ${key} is not in the reference pack`);
  }

  // Each extension's strings, against its own reference-language file.
  for (const id of extensionIds()) {
    const own = extensionMessagesOf(id, REFERENCE);
    const theirs = extensionMessagesOf(id, code);
    for (const [key, text] of Object.entries(own)) {
      const value = theirs[key];
      if (value === undefined || value.trim() === "") missing.push(`${id} string ${key}`);
      else if (placeholders(value).join(",") !== placeholders(text).join(","))
        errors.push(`${id} string ${key}: placeholders {${placeholders(value).join(", ")}} should be {${placeholders(text).join(", ")}}`);
    }
    for (const key of Object.keys(theirs)) if (!(key in own)) errors.push(`${id} string ${key} is not in the extension's reference file`);
  }

  const referenceContent = contentOf(REFERENCE) ?? {};
  const content = contentOf(code, dir);
  if (!content) errors.push("content.json is missing");
  else {
    const keys = seedKeys();
    for (const [entity, items] of Object.entries(content)) {
      if (!(entity in keys)) {
        errors.push(`content ${entity} is not a kind of starting content`);
        continue;
      }
      const limits: Record<string, number> = TRANSLATABLE[entity as keyof typeof TRANSLATABLE];
      for (const [key, fields] of Object.entries(items)) {
        if (!keys[entity]!.includes(key)) {
          errors.push(`content ${entity}.${key} is not in the seed`);
          continue;
        }
        for (const [field, text] of Object.entries(fields)) {
          const max = limits[field];
          if (max === undefined) errors.push(`content ${entity}.${key}.${field} is not a field of ${entity}`);
          else if (text.length > max) errors.push(`content ${entity}.${key}.${field} is ${text.length} characters, at most ${max}`);
          const source = referenceContent[entity]?.[key]?.[field];
          if (entity === "message_template" && field === "body" && source && placeholders(text).join(",") !== placeholders(source).join(","))
            errors.push(`content ${entity}.${key}.${field}: placeholders should be {${placeholders(source).join(", ")}}`);
        }
      }
    }
    for (const [entity, entityKeys] of Object.entries(keys)) {
      for (const key of entityKeys) {
        for (const field of Object.keys(referenceContent[entity]?.[key] ?? {})) {
          if (!content[entity]?.[key]?.[field]?.trim()) missing.push(`content ${entity}.${key}.${field}`);
        }
      }
    }
  }
  return { code, errors, missing };
}

function main(): void {
  const codes = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const reports = (codes.length ? codes : packCodes()).map((code) => checkPack(code));
  let failed = false;
  for (const { code, errors, missing } of reports) {
    const state = errors.length ? `${errors.length} wrong` : missing.length ? `${missing.length} missing` : "complete";
    console.log(`${code}: ${state}`);
    for (const error of errors) console.log(`  wrong: ${error}`);
    if (missing.length) console.log(`  missing: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? `, … (${missing.length})` : ""}`);
    if (errors.length) failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
