import Link from "next/link";
import type { ReactNode } from "react";
import { Panel } from "@/components/admin/parts";
import { formatPrice } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { getI18n } from "@/i18n/server";
import { isolate } from "@/i18n/t";
import { getStats, STATS_PERIODS, type StatsPeriod, WEEKS_SHOWN } from "@/server/admin/stats";
import { requireStaffPage } from "@/server/staff/session";
import { formatLocal, localDayBounds } from "@/server/time";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.nav.stats") };
}

function toPeriod(value: string | undefined): StatsPeriod {
  const n = Number(value);
  return (STATS_PERIODS as readonly number[]).includes(n) ? (n as StatsPeriod) : 30;
}

/** "27/10" for an Israel date. */
function shortDate(date: string, locale: Locale): string {
  return formatLocal(localDayBounds(date).start, "d/M", locale);
}

/** A headline number with a line of detail under it. */
function Tile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-3xl font-bold tabular-nums">{value}</dd>
      {detail ? <dd className="text-sm text-ink-muted">{detail}</dd> : null}
    </div>
  );
}

/** Two-column ranking table: a name and a count, biggest first. */
function RankTable({
  caption,
  nameHeader,
  countHeader,
  rows,
}: {
  caption: string;
  nameHeader: string;
  countHeader: string;
  rows: { name: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr className="text-ink-muted">
          <th scope="col" className="pb-2 text-start font-medium">
            {nameHeader}
          </th>
          <th scope="col" className="pb-2 text-end font-medium">
            {countHeader}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} className="border-t border-line">
            <th scope="row" className="py-2 pe-3 text-start font-normal">
              {row.name}
              {/* A thin bar under the name shows the share at a glance; the number is the value. */}
              <span aria-hidden="true" className="mt-1 block h-1 rounded-full bg-brand-soft">
                <span
                  className="block h-1 rounded-full bg-brand"
                  style={{ inlineSize: `${(row.count / max) * 100}%` }}
                />
              </span>
            </th>
            <td className="py-2 text-end align-top font-semibold tabular-nums">{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The owner's measures for a period: bookings and where they came from,
 * clicks, visits, messages and their cost, with bookings per week over the
 * last twelve weeks.
 */
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireStaffPage();
  const { t, locale } = await getI18n();
  const days = toPeriod((await searchParams).days);
  const stats = await getStats(days, { locale });
  const { bookings, visits, clicks, messages } = stats;
  const conversion = clicks.book > 0 ? Math.round((bookings.online / clicks.book) * 100) : null;
  const maxWeek = Math.max(1, ...stats.weekly.map((week) => week.count));
  const busiest = stats.weekly.reduce((best, week) => (week.count > best.count ? week : best), stats.weekly[0]!);
  const current = stats.weekly.at(-1)!;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("stats.title")}</h1>
          <p className="text-sm text-ink-muted">
            {t("stats.range", { from: shortDate(stats.from, locale), to: shortDate(stats.to, locale) })}
          </p>
        </div>
        <nav aria-label={t("stats.period")}>
          <ul className="flex gap-1 rounded-full bg-paper p-1">
            {STATS_PERIODS.map((n) => (
              <li key={n}>
                <Link
                  href={`/admin/stats?days=${n}`}
                  aria-current={n === days ? "page" : undefined}
                  className={`flex min-h-10 items-center rounded-full px-4 text-sm font-semibold no-underline ${
                    n === days ? "bg-brand text-brand-ink" : "text-ink hover:bg-brand-soft"
                  }`}
                >
                  {t("stats.days", { n })}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={t("stats.bookings")}
          value={bookings.total}
          detail={t("stats.bookingsSplit", {
            online: bookings.online,
            owner: bookings.owner,
            imported: bookings.imported,
          })}
        />
        <Tile label={t("stats.cancelled")} value={bookings.cancelled} detail={t("stats.cancelledNote")} />
        <Tile label={t("stats.visits")} value={visits.completed} detail={t("stats.noShows", { n: visits.noShow })} />
        <Tile
          label={t("stats.bookClicks")}
          value={clicks.book}
          detail={conversion === null ? t("stats.noClicks") : t("stats.conversion", { pct: `${conversion}%` })}
        />
        <Tile label={t("stats.orderClicks")} value={clicks.orderWhatsapp} detail={t("stats.orderNote")} />
        <Tile
          label={t("stats.messages")}
          value={messages.whatsapp + messages.email + messages.push}
          detail={t("stats.messagesSplit", { whatsapp: messages.whatsapp, email: messages.email, push: messages.push })}
        />
        <Tile
          label={t("stats.cost")}
          value={isolate(formatPrice(messages.costAgorot, locale))}
          detail={t("stats.aiCost", { cost: formatPrice(stats.aiThisMonthAgorot, locale) })}
        />
        <Tile
          label={t("inbox.failed")}
          value={messages.failed}
          detail={
            messages.failed > 0 ? (
              <Link href="/admin/inbox" className="underline">
                {t("admin.nav.inbox")}
              </Link>
            ) : undefined
          }
        />
      </dl>

      <Panel id="weekly" title={t("stats.weekly")}>
        <p className="mb-4 text-sm text-ink-muted">{t("stats.weeklyNote", { n: WEEKS_SHOWN })}</p>
        {/* Time runs left to right in both languages, as on a calendar. */}
        <div dir="ltr" className="flex flex-col gap-1">
          <div className="relative flex h-44 items-end gap-0.5 border-b border-line-strong" aria-hidden="true">
            <span className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
            <span className="absolute -top-2.5 start-0 bg-surface pe-1 text-xs text-ink-muted tabular-nums">
              {maxWeek}
            </span>
            {stats.weekly.map((week) => {
              const label = t("stats.weekBar", { date: shortDate(week.weekStart, locale), n: week.count });
              const labelled = week === busiest || week === current;
              return (
                <div key={week.weekStart} title={label} className="group flex h-full flex-1 flex-col justify-end">
                  {labelled && week.count > 0 ? (
                    <span className="mb-1 text-center text-xs font-semibold text-ink tabular-nums">{week.count}</span>
                  ) : null}
                  <span
                    className={`mx-auto block w-full max-w-10 rounded-t-[4px] transition-opacity group-hover:opacity-80 ${
                      week === current ? "bg-brand/60" : "bg-brand"
                    }`}
                    style={{ blockSize: week.count > 0 ? `${Math.max(2, (week.count / maxWeek) * 100)}%` : "0" }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-0.5" aria-hidden="true">
            {stats.weekly.map((week, i) => (
              <span key={week.weekStart} className="flex-1 text-center text-[11px] text-ink-muted tabular-nums">
                {i % 2 === 1 || i === stats.weekly.length - 1 ? shortDate(week.weekStart, locale) : ""}
              </span>
            ))}
          </div>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-brand-strong">{t("stats.showTable")}</summary>
          <table className="mt-2 w-full max-w-sm border-collapse">
            <caption className="visually-hidden">{t("stats.weekly")}</caption>
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className="pb-1 text-start font-medium">
                  {t("stats.week")}
                </th>
                <th scope="col" className="pb-1 text-end font-medium">
                  {t("stats.count")}
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.weekly.map((week) => (
                <tr key={week.weekStart} className="border-t border-line">
                  <th scope="row" className="py-1 text-start font-normal tabular-nums">
                    {isolate(shortDate(week.weekStart, locale))}
                  </th>
                  <td className="py-1 text-end tabular-nums">{week.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="sources" title={t("stats.sources")}>
          <p className="mb-3 text-sm text-ink-muted">{t("stats.sourcesNote")}</p>
          {stats.sources.length === 0 ? (
            <p className="text-ink-muted">{t("stats.empty")}</p>
          ) : (
            <RankTable
              caption={t("stats.sources")}
              nameHeader={t("stats.source")}
              countHeader={t("stats.count")}
              rows={stats.sources.map((row) => ({ name: row.source || t("stats.direct"), count: row.count }))}
            />
          )}
        </Panel>
        <Panel id="services" title={t("stats.services")}>
          <p className="mb-3 text-sm text-ink-muted">{t("stats.servicesNote")}</p>
          {stats.services.length === 0 ? (
            <p className="text-ink-muted">{t("stats.empty")}</p>
          ) : (
            <RankTable
              caption={t("stats.services")}
              nameHeader={t("stats.service")}
              countHeader={t("stats.count")}
              rows={stats.services}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
