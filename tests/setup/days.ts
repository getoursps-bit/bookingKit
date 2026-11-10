import { addLocalDays, weekdayOf } from "@/core/booking/slots";
import { localDateOf } from "@/core/platform/time";

/**
 * A local date at least `ahead` days from today on which the seeded hours
 * cover 09:00–16:00: skips Wednesday and Friday (closed) and Sunday (opens at
 * 12:00), so tests pass on whatever day they run.
 */
export function openDay(ahead = 3): string {
  let date = addLocalDays(localDateOf(new Date()), ahead);
  while ([0, 3, 5].includes(weekdayOf(date))) date = addLocalDays(date, 1);
  return date;
}
