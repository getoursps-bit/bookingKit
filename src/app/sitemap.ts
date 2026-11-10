import type { MetadataRoute } from "next";
import { LANDING_PAGES } from "@/core/website/landing";
import { localePath, LOCALES } from "@/i18n/locales";
import { getConfig } from "@/core/platform/config";

export const dynamic = "force-dynamic";

const PAGES = ["/", "/services", "/products", "/gallery", "/hours", "/contact", "/accessibility", "/privacy"];

/** Every public page in every language, each listing its twins in the other languages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getConfig().APP_BASE_URL.replace(/\/$/, "");
  const paths = [...PAGES, ...Object.keys(LANDING_PAGES).map((slug) => `/l/${slug}`)];
  return paths.flatMap((path) => {
    const languages = Object.fromEntries(LOCALES.map((locale) => [locale, `${base}${localePath(locale, path)}`]));
    return LOCALES.map((locale) => ({ url: languages[locale]!, alternates: { languages } }));
  });
}
