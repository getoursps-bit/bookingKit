import type { ReactNode } from "react";
import { BottomBar } from "@/views/parts/site/BottomBar";
import { InstallPrompt } from "@/views/parts/site/InstallPrompt";
import { SiteFooter } from "@/views/parts/site/SiteFooter";
import { SiteHeader } from "@/views/parts/site/SiteHeader";
import { getSiteData } from "@/core/website/site";
import { getStorage } from "@/core/platform/storage";


export default async function SiteLayout({ children }: { children: ReactNode }) {
  const { profile } = await getSiteData();
  const logoUrl = profile.logoKey ? getStorage().publicUrl(profile.logoKey) || null : null;
  return (
    <>
      <SiteHeader profile={profile} logoUrl={logoUrl} />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-6 pb-12 md:px-6 md:pt-8">
        {children}
      </main>
      <InstallPrompt />
      <SiteFooter profile={profile} />
      <BottomBar />
    </>
  );
}
