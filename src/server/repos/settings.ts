import { z } from "zod";
import { type Db, query, withTransaction } from "../db";
import { writeAudit } from "./audit";

const minutes = (max: number) => z.number().int().min(0).max(max);
const phone = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/)
  .nullable();

/**
 * Every setting, its type and its default. A missing or invalid row in the
 * database falls back to the default, so the app never stops for a bad value.
 * Defaults are the ones in the design until the owner answers Q4.
 */
const SETTINGS_SCHEMA = {
  "booking.slotStepMin": minutes(120).default(15),
  "booking.gapMin": minutes(120).default(0),
  "booking.bufferMin": minutes(120).default(10),
  "booking.noticeMin": minutes(7 * 24 * 60).default(120),
  "booking.horizonDays": z.number().int().min(1).max(365).default(30),
  "booking.maxLines": z.number().int().min(1).max(10).default(3),
  "booking.cutoffHours": z.number().int().min(0).max(168).default(12),
  "booking.holdMin": z.number().int().min(1).max(60).default(10),
  "ai.photo": z.boolean().default(false),
  "ai.summary": z.boolean().default(false),
  "messaging.whatsappOutage": z.boolean().default(false),
  "site.noindex": z.boolean().default(true),
  "whatsapp.senderNumber": phone.default(null),
  "whatsapp.chatNumber": phone.default(null),
  "cap.messagesMonthly": z.number().int().min(0).default(1000),
  // About 40 USD a month, in agorot.
  "cap.aiMonthlyAgorot": z.number().int().min(0).default(15000),
} as const;

type Schema = typeof SETTINGS_SCHEMA;
export type SettingKey = keyof Schema;
export type Settings = { [K in SettingKey]: z.output<Schema[K]> };

export const SETTINGS_DEFAULTS = Object.fromEntries(
  Object.entries(SETTINGS_SCHEMA).map(([key, schema]) => [key, schema.parse(undefined)]),
) as Settings;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS_SCHEMA, key);
}

/** Checks a value for one setting without storing it. */
export function settingValid(key: SettingKey, value: unknown): boolean {
  return SETTINGS_SCHEMA[key].safeParse(value).success;
}

export async function getSettings(db?: Db): Promise<Settings> {
  const rows = await query<{ key: string; value: unknown }>("select key, value from settings", [], db);
  const settings: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    if (!isSettingKey(row.key)) continue;
    const parsed = SETTINGS_SCHEMA[row.key].safeParse(row.value);
    if (parsed.success) settings[row.key] = parsed.data;
  }
  return settings as Settings;
}

/** Validates and stores one setting, with an audit entry. Throws on an invalid value. */
export async function updateSetting<K extends SettingKey>(
  key: K,
  value: Settings[K],
  staffId: number | null,
  db?: Db,
): Promise<void> {
  const parsed = SETTINGS_SCHEMA[key].parse(value);
  await withTransaction(async (client) => {
    const before = await query<{ value: unknown }>("select value from settings where key = $1", [key], client);
    await query(
      `insert into settings (key, value, updated_at) values ($1, $2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(parsed)],
      client,
    );
    await writeAudit(client, {
      staffId,
      actor: staffId == null ? "system" : "staff",
      entity: "settings",
      entityId: key,
      action: "update",
      before: before[0]?.value ?? null,
      after: parsed,
    });
  }, db);
}
