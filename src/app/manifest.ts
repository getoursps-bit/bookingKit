import type { MetadataRoute } from "next";
import { brand, theme } from "@/brand";
import { translator } from "@/i18n/translator";

export const dynamic = "force-static";


/** Lets visitors install the site as an app on phones and desktops. */
export default function manifest(): MetadataRoute.Manifest {
  const t = translator("he");
  return {
    id: "/",
    name: `${brand.name.he} – ${t("home.eyebrow")}`,
    short_name: brand.name.he,
    description: "קביעת תור, שירותים ומחירים, מוצרים ושעות פתיחה.",
    lang: "he",
    dir: "rtl",
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
      { name: "קביעת תור", url: "/go/book", icons: [{ src: "/app-icon/96", sizes: "96x96", type: "image/png" }] },
      { name: "שירותים ומחירים", url: "/services" },
      { name: "שעות פתיחה", url: "/hours" },
    ],
  };
}
