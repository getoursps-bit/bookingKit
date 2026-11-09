import { petTags, ServiceCard } from "@/components/site/cards";
import { PageHeader } from "@/components/site/PageHeader";
import { BookButton } from "@/components/site/landing";
import { getI18n } from "@/i18n/server";
import { listServiceRules, listServices } from "@/server/repos/catalog";
import { pageMetadata } from "@/server/seo";
import { getSiteData, isNoindex } from "@/server/site";

export async function generateMetadata() {
  const { t } = await getI18n();
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { title: t("services.title"), path: "/services" }, isNoindex(settings));
}

export default async function ServicesPage() {
  const { t } = await getI18n();
  const [services, rules] = await Promise.all([listServices({ activeOnly: true }), listServiceRules()]);
  const tags = petTags(rules);
  return (
    <>
      <PageHeader icon="scissors" title={t("services.title")} intro={t("services.finalPrice")} />
      <div className="grid gap-3.5 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} tag={tags.get(service.id)} />
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <BookButton size="lg" />
      </div>
    </>
  );
}
