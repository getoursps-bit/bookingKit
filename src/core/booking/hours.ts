// A weekday's opening hours. No database access here, so pages and the slot
// arithmetic can use it freely.

/** One stretch of open time on a day, local wall-clock "HH:MM". */
export type HourRange = { opens: string; closes: string };

/**
 * Local wall-clock hours for one weekday (0 = Sunday). `more` holds further
 * ranges after the first, in order, when an extension keeps them (a morning
 * and a late afternoon, say); the core itself stores one range a day.
 */
export type OpeningHours = { weekday: number; opens: string | null; closes: string | null; closed: boolean; more?: HourRange[] };

/** The day's ranges in order; empty when closed. */
export function hourRanges(day: OpeningHours | undefined): HourRange[] {
  if (!day || day.closed || !day.opens || !day.closes) return [];
  return [{ opens: day.opens, closes: day.closes }, ...(day.more ?? [])];
}
