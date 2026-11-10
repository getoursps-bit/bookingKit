import { type Db, query } from "./db";
import { formatHe, localDateOf } from "./time";

/**
 * Claims today's run of a daily job once its local hour has come. The claim is
 * a row in `job_runs`, so restarts and a second worker never repeat it.
 */
export async function claimDaily(name: string, localHour: number, now: Date, db: Db): Promise<boolean> {
  if (Number(formatHe(now, "H")) < localHour) return false;
  const rows = await query(
    "insert into job_runs (name, run_date) values ($1, $2) on conflict do nothing returning name",
    [name, localDateOf(now)],
    db,
  );
  return rows.length > 0;
}

/** The same, once per calendar month (UTC), for warnings such as the message cap. */
export async function claimMonthly(name: string, now: Date, db: Db): Promise<boolean> {
  const rows = await query(
    "insert into job_runs (name, run_date) values ($1, date_trunc('month', $2::timestamptz)::date) on conflict do nothing returning name",
    [name, now],
    db,
  );
  return rows.length > 0;
}
