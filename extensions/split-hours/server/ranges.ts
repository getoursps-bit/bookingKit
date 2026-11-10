import type { HourRange } from "@/core/booking/hours";
import { type Db, query } from "@/core/platform/db";
import type { Form } from "@/extension/types";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The second range of each weekday that has one. */
export async function loadRanges(db?: Db): Promise<Map<number, HourRange[]>> {
  const rows = await query<{ weekday: number; opens: string; closes: string }>(
    `select weekday, to_char(opens2, 'HH24:MI') as opens, to_char(closes2, 'HH24:MI') as closes
     from opening_hours where not closed and opens2 is not null`,
    [],
    db,
  );
  return new Map(rows.map((row) => [row.weekday, [{ opens: row.opens, closes: row.closes }]]));
}

/**
 * What the hours form says for one weekday. The second range is asked for
 * with a tick; it must start at or after the first one closes.
 */
export function readRanges(form: Form, weekday: number, first: HourRange | null): HourRange[] | "invalid" {
  if (!first || form[`split.${weekday}`] !== "on") return [];
  const opens = form[`opens2.${weekday}`] ?? "";
  const closes = form[`closes2.${weekday}`] ?? "";
  if (!TIME.test(opens) || !TIME.test(closes) || opens < first.closes || opens >= closes) return "invalid";
  return [{ opens, closes }];
}

export async function saveRanges(weekday: number, ranges: HourRange[], db: Db): Promise<void> {
  const second = ranges[0] ?? null;
  await query(`update opening_hours set opens2 = $2, closes2 = $3 where weekday = $1`, [weekday, second?.opens ?? null, second?.closes ?? null], db);
}
