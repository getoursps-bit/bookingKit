import { ContactButtons } from "@/components/site/ContactButtons";
import { PageHeader } from "@/components/site/PageHeader";
import { Phone } from "@/components/site/values";
import { getI18n } from "@/i18n/server";
import { mapLink, whatsappLink } from "@/core/platform/links";
import { pageMetadata } from "@/core/website/seo";
import { getSiteData, isNoindex } from "@/core/website/site";

export async function generateMetadata() {
  const { t } = await getI18n();
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { title: t("contact.title"), path: "/contact" }, isNoindex(settings));
}

export default async function ContactPage() {
  const { t } = await getI18n();
  const { profile, settings } = await getSiteData();
  const chat = settings["whatsapp.chatNumber"];
  const sender = settings["whatsapp.senderNumber"];
  const map = mapLink([profile.address, profile.city].filter(Boolean).join(", ") || null);
  const nothing = !profile.address && !profile.phoneE164 && !chat;

  return (
    <>
      <PageHeader icon="phone" title={t("contact.title")} intro={nothing ? t("contact.missing") : undefined} />
      <div className="mb-8">
        <ContactButtons profile={profile} chatNumber={chat} />
      </div>
      <dl className="grid gap-4 md:grid-cols-2">
        {profile.address ? (
          <div className="card p-5">
            <dt className="mb-1 font-bold">{t("contact.address")}</dt>
            <dd>
              {profile.address}
              {profile.city ? `, ${profile.city}` : ""}
              {map ? (
                <>
                  {" · "}
                  <a href={map} target="_blank" rel="noopener noreferrer" className="underline">
                    {t("contact.map")}
                    <span className="sr-only"> {t("site.newWindow")}</span>
                  </a>
                </>
              ) : null}
            </dd>
          </div>
        ) : null}
        {profile.phoneE164 ? (
          <div className="card p-5">
            <dt className="mb-1 font-bold">{t("contact.phone")}</dt>
            <dd>
              <a href={`tel:${profile.phoneE164}`} className="underline">
                <Phone e164={profile.phoneE164} />
              </a>
            </dd>
          </div>
        ) : null}
        {chat ? (
          <div className="card p-5">
            <dt className="mb-1 font-bold">{t("contact.chatNumber")}</dt>
            <dd>
              <a href={whatsappLink(chat) ?? undefined} target="_blank" rel="noopener noreferrer" className="underline">
                <Phone e164={chat} />
                <span className="sr-only"> {t("site.newWindow")}</span>
              </a>
            </dd>
          </div>
        ) : null}
        {sender && sender !== chat ? (
          <div className="card p-5">
            <dt className="mb-1 font-bold">{t("contact.senderNumber")}</dt>
            <dd>
              <Phone e164={sender} />
              <p className="text-ink-muted">{t("contact.senderNote")}</p>
            </dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}
