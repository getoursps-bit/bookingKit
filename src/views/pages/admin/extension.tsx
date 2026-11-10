import { notFound } from "next/navigation";
import { extensionViews } from "@/extension/views";
import { getI18n } from "@/i18n/server";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

function find(slug: string) {
  for (const views of extensionViews()) {
    const pages = views.adminPages;
    if (pages && Object.hasOwn(pages, slug)) return pages[slug]!;
  }
  return null;
}

export async function generateMetadata({ params }: Props) {
  const page = find((await params).slug);
  // The extension's own string, which the core's list of keys does not have.
  const t = (await getI18n()).t as unknown as (key: string) => string;
  return page ? { title: t(page.label) } : {};
}

/** A screen an extension brings to the owner area, at /admin/x/<slug>. The frame around it has already checked the login. */
export default async function ExtensionPage({ params, searchParams }: Props) {
  const page = find((await params).slug);
  if (!page) notFound();
  return <>{await page.default({ search: await searchParams })}</>;
}
