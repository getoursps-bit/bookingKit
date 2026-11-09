import { NextResponse } from "next/server";
import { brand, theme } from "@/brand";
import { translator } from "@/i18n/t";

export const dynamic = "force-static";

/** The admin's own installable app: scope /admin/, so it opens straight into the admin. */
export function GET() {
  const t = translator("he");
  return NextResponse.json(
    {
      id: "/admin/",
      name: `${brand.name.he} – ${t("admin.short")}`,
      short_name: t("admin.short"),
      lang: "he",
      dir: "rtl",
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
