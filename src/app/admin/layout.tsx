import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getI18n } from "@/i18n/server";

// The admin installs as its own home-screen app (scope /admin/), separate from
// the public site, and is never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t("admin.title"), template: `%s | ${t("admin.short")}` },
    manifest: "/admin/manifest.webmanifest",
    robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: t("admin.short"), statusBarStyle: "default" },
  };
}

export const dynamic = "force-dynamic";

export default function AdminRoot({ children }: { children: ReactNode }) {
  return children;
}
