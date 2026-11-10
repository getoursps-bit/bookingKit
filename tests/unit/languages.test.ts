import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPack } from "../../scripts/lang-check";
import { packCodes, seedKeys } from "../../scripts/lang-contract";
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
    // The bad pack is written for whatever this client's starting content is:
    // its first service takes the place of the fixture's "cat".
    const keys = seedKeys();
    const service = keys.service![0]!;
    const fixture = path.resolve(import.meta.dirname, "../fixtures/languages/xx");
    const dir = mkdtempSync(path.join(tmpdir(), "bad-pack-"));
    try {
      cpSync(fixture, path.join(dir, "xx"), { recursive: true });
      const content = JSON.parse(readFileSync(path.join(fixture, "content.json"), "utf8")) as Record<string, Record<string, unknown>>;
      content.service = { [service]: content.service!.cat, unicorn: content.service!.unicorn };
      writeFileSync(path.join(dir, "xx", "content.json"), JSON.stringify(content));
      const report = checkPack("xx", dir);
      expect(report.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("string site.callUs: placeholders {telephone} should be {phone}"),
          expect.stringContaining("string nope.x is not in the reference pack"),
          expect.stringContaining(`content service.${service}.name is 81 characters, at most 80`),
          expect.stringContaining(`content service.${service}.colour is not a field of service`),
          expect.stringContaining("content service.unicorn is not in the seed"),
          expect.stringContaining("content message_template.code:messaging.body: placeholders should be {code}"),
          expect.stringContaining("content furniture is not a kind of starting content"),
        ]),
      );
      expect(report.errors).toHaveLength(7);
      expect(report.missing.length).toBeGreaterThan(500);
      expect(report.missing).toContain("string home.heroTitle");
      expect(report.missing).toContain("content message_template.confirmation:email.body");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
