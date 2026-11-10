import type { Translations } from "@/i18n/content";
import { type Db, query, withTransaction } from "../platform/db";
import { saveTranslations, translationsColumn } from "../platform/translation";
import { firstWith } from "@/extension/registry";
import { writeAudit } from "../platform/audit";
import type { OpeningHours } from "./hours";

export type { HourRange, OpeningHours } from "./hours";

// Postgres returns bigint ids as strings; repositories hand out numbers.

export type Service = {
  id: number;
  /** In the site's default language; `translations` holds the others. */
  name: string;
  includes: string | null;
  translations: Translations;
  durationMin: number;
  priceFromAgorot: number;
  bookableOnline: boolean;
  active: boolean;
  sortOrder: number;
};

export type TimeOff = { id: number; start: Date; end: Date; reason: string | null };

type Writer = { staffId: number | null; db?: Db };

// The *_he columns hold the text in the site's default language, whatever that language is.
const SERVICE_COLUMNS = `services.id::int, name_he as name, includes_he as includes,
  ${translationsColumn("service", "services.id")}, duration_min as "durationMin",
  price_from_agorot as "priceFromAgorot", bookable_online as "bookableOnline", active, sort_order as "sortOrder"`;

export async function listServices(opts: { activeOnly?: boolean } = {}, db?: Db): Promise<Service[]> {
  return query<Service>(
    `select ${SERVICE_COLUMNS} from services ${opts.activeOnly ? "where active" : ""} order by sort_order, id`,
    [],
    db,
  );
}

export async function upsertService(service: Omit<Service, "id"> & { id?: number }, { staffId, db }: Writer) {
  return withTransaction(async (client) => {
    const before = service.id
      ? ((await query<Service>(`select ${SERVICE_COLUMNS} from services where id = $1`, [service.id], client))[0] ??
        null)
      : null;
    const params = [
      service.name,
      service.includes,
      service.durationMin,
      service.priceFromAgorot,
      service.bookableOnline,
      service.active,
      service.sortOrder,
    ];
    const [saved] = service.id
      ? await query<Service>(
          `update services set name_he = $1, includes_he = $2, duration_min = $3, price_from_agorot = $4,
             bookable_online = $5, active = $6, sort_order = $7
           where id = $8 returning ${SERVICE_COLUMNS}`,
          [...params, service.id],
          client,
        )
      : await query<Service>(
          `insert into services (name_he, includes_he, duration_min, price_from_agorot, bookable_online, active, sort_order)
           values ($1, $2, $3, $4, $5, $6, $7) returning ${SERVICE_COLUMNS}`,
          params,
          client,
        );
    if (!saved) throw new Error(`Service ${service.id} not found`);
    saved.translations = { ...saved.translations, ...(await saveTranslations("service", saved.id, service.translations, client)) };
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "services",
      entityId: saved.id,
      action: service.id ? "update" : "create",
      before,
      after: saved,
    });
    return saved;
  }, db);
}

/** The week's hours. An extension may keep further ranges for a day; they come back in `more`. */
export async function getOpeningHours(db?: Db): Promise<OpeningHours[]> {
  const rows = await query<OpeningHours>(
    `select weekday, to_char(opens, 'HH24:MI') as opens, to_char(closes, 'HH24:MI') as closes, closed
     from opening_hours order by weekday`,
    [],
    db,
  );
  const more = await firstWith("openingRanges")?.load(db);
  return more ? rows.map((row) => ({ ...row, more: row.closed ? [] : (more.get(row.weekday) ?? []) })) : rows;
}

export async function setOpeningHours(day: OpeningHours, { staffId, db }: Writer): Promise<void> {
  await withTransaction(async (client) => {
    const before = (await getOpeningHours(client)).find((row) => row.weekday === day.weekday) ?? null;
    await query(
      `insert into opening_hours (weekday, opens, closes, closed) values ($1, $2, $3, $4)
       on conflict (weekday) do update set opens = excluded.opens, closes = excluded.closes, closed = excluded.closed`,
      [day.weekday, day.closed ? null : day.opens, day.closed ? null : day.closes, day.closed],
      client,
    );
    await firstWith("openingRanges")?.save(day.weekday, day.closed ? [] : (day.more ?? []), client);
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "opening_hours",
      entityId: day.weekday,
      action: "set",
      before,
      after: day,
    });
  }, db);
}

/** Time off that overlaps [start, end). */
export async function listTimeOff(start: Date, end: Date, db?: Db): Promise<TimeOff[]> {
  return query<TimeOff>(
    `select id::int, starts_at as start, ends_at as "end", reason from time_off
     where starts_at < $2 and ends_at > $1 order by starts_at`,
    [start, end],
    db,
  );
}

export async function addTimeOff(entry: Omit<TimeOff, "id">, { staffId, db }: Writer): Promise<TimeOff> {
  return withTransaction(async (client) => {
    const [saved] = await query<TimeOff>(
      `insert into time_off (starts_at, ends_at, reason) values ($1, $2, $3)
       returning id::int, starts_at as start, ends_at as "end", reason`,
      [entry.start, entry.end, entry.reason],
      client,
    );
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "time_off",
      entityId: saved!.id,
      action: "create",
      after: saved,
    });
    return saved!;
  }, db);
}

export async function removeTimeOff(id: number, { staffId, db }: Writer): Promise<void> {
  await withTransaction(async (client) => {
    const removed = await query("delete from time_off where id = $1 returning id", [id], client);
    if (removed.length) {
      await writeAudit(client, { staffId, actor: "staff", entity: "time_off", entityId: id, action: "delete" });
    }
  }, db);
}
