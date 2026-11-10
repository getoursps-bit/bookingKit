import { Icon, type IconName } from "@/views/parts/ui/Icon";
import { extensionViews } from "@/extension/views";
import { getI18n } from "@/i18n/server";
import type { Translate } from "@/i18n/t";
import { phoneLink, socialLink, wazeLink, whatsappLink } from "@/core/platform/links";
import type { BusinessProfile } from "@/core/website/content";

type Button = { key: string; label: string; href: string; icon: IconName; external: boolean };

/** The contact shortcuts. A button shows only when the owner has filled in its detail. */
export function contactButtons(t: Translate, profile: BusinessProfile, chatNumber: string | null): Button[] {
  const candidates: (Omit<Button, "href"> & { href: string | null })[] = [
    { key: "call", label: t("contact.call"), icon: "phone", href: phoneLink(profile.phoneE164), external: false },
    { key: "whatsapp", label: t("contact.whatsapp"), icon: "chat", href: whatsappLink(chatNumber), external: true },
    { key: "waze", label: "Waze", icon: "navigate", href: wazeLink(profile.address), external: true },
    // What the extensions add: other maps apps, say.
    ...extensionViews().flatMap((views) =>
      (views.contactLinks?.(profile) ?? []).map((link) => ({ ...link, icon: link.icon as IconName, external: true })),
    ),
    {
      key: "instagram",
      label: t("contact.instagram"),
      icon: "instagram",
      href: socialLink(profile.social.instagram),
      external: true,
    },
    {
      key: "facebook",
      label: t("contact.facebook"),
      icon: "facebook",
      href: socialLink(profile.social.facebook),
      external: true,
    },
    { key: "tiktok", label: t("contact.tiktok"), icon: "tiktok", href: socialLink(profile.social.tiktok), external: true },
  ];
  return candidates.filter((button): button is Button => button.href !== null);
}

/**
 * Phone: round icons with a small label underneath, six in a row. Wider
 * screens: a row of equal tiles with the icon beside the label.
 */
export async function ContactButtons({ profile, chatNumber }: { profile: BusinessProfile; chatNumber: string | null }) {
  const { t } = await getI18n();
  const buttons = contactButtons(t, profile, chatNumber);
  if (buttons.length === 0) return null;
  return (
    <section aria-labelledby="contact-buttons">
      <h2 id="contact-buttons" className="visually-hidden">
        {t("contact.buttonsTitle")}
      </h2>
      <ul className="grid grid-cols-6 gap-1.5 md:grid-cols-6 md:gap-3">
        {buttons.map((button) => (
          <li key={button.key}>
            <a
              href={button.href}
              {...(button.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="group flex flex-col items-center gap-1.5 text-center text-[11px] text-ink no-underline md:min-h-14 md:flex-row md:justify-center md:gap-2.5 md:rounded-2xl md:border md:border-line-strong md:px-5 md:py-2.5 md:text-[15px] md:font-medium md:hover:border-brand"
            >
              <span className="grid size-12 place-items-center rounded-full bg-paper transition-colors group-hover:bg-brand-soft md:size-auto md:bg-transparent md:group-hover:bg-transparent">
                <Icon name={button.icon} size={20} />
              </span>
              <span className="max-w-full truncate">{button.label}</span>
              {button.external ? <span className="visually-hidden"> {t("site.newWindow")}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
