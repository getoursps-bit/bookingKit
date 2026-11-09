import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const THEME = "#b23a6b";
const BACKGROUND = "#fff8f5";

/** Lets visitors install the site as an app on phones and desktops. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Fluffy Fur – מספרה לכלבים ולחתולים",
    short_name: "Fluffy Fur",
    description: "קביעת תור, שירותים ומחירים, מוצרים ושעות פתיחה.",
    lang: "he",
    dir: "rtl",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    theme_color: THEME,
    background_color: BACKGROUND,
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
