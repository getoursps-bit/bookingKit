import { describe, expect, it } from "vitest";
import { appleMapLink } from "@ext/map-links/links";
import type { BusinessProfile } from "@/core/website/content";
import { hasExtension } from "@/extension/registry";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { translator } from "@/i18n/translator";
import { contactButtons } from "@/views/parts/site/ContactButtons";

const profile: BusinessProfile = {
  name: "Sample",
  tagline: null,
  translations: {},
  city: "Sample Town",
  address: "1 Example Street",
  phoneE164: null,
  social: {},
  logoKey: null,
  coverKey: null,
};

describe("the contact row", () => {
  it("shows only what the owner filled in, and the maps apps when the map-links extension is on", () => {
    const keys = contactButtons(translator(DEFAULT_LOCALE), profile, null).map((button) => button.key);
    expect(keys).toEqual(hasExtension("map-links") ? ["waze", "googleMaps", "appleMaps"] : ["waze"]);
    expect(contactButtons(translator(DEFAULT_LOCALE), { ...profile, address: null }, null)).toEqual([]);
  });

  it("the maps apps get the street with the city", () => {
    expect(appleMapLink("1 Example Street, Sample Town")).toBe("https://maps.apple.com/?q=1%20Example%20Street%2C%20Sample%20Town");
    expect(appleMapLink(null)).toBeNull();
  });
});
