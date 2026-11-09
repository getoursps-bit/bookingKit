import { type Db, query } from "./db";
import { localDateOf } from "./time";

export { ATTRIBUTION_COOKIE, readAttribution } from "./attribution";

/** Daily click counters for the success measures. */
export type CounterKey = "book" | "order_whatsapp";

/** Adds one to today's (Israel date) count for `key`. Never throws: a lost count must not break a click. */
export async function countClick(key: CounterKey, db?: Db, now: Date = new Date()): Promise<void> {
  try {
    await query(
      `insert into site_counters (day, key, count) values ($1, $2, 1)
       on conflict (day, key) do update set count = site_counters.count + 1`,
      [localDateOf(now), key],
      db,
    );
  } catch {
    // Counting is best effort.
  }
}
