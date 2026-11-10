import { type Db, query } from "./db";

/**
 * Counts one try against `key` in a fixed window and says whether it is still
 * within `max`. Kept in Postgres because the container keeps no state.
 */
export async function hit(key: string, windowMin: number, max: number, db?: Db): Promise<boolean> {
  const [row] = await query<{ count: number }>(
    `insert into rate_limits (key, window_start, count)
     values ($1, date_bin(make_interval(mins => $2::int), now(), timestamptz '2000-01-01'), 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [key, windowMin],
    db,
  );
  return (row?.count ?? 0) <= max;
}

/** Removes windows older than a day. Run by the worker's daily clean-up. */
export async function pruneRateLimits(db?: Db): Promise<number> {
  const rows = await query(
    "delete from rate_limits where window_start < now() - interval '1 day' returning key",
    [],
    db,
  );
  return rows.length;
}
