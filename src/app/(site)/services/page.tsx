import { ServiceCard } from "@/components/site/cards";
import { PageHeader } from "@/components/site/PageHeader";
import { BookButton } from "@/components/site/landing";
import { getI18n } from "@/i18n/server";
import { listServices } from "@/server/repos/catalog";
import { serviceTags } from "@/server/serviceTags";
import { pageMetadata } from "@/server/seo";
import { getSiteData, isNoindex } from "@/server/site";

export async function generateMetadata() {
  const { t } = await getI18n();
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { title: t("services.title"), path: "/services" }, isNoindex(settings));
}

export default async function ServicesPage() {
  const { t, locale } = await getI18n();
  const [services, tags] = await Promise.all([listServices({ activeOnly: true }), serviceTags(locale)]);
  return (
    <>
      <PageHeader icon="scissors" title={t("services.title")} intro={t("services.finalPrice")} />
      <div className="grid gap-3.5 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} tag={tags.label(service)} />
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <BookButton size="lg" />
      </div>
    </>
  );
}
