import { ProductCard } from "@/views/parts/site/cards";
import { PageHeader } from "@/views/parts/site/PageHeader";
import { getI18n } from "@/i18n/server";
import { listProducts } from "@/core/website/content";
import { pageMetadata } from "@/core/website/seo";
import { getSiteData, isNoindex } from "@/core/website/site";
import { getStorage } from "@/core/platform/storage";

export async function generateMetadata() {
  const { t } = await getI18n();
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { title: t("products.title"), path: "/products" }, isNoindex(settings));
}

export default async function ProductsPage() {
  const { t } = await getI18n();
  const { settings } = await getSiteData();
  const products = await listProducts({ activeOnly: true });
  const storage = getStorage();
  const canOrder = Boolean(settings["whatsapp.chatNumber"]);
  return (
    <>
      <PageHeader icon="bag" title={t("products.title")} intro={t("products.intro")} />
      {products.length === 0 ? <p className="text-ink-muted">{t("products.empty")}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            imageUrl={product.imageKey ? storage.publicUrl(product.imageKey) : null}
            orderHref={canOrder ? `/go/order/${product.id}` : null}
          />
        ))}
      </div>
    </>
  );
}
