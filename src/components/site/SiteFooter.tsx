import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { socialLink } from "@/server/links";
import type { BusinessProfile } from "@/server/repos/catalog";
import { CloudEdge } from "./CloudEdge";
import { LanguageSwitch } from "./LanguageSwitch";
import { Phone } from "./values";

const NETWORKS = ["instagram", "facebook", "tiktok"] as const satisfies readonly IconName[];
type Network = (typeof NETWORKS)[number];

/**
 * The plum footer under a scalloped edge: the salon name large, the social
 * networks as outlined pills with their icons, the info pages and the
 * language switch, then the address, phone and year.
 */
export async function SiteFooter({ profile }: { profile: BusinessProfile }) {
  const { t, lp, locale } = await getI18n();
  const name = pick(locale, profile, "name");
  const info = [
    { href: "/accessibility", label: t("nav.accessibility") },
    { href: "/privacy", label: t("nav.privacy") },
    { href: "/contact", label: t("nav.contact") },
  ];
  const social = NETWORKS.map((key) => ({
    key,
    href: socialLink(profile.social[key]),
    label: t(`contact.${key}`),
  })).filter((link): link is { key: Network; href: string; label: string } => link.href !== null);

  return (
    <div className="mt-auto">
      <CloudEdge color="night" />
      <footer className="bg-night text-surface pb-app">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pt-5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-6 md:px-6 md:pt-8">
          <span className="font-display text-[32px] font-bold md:text-[48px]">{name}</span>
          {social.length > 0 ? (
            <ul aria-label={t("footer.follow")} className="flex flex-wrap gap-2">
              {social.map((link) => (
                <li key={link.key}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-night-line px-4 py-2 text-sm font-bold text-surface no-underline hover:bg-surface/10 hover:text-surface md:text-[15px]"
                  >
                    <Icon name={link.key} size={18} />
                    {link.label}
                    <span className="visually-hidden"> {t("site.newWindow")}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <nav
            aria-label={t("nav.footer")}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm md:text-[15px]"
          >
            {info.map((link) => (
              <Link key={link.href} href={lp(link.href)} className="py-1 text-night-ink hover:text-surface">
                {link.label}
              </Link>
            ))}
            <LanguageSwitch className="py-1 font-bold text-night-ink hover:text-surface" />
          </nav>
        </div>
        <p className="mx-auto flex max-w-[1240px] flex-wrap gap-x-3 gap-y-1 px-4 pt-6 pb-8 text-sm text-night-ink md:px-6 md:pt-8">
          <span>
            © <bdi>{new Date().getFullYear()}</bdi> {name}
          </span>
          {profile.address ? <span>· {profile.address}</span> : null}
          {profile.phoneE164 ? (
            <a href={`tel:${profile.phoneE164}`} className="text-night-ink hover:text-surface">
              · <Phone e164={profile.phoneE164} />
            </a>
          ) : null}
        </p>
      </footer>
    </div>
  );
}
