import { formatDuration, formatPrice } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { displayPhone } from "@/core/platform/links";
import { formatLocal } from "@/core/platform/time";

// Numbers, prices, times and phone numbers inside text of either direction,
// each isolated in <bdi> so it keeps its own order. Names follow the page language.

export async function Price({ agorot }: { agorot: number }) {
  return <bdi>{formatPrice(agorot, await getLocale())}</bdi>;
}

export async function Duration({ minutes }: { minutes: number }) {
  return <span>{formatDuration(minutes, await getLocale())}</span>;
}

export function Phone({ e164 }: { e164: string }) {
  return <bdi dir="ltr">{displayPhone(e164)}</bdi>;
}

/** A local Israel time, date or both, as a <time> element with the exact instant. */
export async function Time({ value, pattern = "dd/MM/yyyy HH:mm" }: { value: Date; pattern?: string }) {
  const locale = await getLocale();
  return (
    <time dateTime={value.toISOString()}>
      <bdi>{formatLocal(value, pattern, locale)}</bdi>
    </time>
  );
}

/** A local wall-clock time such as "09:00". */
export function ClockTime({ value }: { value: string }) {
  return <bdi dir="ltr">{value}</bdi>;
}
