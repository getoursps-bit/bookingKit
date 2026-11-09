import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { theme } from "@/brand";
import { SkipLink } from "@/components/ui/SkipLink";
import { getI18n } from "@/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("site.name"),
    applicationName: t("site.name"),
    manifest: "/manifest.webmanifest",
    icons: { icon: "/app-icon/192", apple: "/app-icon/180" },
    appleWebApp: { capable: true, title: t("site.name"), statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the bottom bar sit under the iPhone home indicator, padded by safe-area insets.
  viewportFit: "cover",
  themeColor: theme.colors.brand,
};

/** Shell shared by the public site and the admin: page language and direction. Each group adds its own header. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, dir } = await getI18n();
  return (
    <html lang={locale} dir={dir}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <SkipLink />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
