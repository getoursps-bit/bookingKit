import { brand } from "@/brand";
import { Icon } from "@/views/parts/ui/Icon";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("offline.title"), robots: { index: false } };
}

// Shown by the service worker when a page cannot load without a connection.
// It reads nothing from the database, so the cached copy always works.
export default async function OfflinePage() {
  const { t, lp } = await getI18n();
  return (
    <main id="main" className="grid flex-1 place-items-center p-6">
      <div className="card flex max-w-sm flex-col items-center gap-4 p-8 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-brand-soft text-brand">
          <Icon name={brand.mark} size={32} />
        </span>
        <h1 className="text-2xl font-extrabold">{t("offline.title")}</h1>
        <p className="text-ink-muted">{t("offline.text")}</p>
        {/* A plain link reloads the page from the network once the connection is back. */}
        <a href={lp("/")} className="btn btn-primary">
          {t("offline.retry")}
        </a>
      </div>
    </main>
  );
}
