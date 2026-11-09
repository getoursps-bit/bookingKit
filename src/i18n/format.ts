import type { Locale } from "./locales";

// Display formats for prices and durations. Values come back plain; wrap them
// with isolate() or <bdi> where they sit inside text of the other direction.

const PRICE: Record<Locale, { whole: Intl.NumberFormat; cents: Intl.NumberFormat }> = {
  he: {
    whole: new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }),
    cents: new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2 }),
  },
  en: {
    whole: new Intl.NumberFormat("en-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }),
    cents: new Intl.NumberFormat("en-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2 }),
  },
};

/** 22000 → "‏220 ₪" (Hebrew) or "₪220" (English); 6990 → "69.90 ₪" / "₪69.90". */
export function formatPrice(agorot: number, locale: Locale = "he"): string {
  const { whole, cents } = PRICE[locale];
  return agorot % 100 === 0 ? whole.format(agorot / 100) : cents.format(agorot / 100);
}

/**
 * Hebrew: 50 → "50 דקות", 60 → "שעה", 80 → "שעה ו-20 דקות", 150 → "שעתיים ו-30 דקות".
 * English: 50 → "50 min", 60 → "1 h", 80 → "1 h 20 min".
 */
export function formatDuration(minutes: number, locale: Locale = "he"): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (locale === "en") {
    const parts = [hours ? `${hours} h` : "", rest ? `${rest} min` : ""].filter(Boolean);
    return parts.join(" ") || "0 min";
  }
  const hourPart = hours === 0 ? "" : hours === 1 ? "שעה" : hours === 2 ? "שעתיים" : `${hours} שעות`;
  const minutePart = rest === 0 ? "" : rest === 1 ? "דקה" : `${rest} דקות`;
  if (!hourPart) return minutePart || "0 דקות";
  return minutePart ? `${hourPart} ו-${minutePart}` : hourPart;
}
