import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import { formatDuration, formatPrice } from "@/i18n/format";
import he from "@/i18n/he.json";
import { pick } from "@/i18n/content";
import { isLocalizedPath, localePath, splitLocale } from "@/i18n/locales";
import { isolate, translator } from "@/i18n/t";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translator()", () => {
  it("fills placeholders and isolates left-to-right values", () => {
    expect(translator("he")("site.callUs", { phone: "050-1234567" })).toBe("לשאלות אפשר להתקשר: ⁨050-1234567⁩");
    expect(translator("en")("site.callUs", { phone: "050-1234567" })).toContain("⁨050-1234567⁩");
  });

  it("leaves unknown placeholders visible", () => {
    expect(translator("he")("site.callUs")).toContain("{phone}");
  });

  it("isolates numbers", () => {
    expect(isolate(39.9)).toBe("⁨39.9⁩");
  });
});

describe("the two dictionaries", () => {
  it("have the same keys and the same placeholders in each string", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(he).sort());
    for (const [key, text] of Object.entries(he)) {
      expect(placeholders(en[key as keyof typeof en]), key).toEqual(placeholders(text));
    }
  });

  it("has no Hebrew letters left in English strings, except the switch back to Hebrew", () => {
    const allowed = new Set(["lang.other", "lang.name.he"]);
    const hebrew = Object.entries(en).filter(([key, text]) => !allowed.has(key) && /[א-ת]/.test(text));
    expect(hebrew).toEqual([]);
  });
});

describe("language addresses", () => {
  it("adds /en to public pages and leaves Hebrew at the plain address", () => {
    expect(localePath("en", "/")).toBe("/en");
    expect(localePath("en", "/book?step=pets")).toBe("/en/book?step=pets");
    expect(localePath("en", "/?source=app")).toBe("/en?source=app");
    expect(localePath("he", "/en/services")).toBe("/services");
    expect(localePath("en", "/en/services")).toBe("/en/services");
  });

  it("never prefixes the owner area, APIs, redirects or files", () => {
    for (const path of ["/admin", "/admin/inbox", "/api/booking/hold", "/go/book", "/healthz", "/sw.js", "//evil.example"]) {
      expect(localePath("en", path)).toBe(path);
    }
  });

  it("treats only public pages as carrying a language, so APIs never reset the choice", () => {
    expect(isLocalizedPath("/")).toBe(true);
    expect(isLocalizedPath("/en/book")).toBe(true);
    for (const path of ["/api/booking/hold", "/lang/en", "/go/book", "/admin", "/manifest.webmanifest"]) {
      expect(isLocalizedPath(path), path).toBe(false);
    }
  });

  it("splits the language from the path", () => {
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/en/b/abc")).toEqual({ locale: "en", path: "/b/abc" });
    expect(splitLocale("/en?x=1")).toEqual({ locale: "en", path: "/?x=1" });
    expect(splitLocale("/english")).toEqual({ locale: "he", path: "/english" });
    expect(splitLocale("/services")).toEqual({ locale: "he", path: "/services" });
  });
});

describe("owner content and formats in English", () => {
  it("falls back to Hebrew when the English field is empty", () => {
    expect(pick("en", "תספורת", "Haircut")).toBe("Haircut");
    expect(pick("en", "תספורת", null)).toBe("תספורת");
    expect(pick("en", "תספורת", "  ")).toBe("תספורת");
    expect(pick("he", "תספורת", "Haircut")).toBe("תספורת");
  });

  it("formats prices and durations", () => {
    expect(formatPrice(22000, "en")).toMatch(/₪\s?220/);
    expect(formatDuration(50, "en")).toBe("50 min");
    expect(formatDuration(80, "en")).toBe("1 h 20 min");
  });
});
