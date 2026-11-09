import { getI18n } from "@/i18n/server";

export type GalleryItem = { id: number; url: string; alt: string; caption: string | null };

/**
 * Photos in a grid. Each photo is a link to the full-size file, so the grid is
 * reachable with Tab and works without JavaScript.
 */
export async function GalleryGrid({ items, compact = false }: { items: GalleryItem[]; compact?: boolean }) {
  const { t } = await getI18n();
  if (items.length === 0) return <p className="text-ink-muted">{t("gallery.empty")}</p>;
  return (
    <ul
      className={
        compact
          ? "grid grid-cols-3 gap-1.5 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] md:gap-4"
          : "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      }
    >
      {items.map((item) => (
        <li key={item.id}>
          <figure>
            <a href={item.url} aria-label={t("gallery.open", { alt: item.alt })} className="block">
              {/* Plain img: gallery files are resized on upload and served by object storage. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.alt}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full rounded-xl bg-placeholder object-cover md:rounded-[18px]"
              />
            </a>
            {item.caption && !compact ? (
              <figcaption className="mt-1 text-sm text-ink-muted">{item.caption}</figcaption>
            ) : null}
          </figure>
        </li>
      ))}
    </ul>
  );
}
