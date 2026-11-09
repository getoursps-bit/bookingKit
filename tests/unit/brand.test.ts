import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandCss, CSS_FILE, readClient } from "../../scripts/brand-css";
import type { ThemeColor } from "../../src/brand.schema";
import en from "../../src/i18n/en.json";
import he from "../../src/i18n/he.json";
import { translator } from "../../src/i18n/t";

const client = readClient();

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
  it("matches the schema", () => {
    expect(client.brand.name.he).not.toBe("");
  });

  it("puts the client's name and wording into the interface strings", () => {
    expect(translator("he")("site.name")).toBe(client.brand.name.he);
    expect(translator("en")("admin.title")).toContain(client.brand.name.en);
    for (const [key, text] of Object.entries(client.brand.messages.he)) expect(translator("he")(key as keyof typeof he)).toBe(text);
  });

  it("only rewords strings that exist, with the same placeholders", () => {
    for (const [locale, base] of Object.entries({ he, en } as const)) {
      for (const [key, text] of Object.entries(client.brand.messages[locale as "he" | "en"])) {
        expect(base, `${locale} ${key}`).toHaveProperty([key]);
        expect(placeholders(text), `${locale} ${key}`).toEqual(placeholders(base[key as keyof typeof base]));
      }
    }
  });

  it("is what src/app/brand.css was written from (run `pnpm brand`)", () => {
    expect(readFileSync(CSS_FILE, "utf8")).toBe(brandCss(client));
  });

  for (const [text, backgrounds] of TEXT_PAIRS) {
    for (const background of backgrounds) {
      it(`${text} on ${background} is readable (4.5:1)`, () => {
        const { colors } = client.theme;
        expect(contrast(colors[text], colors[background])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("field edges stand out from the field (3:1)", () => {
    const { colors } = client.theme;
    expect(contrast(colors["field-line"], colors.surface)).toBeGreaterThanOrEqual(3);
  });
});
