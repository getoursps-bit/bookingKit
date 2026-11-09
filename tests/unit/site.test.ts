import { describe, expect, it } from "vitest";
import { formatDuration, formatPrice } from "@/i18n/format";
import { translator } from "@/i18n/translator";
import { attributionFromUrl, encodeAttribution, readAttribution } from "@/server/attribution";
import { displayPhone, socialLink, wazeLink, whatsappLink } from "@/server/links";
import type { BusinessProfile, OpeningHours } from "@/server/repos/catalog";
import { jsonLdString, localBusinessJsonLd } from "@/server/seo";

// Fictional test number in the 0555 range.
const CHAT = "+972555000123";
const SECRET = "test-only-secret-test-only-secret-00";

describe("whatsappLink", () => {
  it("uses the international number without + or a leading 0, and percent-encodes Hebrew text", () => {
    const text = translator("he")("products.orderText", { name: "מרכך", price: formatPrice(6990) });
    const link = whatsappLink(CHAT, text)!;
    expect(link.startsWith("https://wa.me/972555000123?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1]!)).toBe(text);
    expect(link).not.toMatch(/[א-ת]/);
  });

  it("returns null without a usable number", () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink("abc")).toBeNull();
  });
});

describe("other links and formats", () => {
  it("builds Waze links and accepts only https social links", () => {
    expect(wazeLink("הרצל 1, תל אביב")).toBe(
      `https://waze.com/ul?q=${encodeURIComponent("הרצל 1, תל אביב")}&navigate=yes`,
    );
    expect(socialLink("https://instagram.com/example")).toBe("https://instagram.com/example");
    expect(socialLink("javascript:alert(1)")).toBeNull();
    expect(socialLink("not a url")).toBeNull();
  });

  it("shows Israeli numbers in local form", () => {
    expect(displayPhone(CHAT)).toBe("055-500-0123");
  });

  it("formats prices and durations in Hebrew", () => {
    expect(formatPrice(22000)).toMatch(/220/);
    expect(formatPrice(22000)).toContain("₪");
    expect(formatPrice(6990)).toMatch(/69\.90/);
    expect(formatDuration(50)).toBe("50 דקות");
    expect(formatDuration(60)).toBe("שעה");
    expect(formatDuration(80)).toBe("שעה ו-20 דקות");
    expect(formatDuration(100)).toBe("שעה ו-40 דקות");
    expect(formatDuration(150)).toBe("שעתיים ו-30 דקות");
  });
});

describe("LocalBusiness JSON-LD", () => {
  const profile: BusinessProfile = {
    name: "Example Salon",
    tagline: "מספרה לכלבים ולחתולים",
    taglineEn: null,
    city: "עיר לדוגמה",
    address: "רחוב לדוגמה 1",
    phoneE164: CHAT,
    social: { instagram: "https://instagram.com/example", tiktok: "javascript:bad" },
    logoKey: null,
    coverKey: null,
  };
  const hours: OpeningHours[] = [
    { weekday: 0, opens: "12:00", closes: "19:00", closed: false },
    { weekday: 3, opens: null, closes: null, closed: true },
  ];

  it("lists details, open days only, and safe social links", () => {
    const data = localBusinessJsonLd(profile, hours, "https://example.test");
    expect(data).toMatchObject({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Example Salon",
      telephone: CHAT,
      address: { "@type": "PostalAddress", streetAddress: "רחוב לדוגמה 1", addressCountry: "IL" },
      sameAs: ["https://instagram.com/example"],
    });
    expect(data.openingHoursSpecification).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Sunday", opens: "12:00", closes: "19:00" },
    ]);
  });

  it("leaves out missing details instead of guessing", () => {
    const data = localBusinessJsonLd({ ...profile, phoneE164: null, address: null, city: null, social: {} }, [], "x");
    expect(data).not.toHaveProperty("telephone");
    expect(data).not.toHaveProperty("address");
    expect(data).not.toHaveProperty("sameAs");
  });

  it("cannot close its script tag", () => {
    expect(jsonLdString({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});

describe("campaign attribution", () => {
  it("keeps utm tags and fbclid with the landing page, and nothing else", () => {
    const tags = attributionFromUrl(new URL("https://x.test/l/dog-grooming?utm_source=instagram&fbclid=abc&other=1"));
    expect(tags).toEqual({ utm_source: "instagram", fbclid: "abc", landing: "/l/dog-grooming" });
    expect(attributionFromUrl(new URL("https://x.test/?other=1"))).toBeNull();
  });

  it("round-trips through the signed cookie and rejects tampering", () => {
    const cookie = encodeAttribution(SECRET, { utm_source: "instagram" });
    expect(readAttribution(SECRET, cookie)).toEqual({ utm_source: "instagram" });
    expect(readAttribution(SECRET, `${cookie}x`)).toEqual({});
    expect(readAttribution("another-secret-another-secret-0000", cookie)).toEqual({});
    expect(readAttribution(SECRET, undefined)).toEqual({});
  });
});
