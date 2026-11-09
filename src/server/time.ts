import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import { DEFAULT_LOCALE, type Locale } from "../i18n/locales";
import { DATE_LOCALES } from "../i18n/packs.generated";

/** The salon's time zone. Storage is UTC; everything shown or reasoned about locally uses this. */
export const SALON_TZ = "Asia/Jerusalem";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseDate(date: string): [number, number, number] {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Expected a YYYY-MM-DD date, got "${date}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Turns a local Israel date and wall-clock time into a UTC instant, using the
 * offset in force on that date, so 09:00 stays 09:00 on both sides of a clock
 * change.
 */
export function localDateTimeToUtc(date: string, time: string): Date {
  const [year, month, day] = parseDate(date);
  const match = TIME_RE.exec(time);
  if (!match) throw new Error(`Expected an HH:mm time, got "${time}"`);
  const local = new TZDate(year, month - 1, day, Number(match[1]), Number(match[2]), SALON_TZ);
  return new Date(local.getTime());
}

/** A UTC instant seen as Israel local time. */
export function utcToLocal(instant: Date): TZDate {
  return new TZDate(instant.getTime(), SALON_TZ);
}

/** The local calendar date (YYYY-MM-DD) an instant falls on in Israel. */
export function localDateOf(instant: Date): string {
  return format(utcToLocal(instant), "yyyy-MM-dd");
}

/** Start (inclusive) and end (exclusive) of a local Israel day, as UTC instants. */
export function localDayBounds(date: string): { start: Date; end: Date } {
  const [year, month, day] = parseDate(date);
  const start = new TZDate(year, month - 1, day, 0, 0, SALON_TZ);
  const end = addDays(start, 1);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/** Formats an instant in Israel time with Hebrew names; dates read day first (dd/MM). */
export function formatHe(instant: Date, pattern = "dd/MM/yyyy HH:mm"): string {
  return formatLocal(instant, pattern, DEFAULT_LOCALE);
}

/** Formats an instant in Israel time with day and month names in the given language. */
export function formatLocal(instant: Date, pattern: string, locale: Locale): string {
  return format(utcToLocal(instant), pattern, { locale: DATE_LOCALES[locale], weekStartsOn: 0 });
}
