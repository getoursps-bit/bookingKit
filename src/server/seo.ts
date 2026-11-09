import type { Metadata } from "next";
import type { BusinessProfile, OpeningHours } from "./repos/catalog";
import { pick } from "@/i18n/content";
import { localePath, LOCALES, othersThan, PACKS } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { socialLink } from "./links";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * schema.org LocalBusiness data for search engines, built from the owner's
 * details. Missing details are left out rather than guessed.
 */
export function localBusinessJsonLd(profile: BusinessProfile, hours: OpeningHours[], baseUrl: string) {
  const sameAs = Object.values(profile.social)
    .map((value) => socialLink(value))
    .filter((value): value is string => value !== null);
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: profile.name,
    url: baseUrl,
    ...(profile.tagline ? { description: profile.tagline } : {}),
    ...(profile.phoneE164 ? { telephone: profile.phoneE164 } : {}),
    ...(profile.address || profile.city
      ? {
          address: {
            "@type": "PostalAddress",
            ...(profile.address ? { streetAddress: profile.address } : {}),
            ...(profile.city ? { addressLocality: profile.city } : {}),
            addressCountry: "IL",
          },
        }
      : {}),
    openingHoursSpecification: hours
      .filter((day) => !day.closed && day.opens && day.closes)
      .map((day) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${DAY_NAMES[day.weekday]}`,
        opens: day.opens,
        closes: day.closes,
      })),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** Serialises JSON-LD for a script tag; "<" is escaped so the data cannot close the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Title, description, canonical address and the other-language alternate for a
 * public page, in the language of the request.
 */
export async function pageMetadata(
  profile: BusinessProfile,
  page: { title?: string; description?: string; path: string },
  noindex: boolean,
): Promise<Metadata> {
  const locale = await getLocale();
  const title = page.title ? `${page.title} | ${profile.name}` : profile.name;
  const description = page.description ?? pick(locale, profile, "tagline") ?? undefined;
  return {
    title,
    description,
    alternates: {
      canonical: localePath(locale, page.path),
      languages: {
        ...Object.fromEntries(LOCALES.map((language) => [language, localePath(language, page.path)])),
        "x-default": page.path,
      },
    },
    openGraph: {
      title,
      description,
      locale: PACKS[locale].openGraph,
      alternateLocale: othersThan(locale).map((language) => PACKS[language].openGraph),
      type: "website",
      siteName: profile.name,
    },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
  };
}
