import { AdminNotice, Panel } from "@/components/admin/parts";
import { Phone } from "@/components/site/values";
import { getI18n } from "@/i18n/server";
import { searchCustomers } from "@/core/booking/owner-data";
import { requireStaffPage } from "@/core/platform/staff/session";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.nav.customers") };
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ok?: string; error?: string }>;
}) {
  const { q = "", ...notice } = await searchParams;
  await requireStaffPage();
  const { t } = await getI18n();
  const hits = await searchCustomers(q.slice(0, 80));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">{t("admin.nav.customers")}</h1>
      <AdminNotice {...notice} />
      <Panel id="search" title={t("customers.search")}>
        <form method="get" role="search" className="flex gap-2">
          <label htmlFor="q" className="visually-hidden">
            {t("customers.search")}
          </label>
          <input id="q" name="q" type="search" defaultValue={q} maxLength={80} enterKeyHint="search" className="input flex-1" />
          <button type="submit" className="btn btn-primary">
            {t("customers.find")}
          </button>
        </form>
        {q ? (
          hits.length === 0 ? (
            <p className="mt-4 text-ink-muted">{t("customers.none")}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <a href={`/admin/customers/${hit.id}`} className="flex items-center gap-3 rounded-2xl bg-paper p-3 hover:bg-brand-soft">
                    <span className="flex-1 font-semibold">{hit.name}</span>
                    {hit.phone ? <Phone e164={hit.phone} /> : null}
                    <span className="text-sm text-ink-muted">
                      {t("customers.bookings")}: {hit.bookings}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Panel>
    </div>
  );
}
