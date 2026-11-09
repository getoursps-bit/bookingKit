import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generated, localesOf, readClient } from "../../scripts/apply-client";
import { brandName } from "../../src/brand";
import type { ThemeColor } from "../../src/brand.schema";
import { flatten } from "../../src/i18n/flatten";
import { LOCALES } from "../../src/i18n/locales";
import type { MessageKey } from "../../src/i18n/t";
import { translator } from "../../src/i18n/translator";

const ROOT = path.resolve(import.meta.dirname, "../..");
const client = readClient();
/** A language pack's strings as written, before the client's wording is laid over them. */
const pack = (code: string): Record<string, string> =>
  flatten(JSON.parse(readFileSync(path.join(ROOT, "languages", code, "messages.json"), "utf8")) as Record<string, string>);
// A second client with another name, palette, fonts and mark: proves the file can be swapped.
const sample = readClient(path.join(ROOT, "tests/fixtures/client.sample.json"));

/** Relative luminance of a #rrggbb colour (WCAG 2). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(text: string, background: string): number {
  const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// Text colour first, then each background it is used on.
const TEXT_PAIRS: [ThemeColor, ThemeColor[]][] = [
  ["ink", ["canvas", "surface", "paper", "placeholder"]],
  ["ink-soft", ["canvas", "surface", "paper"]],
  ["ink-muted", ["canvas", "surface", "paper"]],
  ["brand-ink", ["brand", "brand-strong"]],
  ["brand-strong", ["canvas", "surface", "brand-soft"]],
  ["brand-deep", ["canvas", "surface"]],
  ["tint-pink-ink", ["tint-pink"]],
  ["tint-yellow-ink", ["tint-yellow"]],
  ["tint-mint-ink", ["tint-mint"]],
  ["tint-lilac-ink", ["tint-lilac"]],
  ["peach-ink", ["peach", "peach-soft"]],
  ["night-ink", ["night"]],
];

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("client.json", () => {
  it("lists the languages the code was generated for", () => {
    expect([...LOCALES]).toEqual(localesOf(client));
  });

  it("puts the client's name and wording into the interface strings", () => {
    for (const locale of LOCALES) {
      expect(translator(locale)("site.name")).toBe(brandName(locale));
      expect(translator(locale)("admin.title")).toContain(brandName(locale));
      for (const [key, text] of Object.entries(client.brand.messages[locale] ?? {}))
        expect(translator(locale)(key as MessageKey)).toBe(text);
    }
  });

  it("only rewords strings that exist, in its own languages, with the same placeholders", () => {
    for (const [locale, wording] of Object.entries(client.brand.messages)) {
      expect(localesOf(client)).toContain(locale);
      const base = pack(locale);
      for (const [key, text] of Object.entries(wording)) {
        expect(base, `${locale} ${key}`).toHaveProperty([key]);
        expect(placeholders(text), `${locale} ${key}`).toEqual(placeholders(base[key] ?? ""));
      }
    }
  });

  it("is what the generated files were written from (run `pnpm brand`)", () => {
    for (const [file, content] of Object.entries(generated(client)))
      expect(readFileSync(path.join(ROOT, file), "utf8"), file).toBe(content);
  });
});

for (const [file, { theme }] of Object.entries({ "client.json": client, "client.sample.json": sample })) {
  describe(`the palette of ${file}`, () => {
    for (const [text, backgrounds] of TEXT_PAIRS) {
      for (const background of backgrounds) {
        it(`${text} on ${background} is readable (4.5:1)`, () => {
          expect(contrast(theme.colors[text], theme.colors[background])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    it("field edges stand out from the field (3:1)", () => {
      expect(contrast(theme.colors["field-line"], theme.colors.surface)).toBeGreaterThanOrEqual(3);
    });
  });
}

/** Every file under a folder, skipping build output. */
function filesIn(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const file = path.join(folder, name);
    if (name === "dist" || name === "node_modules") return [];
    return statSync(file).isDirectory() ? filesIn(file) : [file];
  });
}

describe("the rest of the code", () => {
  // The name and the accent colour stand for everything that belongs to one
  // client. brand.css is written from client.json, so it is the one exception.
  it("does not repeat the client's name or accent colour", () => {
    const words = [...Object.values(client.brand.name), client.theme.colors.brand];
    const generated = path.join(ROOT, "src/app/brand.css");
    const found = ["src", "public", "worker", "scripts", "db"]
      .flatMap((folder) => filesIn(path.join(ROOT, folder)))
      .filter((file) => file !== generated)
      .filter((file) => {
        const text = readFileSync(file, "utf8").toLowerCase();
        return words.some((word) => text.includes(word.toLowerCase()));
      })
      .map((file) => path.relative(ROOT, file));
    expect(found).toEqual([]);
  });
});
