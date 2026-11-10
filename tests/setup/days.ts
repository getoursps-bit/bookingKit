import { addLocalDays, weekdayOf } from "@/core/booking/slots";
import { localDateOf } from "@/core/platform/time";

/**
 * A local date at least `ahead` days from today on which the test week's hours
 * cover 09:00–16:00: skips Wednesday and Friday (closed) and Sunday (opens at
 * 12:00), so tests pass on whatever day they run.
 */
/**
 * The week the database tests run in, whatever hours the client's own seed
 * has: Wednesday and Friday closed, Sunday from 12:00, the rest 09:00-16:00.
 * tests/setup/db.ts puts it in each test schema after the seed.
 */
export const TEST_WEEK: { weekday: number; opens: string | null; closes: string | null }[] = [
  { weekday: 0, opens: "12:00", closes: "19:00" },
  { weekday: 1, opens: "09:00", closes: "16:00" },
  { weekday: 2, opens: "09:00", closes: "16:00" },
  { weekday: 3, opens: null, closes: null },
  { weekday: 4, opens: "09:00", closes: "16:00" },
  { weekday: 5, opens: null, closes: null },
  { weekday: 6, opens: "09:00", closes: "16:00" },
];

export function openDay(ahead = 3): string {
  let date = addLocalDays(localDateOf(new Date()), ahead);
  while ([0, 3, 5].includes(weekdayOf(date))) date = addLocalDays(date, 1);
  return date;
}
