import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPack } from "../../scripts/lang-check";
import { packCodes } from "../../scripts/lang-contract";
import { LOCALES } from "../../src/i18n/locales";

describe("the language packs", () => {
  for (const code of packCodes()) {
    it(`${code} has nothing wrong`, () => {
      expect(checkPack(code).errors).toEqual([]);
    });
  }

  for (const code of LOCALES) {
    it(`${code}, which this client uses, is complete`, () => {
      expect(checkPack(code).missing).toEqual([]);
    });
  }

  it("names what is wrong and what is missing in a bad pack", () => {
    const report = checkPack("xx", path.resolve(import.meta.dirname, "../fixtures/languages"));
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("string site.callUs: placeholders {telephone} should be {phone}"),
        expect.stringContaining("string nope.x is not in the reference pack"),
        expect.stringContaining("content service.cat.name is 81 characters, at most 80"),
        expect.stringContaining("content service.cat.colour is not a field of service"),
        expect.stringContaining("content service.unicorn is not in the seed"),
        expect.stringContaining("content message_template.code:messaging.body: placeholders should be {code}"),
        expect.stringContaining("content furniture is not a kind of starting content"),
      ]),
    );
    expect(report.errors).toHaveLength(7);
    expect(report.missing.length).toBeGreaterThan(500);
    expect(report.missing).toContain("string home.heroTitle");
    expect(report.missing).toContain("content product.conditioner.name");
  });
});
