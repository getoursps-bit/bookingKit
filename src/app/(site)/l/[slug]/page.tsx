import { notFound } from "next/navigation";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { LANDING_PAGES } from "@/landing";
import { pageMetadata } from "@/server/seo";
import { getSiteData, isNoindex } from "@/server/site";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = Object.hasOwn(LANDING_PAGES, slug) ? LANDING_PAGES[slug] : undefined;
  if (!page) return {};
  const locale = await getLocale();
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { ...(page.meta[locale] ?? page.meta[DEFAULT_LOCALE]), path: `/l/${slug}` }, isNoindex(settings));
}

export default async function LandingRoute({ params }: Props) {
  const { slug } = await params;
  const page = Object.hasOwn(LANDING_PAGES, slug) ? LANDING_PAGES[slug] : undefined;
  if (!page) notFound();
  const Page = page.default;
  return <Page />;
}
