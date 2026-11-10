import type { ReactNode } from "react";
import { brand } from "@/brand";
import { Icon } from "@/views/parts/ui/Icon";
import { getI18n } from "@/i18n/server";
import type { Service } from "@/core/booking/catalog";
import { ServiceCard } from "./cards";
import { GalleryGrid, type GalleryItem } from "./GalleryGrid";

// Sections composed into the home page and the campaign landing pages.

/** Narrows the service list the booking flow opens with: the address parameter of an extension's service filter and its value. */
export type BookFilter = Record<string, string>;

/** Link to the booking flow, counted as a "Book" click. */
export function bookHref(filter?: BookFilter): string {
  return filter ? `/go/book?${new URLSearchParams(filter)}` : "/go/book";
}

export async function BookButton({
  filter,
  children,
  size = "md",
  className = "",
}: {
  filter?: BookFilter;
  children?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  const { t } = await getI18n();
  return (
    <a
      href={bookHref(filter)}
      rel="nofollow"
      className={`btn btn-primary ${size === "lg" ? "min-h-14 rounded-2xl px-8 text-lg md:rounded-full" : ""} ${className}`}
    >
      {children ?? t("nav.book")}
    </a>
  );
}

/** A full-width band; `tint` gives the light lilac background used between white sections. */
export function Band({
  id,
  labelledBy,
  label,
  tint = false,
  className = "",
  children,
}: {
  id?: string;
  labelledBy?: string;
  label?: string;
  tint?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      aria-label={label}
      className={`full-bleed scroll-mt-20 ${tint ? "bg-paper" : ""} ${className}`}
    >
      <div className="mx-auto max-w-[1200px] px-4 md:px-6">{children}</div>
    </section>
  );
}

/** Heading row of a band: title, an optional line under it, and an optional link at the end. */
export function BandHeading({
  id,
  title,
  intro,
  action,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-8">
      <div>
        <h2 id={id} className="text-2xl font-semibold md:text-[32px] md:leading-tight">
          {title}
        </h2>
        {intro ? <p className="mt-1.5 text-[15px] text-ink-muted md:text-base">{intro}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Campaign-page hero: eyebrow, title, text and the booking button, with an optional photo. */
export async function Hero({
  eyebrow,
  title,
  text,
  filter,
  imageUrl,
  children,
}: {
  eyebrow?: string;
  title: string;
  text?: string | null;
  filter?: BookFilter;
  imageUrl?: string | null;
  children?: ReactNode;
}) {
  return (
    <section className="grid items-center gap-8 py-4 md:grid-cols-2 md:gap-12 md:py-8">
      <div className="flex flex-col gap-4 md:gap-5">
        {eyebrow ? (
          <p className="text-sm font-medium tracking-wide text-ink-muted">{eyebrow}</p>
        ) : null}
        <h1 className="text-[34px] leading-[1.1] font-semibold md:text-[56px]">{title}</h1>
        {text ? <p className="text-lg leading-normal text-ink-soft md:text-[22px]">{text}</p> : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <BookButton filter={filter} size="lg" />
        </div>
        {children}
      </div>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-64 w-full rounded-card bg-placeholder object-cover md:h-[420px]" />
      ) : (
        <div aria-hidden="true" className="hidden h-[420px] place-items-center rounded-card bg-paper text-line-strong md:grid">
          <Icon name={brand.mark} size={140} strokeWidth={1.2} />
        </div>
      )}
    </section>
  );
}

export function Section({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10 md:mt-16">
      <BandHeading id={id} title={title} action={action} />
      {children}
    </section>
  );
}

export function ServiceHighlight({
  title,
  services,
  label,
}: {
  title: string;
  services: Service[];
  /** The short label on each card, from an extension's service tags. */
  label?: (service: Service) => string | undefined;
}) {
  if (services.length === 0) return null;
  return (
    <Section id="highlight" title={title}>
      <div className="grid gap-3.5 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] md:gap-5">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} tag={label?.(service)} headingLevel={3} />
        ))}
      </div>
    </Section>
  );
}

export function GalleryStrip({ title, items, action }: { title: string; items: GalleryItem[]; action?: ReactNode }) {
  if (items.length === 0) return null;
  return (
    <Section id="gallery-strip" title={title} action={action}>
      <GalleryGrid items={items.slice(0, 8)} compact />
    </Section>
  );
}

/** The dark closing card: a heading, a line of text and one light button. */
export function DarkCard({
  id,
  title,
  text,
  action,
}: {
  id: string;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-2.5 rounded-[20px] bg-paper p-6 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-6 md:p-10"
    >
      <div className="flex flex-col gap-2.5 md:gap-2">
        <h2 id={id} className="text-xl font-semibold md:text-2xl">
          {title}
        </h2>
        <p className="text-[15px] leading-relaxed text-ink-muted md:text-base">{text}</p>
      </div>
      {action}
    </section>
  );
}

export async function BookCta({ title, text, filter }: { title: string; text: string; filter?: BookFilter }) {
  const { t } = await getI18n();
  return (
    <div className="mt-10 md:mt-16">
      <DarkCard
        id="book-cta"
        title={title}
        text={text}
        action={
          <a href={bookHref(filter)} rel="nofollow" className="btn btn-primary w-fit px-6 text-[15px] md:text-[17px]">
            {t("home.bookNow")}
          </a>
        }
      />
    </div>
  );
}

/** Questions and answers as native disclosure widgets: keyboard-ready, no JavaScript needed. */
export async function Faq({ items }: { items: { q: string; a: string }[] }) {
  const { t } = await getI18n();
  return (
    <Section id="faq" title={t("landing.faqTitle")}>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <details key={item.q} className="group rounded-[18px] border border-line [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold">
              {item.q}
              <Icon name="plus" className="shrink-0 text-brand transition-transform group-open:rotate-45" />
            </summary>
            <p className="px-5 pb-5 text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
