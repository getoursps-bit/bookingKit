import { GalleryGrid } from "@/views/parts/site/GalleryGrid";
import { PageHeader } from "@/views/parts/site/PageHeader";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { listGallery } from "@/core/website/content";
import { pageMetadata } from "@/core/website/seo";
import { getSiteData, isNoindex } from "@/core/website/site";
import { getStorage } from "@/core/platform/storage";

export async function generateMetadata() {
  const { t } = await getI18n();
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { title: t("gallery.title"), path: "/gallery" }, isNoindex(settings));
}

export default async function GalleryPage() {
  const { t, locale } = await getI18n();
  const images = await listGallery();
  const storage = getStorage();
  return (
    <>
      <PageHeader icon="image" title={t("gallery.title")} />
      <GalleryGrid
        items={images.map((image) => ({
          id: image.id,
          url: storage.publicUrl(image.storageKey),
          alt: pick(locale, image, "alt"),
          caption: pick(locale, image, "caption"),
        }))}
      />
    </>
  );
}
