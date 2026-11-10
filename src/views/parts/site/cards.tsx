import { brand } from "@/brand";
import { Icon } from "@/views/parts/ui/Icon";
import { pick } from "@/i18n/content";
import { formatPrice } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { Service } from "@/core/booking/catalog";
import type { Product } from "@/core/website/content";
import { Duration, Price } from "./values";

/** A service: name and who it is for, what it includes, "from" price, length and "Choose". */
export async function ServiceCard({
  service,
  tag,
  headingLevel = 2,
}: {
  service: Service;
  /** A short label an extension gives the service, already in the page's language. */
  tag?: string;
  headingLevel?: 2 | 3;
}) {
  const { t, locale } = await getI18n();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const name = pick(locale, service, "name");
  const includes = pick(locale, service, "includes");
  return (
    <article className="flex h-full flex-col gap-2 rounded-[18px] border border-line bg-surface p-4 md:gap-3.5 md:rounded-[20px] md:p-6">
      <div className="flex items-start justify-between gap-3">
        <Heading className="text-[17px] leading-snug font-semibold md:text-xl">{name}</Heading>
        {tag ? (
          <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-[13px] font-medium whitespace-nowrap text-ink-soft">
            {tag}
          </span>
        ) : null}
      </div>
      {includes ? (
        <p className="flex-1 text-sm leading-relaxed text-ink-muted md:text-[15px]">
          <span className="visually-hidden">{t("services.includes")}: </span>
          {includes}
        </p>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        <dl className="flex flex-col gap-0.5">
          <div>
            <dt className="visually-hidden">{t("services.price")}</dt>
            <dd className="text-[17px] font-semibold md:text-lg">
              {service.priceFromAgorot > 0 ? t("services.from", { price: formatPrice(service.priceFromAgorot, locale) }) : t("services.onRequest")}
            </dd>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-ink-muted md:text-sm">
            <dt className="visually-hidden">{t("services.duration")}</dt>
            <Icon name="clock" size={16} />
            <dd>
              <Duration minutes={service.durationMin} />
            </dd>
          </div>
        </dl>
        {service.bookableOnline ? (
          <a
            href={`/go/book?service=${service.id}`}
            rel="nofollow"
            className="btn btn-outline min-h-11 px-[18px] text-sm"
          >
            {t("home.choose")}
            <span className="visually-hidden">: {name}</span>
          </a>
        ) : (
          <p className="flex max-w-[12rem] items-center gap-2 text-sm text-ink-muted">
            <Icon name="phone" size={16} className="shrink-0" />
            {t("services.callToBook")}
          </p>
        )}
      </div>
    </article>
  );
}

/** One service as a quiet row: name and who it is for, then "from" price and length. The whole row books it. */
export async function ServiceRow({ service, tag }: { service: Service; tag?: string }) {
  const { t, locale } = await getI18n();
  const name = pick(locale, service, "name");
  const content = (
    <>
      <span className="flex flex-col gap-1">
        <span className="text-[17px] font-semibold md:text-lg">{name}</span>
        <span className="text-sm text-ink-muted">
          {tag ? <>{tag} · </> : null}
          <Duration minutes={service.durationMin} />
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3 text-end">
        {service.bookableOnline ? (
          <span className="font-semibold">{service.priceFromAgorot > 0 ? t("services.from", { price: formatPrice(service.priceFromAgorot, locale) }) : t("services.onRequest")}</span>
        ) : (
          <span className="text-sm text-ink-muted">{t("services.callToBook")}</span>
        )}
        {service.bookableOnline ? <Icon name="arrow" size={18} className="text-ink-muted ltr:rotate-180" /> : null}
      </span>
    </>
  );
  return service.bookableOnline ? (
    <a
      href={`/go/book?service=${service.id}`}
      rel="nofollow"
      className="flex min-h-16 items-center justify-between gap-4 py-4 text-ink no-underline transition-colors hover:text-brand-strong"
    >
      {content}
      <span className="visually-hidden">: {t("home.choose")}</span>
    </a>
  ) : (
    <div className="flex min-h-16 items-center justify-between gap-4 py-4">{content}</div>
  );
}

/** A product: photo, name, description and price; on the products page also the WhatsApp order link. */
export async function ProductCard({
  product,
  imageUrl,
  orderHref,
  compact = false,
  headingLevel = 2,
}: {
  product: Product;
  imageUrl: string | null;
  /** The counted redirect to WhatsApp, or null when no chat number is set. */
  orderHref?: string | null;
  compact?: boolean;
  headingLevel?: 2 | 3;
}) {
  const { t, locale } = await getI18n();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const name = pick(locale, product, "name");
  const description = pick(locale, product, "description");
  return (
    <article
      className={`flex h-full flex-col gap-1.5 md:gap-2 ${compact ? "" : "rounded-[20px] border border-line p-4"}`}
    >
      {imageUrl ? (
        // Plain img: product photos come from object storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className={`w-full rounded-[14px] bg-placeholder object-cover ${compact ? "aspect-square h-auto" : "h-40"}`}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`grid w-full place-items-center rounded-[14px] bg-paper text-line-strong ${
            compact ? "aspect-square" : "h-40"
          }`}
        >
          <Icon name={brand.mark} size={40} />
        </div>
      )}
      <Heading className="mt-1 text-[15px] leading-snug font-medium md:text-base">
        <bdi>{name}</bdi>
      </Heading>
      {description ? (
        <p className={`flex-1 text-sm leading-normal text-ink-muted ${compact ? "hidden md:block" : ""}`}>{description}</p>
      ) : null}
      <p className="text-[15px] text-ink-soft">
        <Price agorot={product.priceAgorot} />
      </p>
      {!compact ? (
        <div className="mt-auto pt-1">
          {orderHref ? (
            <a href={orderHref} rel="nofollow noopener noreferrer" target="_blank" className="btn btn-outline w-full">
              <Icon name="chat" />
              {t("products.order")}
              {/* Visible text first, so speech users can say what they see. */}
              <span className="visually-hidden">
                {": "}
                {name} {t("site.newWindow")}
              </span>
            </a>
          ) : (
            <p className="text-sm text-ink-muted">{t("products.orderByPhone")}</p>
          )}
        </div>
      ) : null}
    </article>
  );
}
