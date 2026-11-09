import type { MetadataRoute } from "next";
import { LANDING_PAGES } from "@/landing";
import { localePath } from "@/i18n/locales";
import { getConfig } from "@/server/config";

export const dynamic = "force-dynamic";

const PAGES = ["/", "/services", "/products", "/gallery", "/hours", "/contact", "/accessibility", "/privacy"];

/** Every public page in both languages, each listing its other-language twin. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getConfig().APP_BASE_URL.replace(/\/$/, "");
  const paths = [...PAGES, ...Object.keys(LANDING_PAGES).map((slug) => `/l/${slug}`)];
  return paths.flatMap((path) => {
    const languages = { he: `${base}${localePath("he", path)}`, en: `${base}${localePath("en", path)}` };
    return [
      { url: languages.he, alternates: { languages } },
      { url: languages.en, alternates: { languages } },
    ];
  });
}
