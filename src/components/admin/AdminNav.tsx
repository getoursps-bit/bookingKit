"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/t";
import { LanguageSwitch } from "./LanguageSwitch";

const LINKS: { href: string; key: MessageKey; icon: IconName }[] = [
  { href: "/admin", key: "admin.nav.today", icon: "home" },
  { href: "/admin/calendar", key: "admin.nav.calendar", icon: "calendar" },
  { href: "/admin/inbox", key: "admin.nav.inbox", icon: "bell" },
  { href: "/admin/customers", key: "admin.nav.customers", icon: "user" },
  { href: "/admin/stats", key: "admin.nav.stats", icon: "chart" },
  { href: "/admin/catalog", key: "admin.nav.catalog", icon: "scissors" },
  { href: "/admin/hours", key: "admin.nav.hours", icon: "clock" },
  { href: "/admin/settings", key: "admin.nav.settings", icon: "settings" },
];

/** The admin sections: a scrolling row on phones, a column on wide screens. */
export function AdminNav() {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  return (
    <nav aria-label={t("admin.nav")}>
      <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
        {LINKS.map((link) => {
          const current = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold transition-colors md:rounded-xl ${
                  current ? "bg-brand text-brand-ink" : "hover:bg-brand-soft"
                }`}
              >
                <Icon name={link.icon} size={18} />
                {t(link.key)}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0 self-center px-4 md:self-start md:pt-2">
          <LanguageSwitch locale={locale} back={pathname} />
        </li>
      </ul>
    </nav>
  );
}
