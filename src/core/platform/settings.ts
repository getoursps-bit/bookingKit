import { z } from "zod";
import { extensions } from "../../extension/registry";
import { type Db, query, withTransaction } from "./db";
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
  "messaging.whatsappOutage": z.boolean().default(false),
  "site.noindex": z.boolean().default(true),
  "whatsapp.senderNumber": phone.default(null),
  "whatsapp.chatNumber": phone.default(null),
  "cap.messagesMonthly": z.number().int().min(0).default(1000),
} as const;

type Schema = typeof SETTINGS_SCHEMA;
export type SettingKey = keyof Schema;
export type Settings = { [K in SettingKey]: z.output<Schema[K]> };

type AnySchema = Record<string, z.ZodType>;
type Values<S extends AnySchema> = { [K in keyof S]: z.output<S[K]> };

/** The core's settings and those of every extension that is on. */
function fullSchema(): AnySchema {
  return Object.assign({}, SETTINGS_SCHEMA, ...extensions().map((extension) => extension.settings ?? {})) as AnySchema;
}

function defaultsOf<S extends AnySchema>(schema: S): Values<S> {
  return Object.fromEntries(Object.entries(schema).map(([key, type]) => [key, type.parse(undefined)])) as Values<S>;
}

export const SETTINGS_DEFAULTS = defaultsOf(SETTINGS_SCHEMA) as Settings;

/** The default of every setting, the extensions' with the core's. */
export function allSettingDefaults(): Record<string, unknown> {
  return defaultsOf(fullSchema());
}

/** True for a setting of the core or of an extension that is on. */
export function isSettingKey(key: string): boolean {
  return Object.hasOwn(fullSchema(), key);
}

/** Checks a value for one setting without storing it. */
export function settingValid(key: string, value: unknown): boolean {
  return fullSchema()[key]?.safeParse(value).success ?? false;
}

/**
 * The stored values of the settings in `schema`. A missing or invalid row
 * falls back to the default. An extension reads its own settings with this.
 */
export async function readSettings<S extends AnySchema>(schema: S, db?: Db): Promise<Values<S>> {
  const rows = await query<{ key: string; value: unknown }>("select key, value from settings", [], db);
  const settings: Record<string, unknown> = defaultsOf(schema);
  for (const row of rows) {
    const parsed = schema[row.key]?.safeParse(row.value);
    if (parsed?.success) settings[row.key] = parsed.data;
  }
  return settings as Values<S>;
}

/** The core's settings. */
export function getSettings(db?: Db): Promise<Settings> {
  return readSettings(SETTINGS_SCHEMA, db) as Promise<Settings>;
}

/** Every setting, the extensions' with the core's, for the owner's settings screen. */
export function getAllSettings(db?: Db): Promise<Record<string, unknown>> {
  return readSettings(fullSchema(), db);
}

/** Validates and stores one setting, with an audit entry. Throws on an invalid value. */
export async function updateSetting<K extends SettingKey>(key: K, value: Settings[K], staffId: number | null, db?: Db): Promise<void>;
export async function updateSetting(key: string, value: unknown, staffId: number | null, db?: Db): Promise<void>;
export async function updateSetting(key: string, value: unknown, staffId: number | null, db?: Db): Promise<void> {
  const type = fullSchema()[key];
  if (!type) throw new Error(`Unknown setting "${key}"`);
  const parsed = type.parse(value);
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
