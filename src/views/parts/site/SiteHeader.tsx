import Link from "next/link";
import { brand } from "@/brand";
import { Icon } from "@/views/parts/ui/Icon";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import type { BusinessProfile } from "@/core/website/content";
import { LanguageSwitch } from "./LanguageSwitch";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";

/** The logo, or the brand mark, in a soft blob. */
export function Logo({ url, size }: { url: string | null; size: "sm" | "lg" }) {
  const box = size === "sm" ? "size-11 md:size-13" : "size-22 border-4 border-surface";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`${box} blob shrink-0 bg-paper object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${box} blob grid shrink-0 place-items-center bg-paper text-brand`}>
      <Icon name={brand.mark} size={size === "sm" ? 24 : 36} strokeWidth={2} />
    </span>
  );
}

/**
 * Phone: menu button, the blob logo with the salon name, "Book". Desktop: the
 * same name, the main links in a white pill, "My booking", the language
 * switch and "Book".
 */
export async function SiteHeader({ profile, logoUrl }: { profile: BusinessProfile; logoUrl: string | null }) {
  const { t, lp, locale } = await getI18n();
  const name = pick(locale, profile, "name");
  return (
    <header className="sticky top-0 z-30 bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-2 px-4 py-3 md:gap-4 md:px-6 md:py-5">
        <MobileMenu />
        <Link href={lp("/")} className="flex items-center gap-2.5 text-ink no-underline md:gap-3">
          <Logo url={logoUrl} size="sm" />
          <span className="font-display text-[22px] font-semibold md:text-[26px]">{name}</span>
        </Link>

        <nav aria-label={t("nav.main")} className="hidden md:block">
          <NavLinks variant="top" />
        </nav>

        <div className="flex items-center gap-3 md:gap-4">
          <Link href={lp("/accessibility")} className="hidden text-sm font-semibold text-ink-muted xl:inline">
            {t("nav.a11yShort")}
          </Link>
          <LanguageSwitch className="hidden text-sm font-bold md:inline" />
          <Link href={lp("/contact")} className="hidden text-[15px] font-bold lg:inline">
            {t("nav.myBooking")}
          </Link>
          {/* A plain link: /go/book is a counting redirect, not a page. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/go/book"
            rel="nofollow"
            className="btn btn-primary min-h-11 px-5 text-[15px] md:min-h-12 md:px-6 md:text-base"
          >
            {t("home.bookNow")}
          </a>
        </div>
      </div>
    </header>
  );
}
