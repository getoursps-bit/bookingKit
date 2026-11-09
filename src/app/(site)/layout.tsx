import type { ReactNode } from "react";
import { BottomBar } from "@/components/site/BottomBar";
import { InstallPrompt } from "@/components/site/InstallPrompt";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getSiteData } from "@/server/site";
import { getStorage } from "@/server/storage";

// Every public page reads the owner's content at request time, and the
// per-request script nonce needs a dynamic render anyway.
export const dynamic = "force-dynamic";

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
