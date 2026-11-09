import { DEFAULT_LOCALE, type Locale, PACKS } from "./locales";
import { libraryTranslator } from "./translator";

// Display formats for prices and durations, in each language's own way. Values
// come back plain; wrap them with isolate() or <bdi> where they sit inside
// text of the other direction. Server and worker only (it reads the strings).

const prices = new Map<Locale, { whole: Intl.NumberFormat; cents: Intl.NumberFormat }>();

function priceFormats(locale: Locale) {
  let formats = prices.get(locale);
  if (!formats) {
    const tag = PACKS[locale].formats;
    formats = {
      whole: new Intl.NumberFormat(tag, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }),
      cents: new Intl.NumberFormat(tag, { style: "currency", currency: "ILS", minimumFractionDigits: 2 }),
    };
    prices.set(locale, formats);
  }
  return formats;
}

/** 22000 → "‏220 ₪" (Hebrew) or "₪220" (English); 6990 → "69.90 ₪" / "₪69.90". */
export function formatPrice(agorot: number, locale: Locale = DEFAULT_LOCALE): string {
  const { whole, cents } = priceFormats(locale);
  return agorot % 100 === 0 ? whole.format(agorot / 100) : cents.format(agorot / 100);
}

/**
 * Hebrew: 50 → "50 דקות", 60 → "שעה", 80 → "שעה ו-20 דקות", 150 → "שעתיים ו-30 דקות".
 * English: 50 → "50 min", 60 → "1 h", 80 → "1 h 20 min".
 * The wording, plurals included, is in each language's `duration` strings.
 */
export function formatDuration(minutes: number, locale: Locale = DEFAULT_LOCALE): string {
  const t = libraryTranslator(locale);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = hours ? t("duration.hours", { hours }) : "";
  const minutePart = rest || !hours ? t("duration.minutes", { minutes: rest }) : "";
  return hourPart && minutePart ? t("duration.both", { hours: hourPart, minutes: minutePart }) : hourPart || minutePart;
}
