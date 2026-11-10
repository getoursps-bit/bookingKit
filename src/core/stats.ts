import { extensions } from "@/extension/registry";
import type { Locale } from "@/i18n/locales";
import { translatedSql } from "./platform/translation";
import { addLocalDays, weekdayOf } from "./booking/slots";
import { type Db, getPool, query } from "./platform/db";
import { localDateOf, localDayBounds } from "./platform/time";

// The owner's stats screen: the after-launch measures from the design (G10),
// read from what the app already records. Periods are whole Israel days.

export const STATS_PERIODS = [7, 30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];
export const WEEKS_SHOWN = 12;

/** Bookings that really happened or still stand; held and released slots are not bookings. */
const REAL = `status in ('confirmed', 'completed', 'no_show', 'cancelled')`;

export type Stats = {
  /** First and last Israel date of the period, inclusive. */
  from: string;
  to: string;
  bookings: { total: number; online: number; owner: number; imported: number; cancelled: number };
  visits: { completed: number; noShow: number };
  clicks: { book: number; orderWhatsapp: number };
  messages: { whatsapp: number; email: number; push: number; failed: number; costAgorot: number };
  /** What the extensions cost in the month of the last day: the key of a string with {cost}, and the cost. */
  extraCosts: { label: string; agorot: number }[];
  /** Bookings made per week (Sunday to Saturday), oldest first; the last week is the current one. */
  weekly: { weekStart: string; count: number }[];
  /** Online bookings by campaign source; "" is a visit without campaign tags. */
  sources: { source: string; count: number }[];
  /** Pets booked per service, for visits in the period. */
  services: { name: string; count: number }[];
};

/** The period's start and end instants: `days` whole Israel days ending today. */
export function periodBounds(days: number, now: Date): { from: string; to: string; start: Date; end: Date } {
  const to = localDateOf(now);
  const from = addLocalDays(to, -(days - 1));
  return { from, to, start: localDayBounds(from).start, end: localDayBounds(to).end };
}

/** The Sunday that starts the week holding `date`. */
export function weekStartOf(date: string): string {
  return addLocalDays(date, -weekdayOf(date));
}

/** Counts per week for the last `weeks` weeks, oldest first, empty weeks included. */
export function bucketByWeek(
  dates: string[],
  today: string,
  weeks = WEEKS_SHOWN,
): { weekStart: string; count: number }[] {
  const current = weekStartOf(today);
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    weekStart: addLocalDays(current, -7 * (weeks - 1 - i)),
    count: 0,
  }));
  const index = new Map(buckets.map((bucket, i) => [bucket.weekStart, i]));
  for (const date of dates) {
    const i = index.get(weekStartOf(date));
    if (i !== undefined) buckets[i]!.count += 1;
  }
  return buckets;
}

export async function getStats(
  days: StatsPeriod,
  opts: { locale: Locale; now?: Date },
  db: Db = getPool(),
): Promise<Stats> {
  const now = opts.now ?? new Date();
  const { from, to, start, end } = periodBounds(days, now);
  const weeksStart = localDayBounds(addLocalDays(weekStartOf(to), -7 * (WEEKS_SHOWN - 1))).start;

  const [bookings, visits, clicks, messages, extraCosts, created, sources, services] = await Promise.all([
    query<{ total: number; online: number; owner: number; imported: number; cancelled: number }>(
      `select count(*)::int as total,
              count(*) filter (where created_by = 'customer')::int as online,
              count(*) filter (where created_by = 'owner')::int as owner,
              count(*) filter (where created_by = 'import')::int as imported,
              count(*) filter (where status = 'cancelled')::int as cancelled
       from appointments where ${REAL} and created_at >= $1 and created_at < $2`,
      [start, end],
      db,
    ),
    query<{ completed: number; noShow: number }>(
      `select count(*) filter (where status = 'completed')::int as completed,
              count(*) filter (where status = 'no_show')::int as "noShow"
       from appointments where starts_at >= $1 and starts_at < $2`,
      [start, end],
      db,
    ),
    query<{ key: string; count: number }>(
      `select key, sum(count)::int as count from site_counters where day between $1 and $2 group by key`,
      [from, to],
      db,
    ),
    query<{ whatsapp: number; email: number; push: number; failed: number; costAgorot: number }>(
      `select count(*) filter (where channel = 'whatsapp' and status in ('sent', 'delivered', 'read'))::int as whatsapp,
              count(*) filter (where channel = 'email' and status in ('sent', 'delivered', 'read'))::int as email,
              count(*) filter (where channel = 'push' and status in ('sent', 'delivered', 'read'))::int as push,
              count(*) filter (where status = 'failed')::int as failed,
              coalesce(sum(cost_agorot), 0)::int as "costAgorot"
       from message_outbox where created_at >= $1 and created_at < $2`,
      [start, end],
      db,
    ),
    Promise.all(extensions().flatMap((extension) => (extension.monthlyCost ? [extension.monthlyCost(`${to.slice(0, 7)}-01`, db)] : []))),
    query<{ createdAt: Date }>(
      `select created_at as "createdAt" from appointments where ${REAL} and created_at >= $1 and created_at < $2`,
      [weeksStart, end],
      db,
    ),
    query<{ source: string; count: number }>(
      `select coalesce(nullif(lower(source ->> 'utm_source'), ''), '') as source, count(*)::int as count
       from appointments
       where ${REAL} and created_by = 'customer' and created_at >= $1 and created_at < $2
       group by 1 order by 2 desc, 1 limit 8`,
      [start, end],
      db,
    ),
    query<{ name: string; count: number }>(
      `select ${translatedSql("service", "name", "s.id", "s.name_he", opts.locale)} as name,
              count(*)::int as count
       from appointment_lines ap
       join appointments a on a.id = ap.appointment_id
       join services s on s.id = ap.service_id
       where a.status in ('confirmed', 'completed', 'no_show') and a.starts_at >= $1 and a.starts_at < $2
       group by s.id, 1 order by 2 desc, 1 limit 8`,
      [start, end],
      db,
    ),
  ]);

  const clickCount = (key: string) => clicks.find((row) => row.key === key)?.count ?? 0;
  return {
    from,
    to,
    bookings: bookings[0]!,
    visits: visits[0]!,
    clicks: { book: clickCount("book"), orderWhatsapp: clickCount("order_whatsapp") },
    messages: messages[0]!,
    extraCosts,
    weekly: bucketByWeek(
      created.map((row) => localDateOf(row.createdAt)),
      to,
    ),
    sources,
    services,
  };
}
