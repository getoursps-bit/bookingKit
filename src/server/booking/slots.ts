// Free times, worked out with no database access. Everything is UTC instants;
// local opening hours are turned into UTC per date through time.ts.
import { addDays, format } from "date-fns";
import type { OpeningHours } from "../repos/catalog";
import { localDateOf, localDateTimeToUtc } from "../time";

export type Interval = { start: Date; end: Date };

export type SlotRules = {
  slotStepMin: number;
  gapMin: number;
  bufferMin: number;
  noticeMin: number;
  horizonDays: number;
};

export type DayStatus = "closed" | "full" | "available";

/** One local day's inputs: its hours, time off and live bookings that touch it. */
export type DayInput = { date: string; hours: OpeningHours | undefined; timeOff: Interval[]; busy: Interval[] };

const MINUTE = 60_000;

/**
 * Minutes a visit takes up: each pet's service, a gap before each pet after
 * the first, and the buffer after the visit. Pets are handled one after another.
 */
export function visitLength(pets: { durationMin: number }[], rules: Pick<SlotRules, "gapMin" | "bufferMin">): number {
  if (pets.length === 0) return 0;
  const work = pets.reduce((sum, pet) => sum + pet.durationMin, 0);
  return work + rules.gapMin * (pets.length - 1) + rules.bufferMin;
}

/** Weekday (0 = Sunday) of a YYYY-MM-DD calendar date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addLocalDays(date: string, days: number): string {
  return format(addDays(new Date(`${date}T12:00:00Z`), days), "yyyy-MM-dd");
}

/** The day's opening time and closing time as UTC instants, or null when closed. */
export function openingInterval(date: string, hours: OpeningHours | undefined): Interval | null {
  if (!hours || hours.closed || !hours.opens || !hours.closes) return null;
  return { start: localDateTimeToUtc(date, hours.opens), end: localDateTimeToUtc(date, hours.closes) };
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Whether a visit the owner places by hand fits the day: inside opening hours
 * (the buffer may run past closing, as in `freeSlots`) and clear of time off.
 * Other bookings are left to the database's no-overlap rule.
 */
export function fitsDay(day: DayInput, start: Date, lengthMin: number, bufferMin: number): "ok" | "OutsideHours" | "TimeOff" {
  const open = openingInterval(day.date, day.hours);
  const workEnd = new Date(start.getTime() + (lengthMin - bufferMin) * MINUTE);
  if (!open || start < open.start || workEnd > open.end) return "OutsideHours";
  const visit = { start, end: new Date(start.getTime() + lengthMin * MINUTE) };
  return day.timeOff.some((interval) => overlaps(visit, interval)) ? "TimeOff" : "ok";
}

/**
 * Start times on `date` where a visit of `lengthMin` fits. `lengthMin` includes
 * the buffer; the visit itself (length minus buffer) must end by closing time,
 * and the whole length, buffer included, must not overlap time off or another
 * booking. Stored bookings already include their own buffer.
 */
export function freeSlots(day: DayInput, lengthMin: number, rules: SlotRules, now: Date): Date[] {
  const open = openingInterval(day.date, day.hours);
  if (!open || lengthMin <= 0) return [];
  const earliest = new Date(now.getTime() + rules.noticeMin * MINUTE);
  const latest = new Date(now.getTime() + rules.horizonDays * 24 * 60 * MINUTE);
  const workMin = lengthMin - rules.bufferMin;
  const blocked = [...day.timeOff, ...day.busy];
  const slots: Date[] = [];
  for (
    let start = open.start.getTime();
    start + workMin * MINUTE <= open.end.getTime();
    start += rules.slotStepMin * MINUTE
  ) {
    const candidate = { start: new Date(start), end: new Date(start + lengthMin * MINUTE) };
    if (candidate.start < earliest || candidate.start > latest) continue;
    if (blocked.some((interval) => overlaps(candidate, interval))) continue;
    slots.push(candidate.start);
  }
  return slots;
}

/**
 * Closed: no hours that day, or time off covers all of them. Full: open, but
 * no visit of this length fits. Available: at least one start time.
 */
export function dayStatus(day: DayInput, lengthMin: number, rules: SlotRules, now: Date): DayStatus {
  const open = openingInterval(day.date, day.hours);
  if (!open) return "closed";
  if (coveredBy(open, day.timeOff)) return "closed";
  return freeSlots(day, lengthMin, rules, now).length > 0 ? "available" : "full";
}

function coveredBy(target: Interval, cover: Interval[]): boolean {
  let reached = target.start.getTime();
  for (const interval of [...cover].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    if (interval.start.getTime() > reached) break;
    reached = Math.max(reached, interval.end.getTime());
    if (reached >= target.end.getTime()) return true;
  }
  return reached >= target.end.getTime();
}

/** The first day (in the order given) with a free start time, and that time. */
export function firstAvailable(
  days: DayInput[],
  lengthMin: number,
  rules: SlotRules,
  now: Date,
): { date: string; start: Date } | null {
  const lastDate = localDateOf(new Date(now.getTime() + rules.horizonDays * 24 * 60 * MINUTE));
  for (const day of days) {
    if (day.date > lastDate) break;
    const [start] = freeSlots(day, lengthMin, rules, now);
    if (start) return { date: day.date, start };
  }
  return null;
}
