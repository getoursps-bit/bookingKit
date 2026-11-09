import { NextResponse } from "next/server";

export const dynamic = "force-static";

/** The admin's own installable app: scope /admin/, so it opens straight into the admin. */
export function GET() {
  return NextResponse.json(
    {
      id: "/admin/",
      name: "Fluffy Fur – ניהול",
      short_name: "ניהול",
      lang: "he",
      dir: "rtl",
      start_url: "/admin/",
      scope: "/admin/",
      display: "standalone",
      theme_color: "#2b2238",
      background_color: "#fbf6f1",
      icons: [
        { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/app-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
