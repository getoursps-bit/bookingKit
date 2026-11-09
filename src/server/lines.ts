import { extensions } from "@/extension/registry";
import type { LineDescription } from "@/extension/types";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { type Db, getPool } from "./db";

const NOTHING: LineDescription = { label: null, notes: [] };

/**
 * What the extensions know about the lines of some bookings: a name for each
 * line (a pet's name, say) and notes for the owner. The answer gives the
 * description of one line; a line nobody describes has no label and no notes.
 */
export async function describeLines(
  appointmentIds: number[],
  locale: Locale = DEFAULT_LOCALE,
  db: Db = getPool(),
): Promise<(appointmentId: number, position: number) => LineDescription> {
  const all = new Map<string, LineDescription>();
  if (appointmentIds.length > 0) {
    for (const extension of extensions()) {
      const described = await extension.describeLines?.(appointmentIds, locale, db);
      for (const [key, value] of described ?? []) {
        const earlier = all.get(key);
        all.set(key, earlier ? { label: earlier.label ?? value.label, notes: [...earlier.notes, ...value.notes] } : value);
      }
    }
  }
  return (appointmentId, position) => all.get(`${appointmentId}:${position}`) ?? NOTHING;
}
