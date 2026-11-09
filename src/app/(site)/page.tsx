import Link from "next/link";
import { firstWith } from "@/extension/registry";
import { brand } from "@/brand";
import { CloudEdge } from "@/components/site/CloudEdge";
import { InstallButton } from "@/components/site/InstallButton";
import { contactButtons } from "@/components/site/ContactButtons";
import { HoursTable } from "@/components/site/HoursTable";
import { Duration, Price } from "@/components/site/values";
import { Icon } from "@/components/ui/Icon";
import { pick } from "@/i18n/content";
import { formatPrice } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { getI18n } from "@/i18n/server";
import { isolate, type Translate } from "@/i18n/t";
import { getWeek } from "@/server/booking/service";
import { addLocalDays, weekdayOf } from "@/server/booking/slots";
import { getConfig } from "@/server/config";
import { whatsappLink } from "@/server/links";
import { listGallery, listProducts, listServices, type OpeningHours } from "@/server/repos/catalog";
import { jsonLdString, localBusinessJsonLd, pageMetadata } from "@/server/seo";
import { getSiteData, isNoindex } from "@/server/site";
import { getStorage } from "@/server/storage";
import { formatLocal, localDateOf } from "@/server/time";

// The home page from the "v3" design (docs/reference/templates/temp2): the
// cover in an arch, a slogan, and a white card with the next free times and
// the booking button; then the services on a pink band, a photo mosaic, the
// product shelf, the visit card with the hours, and "already booked?". The
// bottom bar and install prompt come from the site layout.

export async function generateMetadata() {
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { path: "/" }, isNoindex(settings));
}

/** The closest free time and the four after it. */
const SLOTS_SHOWN = 5;

type FreeTimes = { date: string; slots: Date[] };

/** Today's free start times, or the first day that has any. Null when nothing is free or the lookup fails. */
async function freeTimes(today: string): Promise<FreeTimes | null> {
  try {
    // The free times are worked out for one service: the one an extension names, else the first that books online.
    const services = await listServices({ activeOnly: true });
    const named = firstWith("previewService");
    const preview = named ? await named(services) : (services.find((service) => service.bookableOnline) ?? null);
    if (!preview) return null;
    const serviceIds = [preview.id];
    const result = await getWeek({ date: today, serviceIds });
    if (!result.ok) return null;
    if (result.week.slots.length > 0) return { date: today, slots: result.week.slots.slice(0, SLOTS_SHOWN) };
    const first = result.week.firstAvailable;
    if (!first) return null;
    const next = await getWeek({ date: first.date, serviceIds });
    const slots = next.ok && next.week.slots.length > 0 ? next.week.slots : [first.start];
    return { date: first.date, slots: slots.slice(0, SLOTS_SHOWN) };
  } catch {
    // The free times are a nice-to-have; the page still renders without them.
    return null;
  }
}

/** "Open today until 19:00", "Opens today at 09:00" or "Closed today". */
function openStatus(t: Translate, hours: OpeningHours[], now: Date): { open: boolean; text: string } {
  const day = hours.find((row) => row.weekday === weekdayOf(localDateOf(now)));
  if (!day || day.closed || !day.opens || !day.closes) return { open: false, text: t("home.closedToday") };
  const time = formatLocal(now, "HH:mm", "he");
  if (time < day.opens) return { open: false, text: t("home.opensToday", { time: isolate(day.opens) }) };
  if (time < day.closes) return { open: true, text: t("home.openUntil", { time: isolate(day.closes) }) };
  return { open: false, text: t("home.closedToday") };
}

/** "Free today", "Free tomorrow" or "Free Wednesday 12/11". */
function freeTitle(t: Translate, locale: Locale, free: FreeTimes, today: string): string {
  const first = free.slots[0];
  if (!first || free.date === today) return t("home.freeToday");
  if (free.date === addLocalDays(today, 1)) return t("home.freeTomorrow");
  return t("home.freeOn", { day: isolate(formatLocal(first, "EEEE d/M", locale)) });
}

/** The closest free time as a line of text: "First available: today 15:30". */
function closestText(t: Translate, locale: Locale, free: FreeTimes, first: Date, today: string): string {
  const time = formatLocal(first, "HH:mm", locale);
  const when =
    free.date === today
      ? t("home.todayAt", { time })
      : free.date === addLocalDays(today, 1)
        ? t("home.tomorrowAt", { time })
        : formatLocal(first, "EEE d/M HH:mm", locale);
  return t("home.firstFree", { when });
}

/** The pastel tints for pictures and product cards, with the ink that reads on each; they cycle down a list. */
const PINK = { bg: "bg-tint-pink", ink: "text-tint-pink-ink" };
const TINTS = [
  PINK,
  { bg: "bg-tint-yellow", ink: "text-tint-yellow-ink" },
  { bg: "bg-tint-mint", ink: "text-tint-mint-ink" },
  { bg: "bg-tint-lilac", ink: "text-tint-lilac-ink" },
];
const SHAPES = ["blob", "blob-2", "rounded-full", "blob-3", "rounded-card", "rounded-full"];
const tintAt = (index: number) => TINTS[index % TINTS.length] ?? PINK;
const shapeAt = (index: number) => SHAPES[index % SHAPES.length] ?? "blob";

/** The photo mosaic: an arch, two rounded squares, a tall rounded block and a circle; five photos at most. */
const MOSAIC = [
  "row-span-2 rounded-[110px_110px_28px_28px] md:rounded-[220px_220px_32px_32px]",
  "rounded-card",
  "rounded-card md:rounded-full",
  "rounded-card md:row-span-2 md:rounded-[32px_32px_220px_220px]",
  "rounded-full md:col-span-2 md:rounded-[32px]",
];

function MoreLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`flex w-fit shrink-0 items-center gap-1 text-[15px] font-extrabold md:text-base ${className}`}
    >
      {label}
      <Icon name="arrow" size={16} className="ltr:rotate-180" />
    </Link>
  );
}

export default async function HomePage() {
  const { t, locale, lp } = await getI18n();
  const { profile, hours, settings } = await getSiteData();
  const now = new Date();
  const today = localDateOf(now);
  const [services, gallery, products, free] = await Promise.all([
    listServices({ activeOnly: true }),
    listGallery(),
    listProducts({ activeOnly: true }),
    freeTimes(today),
  ]);
  const storage = getStorage();
  const jsonLd = localBusinessJsonLd(profile, hours, getConfig().APP_BASE_URL);
  const coverUrl = profile.coverKey ? storage.publicUrl(profile.coverKey) || null : null;
  const status = openStatus(t, hours, now);
  const tagline = pick(locale, profile, "tagline") ?? t("home.heroText");
  const eyebrow = profile.city ? `${t("home.eyebrow")} · ${profile.city}` : t("home.eyebrow");
  const chat = whatsappLink(settings["whatsapp.chatNumber"]);
  const visitButtons = contactButtons(t, profile, settings["whatsapp.chatNumber"]).filter((button) =>
    ["waze", "call", "whatsapp"].includes(button.key),
  );
  const photos = gallery.slice(0, MOSAIC.length);
  const [closest, ...laterSlots] = free?.slots ?? [];
  const bookAt = (start: Date) => `/go/book?at=${encodeURIComponent(start.toISOString())}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

      {/*
        Hero. Phones: the cover in an arch with the "dogs & cats" sticker, then the eyebrow, slogan and
        tagline centred, then the card with the free times and the booking button. Wide screens: the words
        and the card beside the arch. Without a cover photo the arch is pink with a paw.
      */}
      <section
        aria-labelledby="hero-title"
        className="-mt-4 flex flex-col gap-4 pb-7 md:mt-0 md:grid md:grid-cols-2 md:items-center md:gap-14 md:pt-6 md:pb-16"
      >
        <div className="relative md:order-2 md:flex md:justify-center">
          <div className="relative h-[380px] overflow-hidden rounded-[180px_180px_40px_40px] bg-placeholder md:h-[600px] md:w-full md:max-w-[520px] md:rounded-[260px_260px_48px_48px]">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" fetchPriority="high" className="size-full object-cover" />
            ) : (
              <div aria-hidden="true" className="grid size-full place-items-center text-brand/30">
                <Icon name={brand.mark} size={140} strokeWidth={1.4} />
              </div>
            )}
          </div>
          <span
            aria-hidden="true"
            className="absolute top-8 -end-1 rotate-8 rounded-full bg-surface px-4 py-2.5 font-display text-[15px] font-semibold text-brand shadow-[var(--shadow-float)] md:top-[70px] md:end-0 md:px-5 md:py-3 md:text-lg"
          >
            {t("home.sticker")}
          </span>
          <span
            aria-hidden="true"
            className="absolute top-[120px] -start-1.5 grid size-16 -rotate-10 place-items-center rounded-full bg-tint-yellow text-tint-yellow-ink md:top-auto md:bottom-[120px] md:start-0 md:size-[140px] md:rotate-0 md:border-6 md:border-canvas"
          >
            <Icon name={brand.mark} size={30} strokeWidth={2} className="md:size-14" />
          </span>
        </div>

        <div className="flex flex-col gap-4 md:order-1 md:gap-6">
          <div className="flex flex-col items-center gap-2 text-center md:items-start md:gap-5 md:text-start">
            <p className="text-sm font-bold text-ink-muted md:rounded-full md:bg-paper md:px-4 md:py-2 md:text-[15px] md:font-extrabold md:text-brand">
              {eyebrow}
            </p>
            <h1 id="hero-title" className="text-[44px] leading-[1.02] font-bold md:text-[76px] md:leading-[0.98]">
              {t("home.heroTitle")}
              <br />
              <span className="text-brand">{t("home.heroTitleAccent")}</span>
            </h1>
            <p className="max-w-[29rem] text-base leading-normal text-ink-muted md:text-[19px] md:leading-relaxed">
              {tagline}
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-[var(--shadow-float)] md:max-w-[520px] md:gap-3.5 md:rounded-[32px] md:p-5">
            <div className={`flex items-center gap-3 ${free ? "justify-between" : "justify-end"}`}>
              {free ? (
                <h2 id="free-title" className="text-lg md:text-xl">
                  {freeTitle(t, locale, free, today)}
                </h2>
              ) : null}
              <p
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold ${
                  status.open ? "bg-success-soft text-success-ink" : "bg-paper text-ink-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${status.open ? "bg-success" : "bg-line-strong"}`}
                />
                {status.text}
              </p>
            </div>
            {free && closest ? (
              <a
                href={bookAt(closest)}
                rel="nofollow"
                className="btn btn-soft min-h-14 w-full text-[17px] font-extrabold"
              >
                <Icon name="clock" />
                {closestText(t, locale, free, closest, today)}
              </a>
            ) : null}
            {laterSlots.length > 0 ? (
              <ul aria-labelledby="free-title" className="grid grid-cols-4 gap-2">
                {laterSlots.map((start) => (
                  <li key={start.toISOString()}>
                    <a
                      href={bookAt(start)}
                      rel="nofollow"
                      className="btn btn-soft h-12 w-full px-0 text-[15px] font-extrabold md:h-13 md:text-base"
                    >
                      <bdi dir="ltr">{formatLocal(start, "HH:mm", locale)}</bdi>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/go/book"
                rel="nofollow"
                className="btn btn-primary min-h-14 w-full text-[17px] font-extrabold md:flex-1"
              >
                {t("nav.book")}
              </a>
              {chat ? (
                <a
                  href={chat}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-1 text-center text-[15px] font-bold md:inline-flex md:min-h-14 md:items-center md:justify-center md:gap-2 md:rounded-full md:border-2 md:border-placeholder md:bg-surface md:px-5 md:text-base md:text-ink md:no-underline md:hover:border-brand md:hover:text-ink"
                >
                  <span className="md:hidden">{t("home.orWhatsApp")}</span>
                  <span className="hidden md:inline">{t("contact.whatsapp")}</span>
                  <span className="visually-hidden"> {t("site.newWindow")}</span>
                </a>
              ) : null}
            </div>
            <InstallButton className="btn btn-outline min-h-12 w-full" />
          </div>
        </div>
      </section>

      <CloudEdge />
      <section id="services" aria-labelledby="services-title" className="full-bleed scroll-mt-20 bg-paper">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 pt-3 pb-9 md:gap-7 md:px-6 md:pt-8 md:pb-20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1 md:gap-1.5">
              <h2 id="services-title" className="text-[30px] font-bold md:text-5xl">
                {t("home.servicesTitle")}
              </h2>
              <p className="text-sm text-ink-muted md:text-[17px]">{t("home.servicesIntro")}</p>
            </div>
            <MoreLink href={lp("/services")} label={t("home.allServices")} className="hidden md:flex" />
          </div>
          <ul className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {services.slice(0, 6).map((service, index) => {
              const name = pick(locale, service, "name");
              const includes = pick(locale, service, "includes");
              const tint = tintAt(index);
              return (
                <li key={service.id}>
                  <article className="flex h-full items-center gap-3.5 rounded-card bg-surface p-3 md:gap-4 md:rounded-[32px] md:p-4">
                    <span
                      aria-hidden="true"
                      className={`grid size-19 shrink-0 place-items-center ${tint.bg} ${tint.ink} ${shapeAt(index)} md:size-26`}
                    >
                      <Icon name={index % 2 === 0 ? "scissors" : "paw"} size={30} strokeWidth={2} />
                    </span>
                    <span className="flex min-w-0 grow flex-col gap-1 md:gap-1.5">
                      <h3 className="text-lg leading-tight md:text-[21px]">{name}</h3>
                      <span className="text-[13px] text-ink-muted md:text-sm">
                        <Duration minutes={service.durationMin} />
                        {includes ? <> · {includes}</> : null}
                      </span>
                      {service.bookableOnline ? (
                        <span className="w-fit rounded-full bg-paper px-2.5 py-0.5 text-[13px] font-extrabold text-brand md:px-3 md:text-sm">
                          {t("services.from", { price: formatPrice(service.priceFromAgorot, locale) })}
                        </span>
                      ) : (
                        <span className="text-[13px] text-ink-muted">{t("services.callToBook")}</span>
                      )}
                    </span>
                    {service.bookableOnline ? (
                      <a
                        href={`/go/book?service=${service.id}`}
                        rel="nofollow"
                        className="btn btn-primary size-11 shrink-0 p-0 md:size-13"
                      >
                        <Icon name="plus" size={24} strokeWidth={2.5} />
                        <span className="visually-hidden">
                          {t("home.choose")}: {name}
                        </span>
                      </a>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
          <MoreLink href={lp("/services")} label={t("home.allServices")} className="md:hidden" />
        </div>
      </section>

      {photos.length > 0 ? (
        <section aria-labelledby="gallery-title" className="mt-10 flex flex-col gap-4 md:mt-22 md:gap-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="gallery-title" className="text-[30px] font-bold md:text-5xl">
              {t("home.galleryTitle")}
            </h2>
            <MoreLink href={lp("/gallery")} label={t("home.seeAllPhotos", { n: isolate(String(gallery.length)) })} />
          </div>
          <ul className="grid grid-cols-2 grid-rows-[105px_105px_150px] gap-2.5 md:grid-cols-4 md:grid-rows-[220px_220px] md:gap-4">
            {photos.map((image, index) => {
              const alt = pick(locale, image, "alt");
              const url = storage.publicUrl(image.storageKey);
              return (
                <li key={image.id} className={`min-h-0 ${MOSAIC[index]}`}>
                  {/* Each photo links to the full-size file, so the mosaic works with Tab and without JavaScript. */}
                  <a
                    href={url}
                    aria-label={t("gallery.open", { alt })}
                    className="block size-full overflow-hidden rounded-[inherit] bg-placeholder"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={alt} loading="lazy" decoding="async" className="size-full object-cover" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {products.length > 0 ? (
        <section
          id="products"
          aria-labelledby="products-title"
          className="mt-10 flex scroll-mt-20 flex-col gap-3.5 md:mt-20 md:gap-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1 md:gap-1.5">
              <h2 id="products-title" className="text-[30px] font-bold md:text-5xl">
                {t("home.productsTitle")}
              </h2>
              <p className="text-sm text-ink-muted md:text-[17px]">{t("home.productsNote")}</p>
            </div>
            <MoreLink href={lp("/products")} label={t("nav.products")} className="hidden md:flex" />
          </div>
          {/* The strip scrolls on phones, so it takes focus and arrow keys move it (its cards hold nothing focusable). */}
          <div
            role="region"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a strip that scrolls must be reachable by keyboard (axe: scrollable-region-focusable)
            tabIndex={0}
            aria-labelledby="products-title"
            className="scroll-strip md:mx-0 md:overflow-visible md:px-0"
          >
            <ul className="flex gap-3 md:grid md:grid-cols-4 md:gap-4">
              {products.slice(0, 8).map((product, index) => {
                const name = pick(locale, product, "name");
                const imageUrl = product.imageKey ? storage.publicUrl(product.imageKey) || null : null;
                return (
                  <li key={product.id} className="w-40 shrink-0 md:w-auto">
                    <article
                      className={`flex h-full flex-col gap-2 rounded-card p-3 md:gap-2.5 md:rounded-[32px] md:p-4 ${tintAt(index).bg}`}
                    >
                      <span className="grid h-[130px] place-items-center overflow-hidden rounded-[22px] bg-surface/60 md:h-[190px] md:rounded-[26px]">
                        {imageUrl ? (
                          // Plain img: product photos come from object storage.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl} alt="" loading="lazy" className="size-full object-cover" />
                        ) : (
                          <Icon name={brand.mark} size={36} className="text-ink-muted" />
                        )}
                      </span>
                      <h3 className="text-base leading-tight md:text-lg">
                        <bdi>{name}</bdi>
                      </h3>
                      <p className="text-[15px] font-extrabold md:text-base">
                        <Price agorot={product.priceAgorot} />
                      </p>
                    </article>
                  </li>
                );
              })}
            </ul>
          </div>
          <MoreLink href={lp("/products")} label={t("nav.products")} className="md:hidden" />
        </section>
      ) : null}

      {/* Visit: the address, the week's hours and the Waze / call / WhatsApp pills; "already booked?" beside it on wide screens. */}
      <div className="mt-10 mb-6 flex flex-col gap-4 md:mt-20 md:mb-16 md:grid md:grid-cols-3 md:gap-5">
        <section
          id="hours"
          aria-labelledby="visit-title"
          className="flex scroll-mt-20 flex-col gap-4 rounded-[32px] bg-surface p-5 shadow-[var(--shadow-float)] md:col-span-2 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-5 md:rounded-[36px] md:p-7"
        >
          <div className="flex flex-col gap-3 md:col-start-1 md:gap-4">
            <h2 id="visit-title" className="text-[26px] font-bold md:text-4xl">
              {t("home.visitTitle")}
            </h2>
            {profile.address ? (
              <p className="text-[15px] font-bold md:text-base">
                <span className="visually-hidden">{t("contact.address")}: </span>
                {profile.address}
              </p>
            ) : null}
          </div>
          <div className="md:col-start-2 md:row-span-2 md:row-start-1">
            <HoursTable hours={hours} today={weekdayOf(today)} caption={t("home.hoursTitle")} />
            <MoreLink href={lp("/hours")} label={t("home.allHours")} className="mt-3 text-sm md:text-[15px]" />
          </div>
          {visitButtons.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2 md:col-start-1 md:flex md:flex-wrap md:self-start">
              {visitButtons.map((button) => (
                <li key={button.key}>
                  <a
                    href={button.href}
                    {...(button.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="btn btn-soft min-h-12 w-full px-2 text-sm md:w-auto md:px-5 md:text-[15px]"
                  >
                    <Icon name={button.icon} size={18} />
                    {button.label}
                    {button.external ? <span className="visually-hidden"> {t("site.newWindow")}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="manage-title" id="manage" className="scroll-mt-20">
          <Link
            href={lp("/contact")}
            className="flex h-full items-center justify-between gap-3 rounded-card bg-brand p-5 text-brand-ink no-underline hover:bg-brand-strong hover:text-brand-ink md:flex-col md:items-start md:gap-6 md:rounded-[36px] md:p-8"
          >
            <span className="flex flex-col gap-1 md:gap-2">
              <h2 id="manage-title" className="text-xl text-brand-ink md:text-[30px]">
                {t("home.manageTitle")}
              </h2>
              <span className="text-sm text-brand-soft md:text-base">{t("home.manageText")}</span>
            </span>
            <span className="grid size-11 shrink-0 place-items-center gap-2 rounded-full bg-surface text-brand md:mt-auto md:h-13 md:w-auto md:grid-flow-col md:px-6 md:font-extrabold">
              <span className="hidden md:inline">{t("home.manageCta")}</span>
              <span className="visually-hidden md:hidden">{t("home.manageCta")}</span>
              <Icon name="arrow" size={20} strokeWidth={2.2} className="ltr:rotate-180" />
            </span>
          </Link>
        </section>
      </div>
    </>
  );
}
