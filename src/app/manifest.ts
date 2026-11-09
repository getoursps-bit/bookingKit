import type { MetadataRoute } from "next";
import { brandName, theme } from "@/brand";
import { DEFAULT_LOCALE, dirOf } from "@/i18n/locales";
import { translator } from "@/i18n/translator";

export const dynamic = "force-static";

/** Lets visitors install the site as an app on phones and desktops. */
export default function manifest(): MetadataRoute.Manifest {
  const t = translator(DEFAULT_LOCALE);
  const name = brandName(DEFAULT_LOCALE);
  return {
    id: "/",
    name: `${name} – ${t("home.eyebrow")}`,
    short_name: name,
    description: t("pwa.description"),
    lang: DEFAULT_LOCALE,
    dir: dirOf(DEFAULT_LOCALE),
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    theme_color: theme.colors.brand,
    background_color: theme.colors.canvas,
    categories: ["lifestyle", "shopping"],
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: t("nav.book"), url: "/go/book", icons: [{ src: "/app-icon/96", sizes: "96x96", type: "image/png" }] },
      { name: t("nav.services"), url: "/services" },
      { name: t("nav.hours"), url: "/hours" },
    ],
  };
}
