"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/i18n/client";
import { splitLocale } from "@/i18n/locales";
import type { MessageKey } from "@/i18n/t";

export const TOP_LINKS: { href: string; key: MessageKey }[] = [
  { href: "/services", key: "home.tabServices" },
  { href: "/gallery", key: "nav.gallery" },
  { href: "/hours", key: "nav.hours" },
  { href: "/products", key: "nav.products" },
  { href: "/contact", key: "nav.contact" },
];

const BOTTOM: { href: string; key: MessageKey; icon: IconName; book?: boolean }[] = [
  { href: "/", key: "nav.home", icon: "home" },
  { href: "/services", key: "nav.servicesShort", icon: "scissors" },
  { href: "/go/book", key: "nav.book", icon: "calendar", book: true },
  { href: "/products", key: "nav.products", icon: "bag" },
  { href: "/contact", key: "nav.contactShort", icon: "phone" },
];

function isCurrent(pathname: string, href: string): boolean {
  const { path } = splitLocale(pathname);
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

/** The site's main links: a row in the desktop header, a list in the phone menu, an app bar at the bottom of phones. */
export function NavLinks({ variant, onNavigate }: { variant: "top" | "menu" | "bottom"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t, lp } = useI18n();

  if (variant === "top" || variant === "menu") {
    return (
      <ul
        className={
          variant === "top" ? "flex flex-wrap items-center gap-1 rounded-full bg-surface p-1.5" : "flex flex-col"
        }
      >
        {TOP_LINKS.map((link) => {
          const current = isCurrent(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={lp(link.href)}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={
                  variant === "top"
                    ? `block rounded-full px-4 py-2.5 text-[15px] font-bold text-ink no-underline hover:bg-paper ${current ? "bg-paper text-brand-strong" : ""}`
                    : `flex min-h-12 items-center border-b border-line px-1 text-lg text-ink no-underline ${current ? "font-semibold text-brand-strong" : ""}`
                }
              >
                {t(link.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="grid grid-cols-5 items-end">
      {BOTTOM.map((link) => {
        const current = !link.book && isCurrent(pathname, link.href);
        const inner = (
          <>
            {link.book ? (
              <span className="-mt-6 grid size-14 place-items-center rounded-full bg-brand text-brand-ink ring-4 ring-surface">
                <Icon name={link.icon} size={24} />
              </span>
            ) : (
              <span
                className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${
                  current ? "bg-brand-soft text-brand-strong" : "text-ink"
                }`}
              >
                <Icon name={link.icon} size={22} />
              </span>
            )}
            <span className={`text-xs ${current || link.book ? "font-bold text-brand-strong" : "text-ink-muted"}`}>
              {t(link.key)}
            </span>
          </>
        );
        const className = "flex min-h-14 flex-col items-center justify-end gap-1 py-2 no-underline";
        return (
          <li key={link.href}>
            {link.book ? (
              // A plain link: /go/book is a counting redirect, not a page.
              <a href={link.href} rel="nofollow" className={className}>
                {inner}
              </a>
            ) : (
              <Link href={lp(link.href)} aria-current={current ? "page" : undefined} className={className}>
                {inner}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
