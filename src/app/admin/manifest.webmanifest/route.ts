import { NextResponse } from "next/server";
import { brandName, theme } from "@/brand";
import { DEFAULT_LOCALE, dirOf } from "@/i18n/locales";
import { translator } from "@/i18n/translator";

export const dynamic = "force-static";

/** The admin's own installable app: scope /admin/, so it opens straight into the admin. */
export function GET() {
  const t = translator(DEFAULT_LOCALE);
  return NextResponse.json(
    {
      id: "/admin/",
      name: `${brandName(DEFAULT_LOCALE)} – ${t("admin.short")}`,
      short_name: t("admin.short"),
      lang: DEFAULT_LOCALE,
      dir: dirOf(DEFAULT_LOCALE),
      start_url: "/admin/",
      scope: "/admin/",
      display: "standalone",
      theme_color: theme.colors.brand,
      background_color: theme.colors.canvas,
      icons: [
        { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/app-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
