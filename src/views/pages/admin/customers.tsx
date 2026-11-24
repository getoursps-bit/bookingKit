import Link from "next/link";
import { AdminNotice, Panel } from "@/views/parts/admin/parts";
import { Phone, Time } from "@/views/parts/site/values";
import { getI18n } from "@/i18n/server";
import { CUSTOMER_SORTS, type CustomerSort, listCustomers } from "@/core/booking/owner-data";
import { requireStaffPage } from "@/core/platform/staff/session";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.nav.customers") };
}

const SORT_LABEL = { recent: "customers.sortRecent", name: "customers.sortName", bookings: "customers.sortBookings" } as const;

const toSort = (value: string | undefined): CustomerSort => CUSTOMER_SORTS.find((sort) => sort === value) ?? "recent";

/** The address of the list with these choices; the defaults are left out. */
function listHref({ q, sort, page }: { q: string; sort: CustomerSort; page: number }): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort !== "recent") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/admin/customers?${search}` : "/admin/customers";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string; ok?: string; error?: string }>;
}) {
  const { q: rawQ = "", sort: rawSort, page: rawPage, ...notice } = await searchParams;
  await requireStaffPage();
  const { t } = await getI18n();
  const q = rawQ.slice(0, 80);
  const sort = toSort(rawSort);
  const list = await listCustomers({ q, sort, page: Number(rawPage) || 1 });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">{t("admin.nav.customers")}</h1>
      <AdminNotice {...notice} />
      <Panel id="customers" title={t("customers.total", { count: list.total })}>
        <form method="get" role="search" className="flex gap-2">
          <label htmlFor="q" className="visually-hidden">
            {t("customers.search")}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={80}
            enterKeyHint="search"
            placeholder={t("customers.search")}
            className="input flex-1"
          />
          {sort !== "recent" ? <input type="hidden" name="sort" value={sort} /> : null}
          <button type="submit" className="btn btn-primary">
            {t("customers.find")}
          </button>
        </form>
        {q ? (
          <p className="mt-2 text-sm">
            <Link href={listHref({ q: "", sort, page: 1 })} className="underline">
              {t("customers.clear")}
            </Link>
          </p>
        ) : null}

        <nav aria-label={t("customers.sort")} className="mt-4">
          <ul className="flex flex-wrap gap-1 rounded-full bg-paper p-1">
            {CUSTOMER_SORTS.map((option) => (
              <li key={option}>
                <Link
                  href={listHref({ q, sort: option, page: 1 })}
                  aria-current={option === sort ? "page" : undefined}
                  className={`flex min-h-10 items-center rounded-full px-4 text-sm font-semibold no-underline ${
                    option === sort ? "bg-brand text-brand-ink" : "text-ink hover:bg-brand-soft"
                  }`}
                >
                  {t(SORT_LABEL[option])}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {list.rows.length === 0 ? (
          <p className="mt-4 text-ink-muted">{q ? t("customers.none") : t("customers.empty")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {list.rows.map((customer) => (
              <li key={customer.id}>
                <Link href={`/admin/customers/${customer.id}`} className="flex flex-col gap-1 rounded-2xl bg-paper p-3 hover:bg-brand-soft">
                  <span className="flex flex-wrap items-center gap-x-3">
                    <span className="flex-1 font-semibold">{customer.name}</span>
                    {customer.phone ? <Phone e164={customer.phone} /> : null}
                  </span>
                  <span className="flex flex-wrap gap-x-4 text-sm text-ink-muted">
                    <span>
                      {t("customers.bookings")}: {customer.bookings}
                    </span>
                    {customer.lastVisit ? (
                      <span>
                        {t("customers.lastVisit")}: <Time value={customer.lastVisit} pattern="dd/MM/yyyy" />
                      </span>
                    ) : null}
                    {customer.nextBooking ? (
                      <span>
                        {t("customers.nextBooking")}: <Time value={customer.nextBooking} pattern="dd/MM/yyyy HH:mm" />
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {list.pages > 1 ? (
          <nav aria-label={t("customers.pages")} className="mt-4 flex items-center justify-between gap-2 text-sm">
            {list.page > 1 ? (
              <Link href={listHref({ q, sort, page: list.page - 1 })} rel="prev" className="btn btn-outline">
                {t("customers.previous")}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-ink-muted">{t("customers.pageOf", { page: list.page, pages: list.pages })}</span>
            {list.page < list.pages ? (
              <Link href={listHref({ q, sort, page: list.page + 1 })} rel="next" className="btn btn-outline">
                {t("customers.next")}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </Panel>
    </div>
  );
}
