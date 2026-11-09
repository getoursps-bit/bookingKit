import type { MetadataRoute } from "next";
import { getConfig } from "@/server/config";
import { getSettings } from "@/server/repos/settings";
import { isNoindex } from "@/server/site";

export const dynamic = "force-dynamic";

/** Closed to every crawler while `site.noindex` (or SITE_NOINDEX) is on. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = getConfig().APP_BASE_URL.replace(/\/$/, "");
  let closed = true;
  try {
    closed = isNoindex(await getSettings());
  } catch {
    // Without the database, stay closed.
  }
  if (closed) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/go/", "/book", "/manage/", "/admin/", "/api/"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
