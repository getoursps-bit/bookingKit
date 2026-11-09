import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandCss, CSS_FILE, readClient } from "../../scripts/brand-css";
import type { ThemeColor } from "../../src/brand.schema";

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

describe("client.json", () => {
  it("matches the schema", () => {
    expect(client.brand.name.he).not.toBe("");
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
