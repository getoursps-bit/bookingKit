import { z } from "zod";
import { brandName } from "@/brand";
import * as appointments from "@/core/booking/appointments";
import { type AdminBooking, bookingsBetween } from "@/core/booking/owner-data";
import { approvePending, bookingMessages } from "@/core/booking/service";
import { writeAudit } from "@/core/platform/audit";
import { type Db, getPool, query, withTransaction } from "@/core/platform/db";
import { addOwnerEvent } from "@/core/platform/events";
import { Notify } from "@/core/platform/notify";
import { readSettings } from "@/core/platform/settings";
import { DEFAULT_LOCALE, type Locale, LOCALES } from "@/i18n/locales";
import { translator } from "@/i18n/translator";
import templates from "../templates.json";

/** On by default: a client who has this extension wants every online booking to be a request. */
export const APPROVAL_SETTINGS = { "booking.approval": z.boolean().default(true) };

/** The two messages this extension sends the customer. */
export const RECEIVED = "request_received";
export const REFUSED = "request_refused";

type Queryable = { query(text: string, values?: unknown[]): Promise<unknown> };

export async function approvalOn(db?: Db): Promise<boolean> {
  return (await readSettings(APPROVAL_SETTINGS, db))["booking.approval"];
}

/** A new request: the customer hears it was received, and the owner is alerted. Inside the settling transaction. */
export async function requested(appointment: appointments.Appointment, db: Db, now: Date): Promise<void> {
  await Notify.queue(bookingMessages(appointment, now, RECEIVED), db);
  await addOwnerEvent("request_new", appointment.id, {}, {}, db);
}

export type Outcome = { outcome: "refused" | "expired"; reason: string | null };

/** How a request ended when it was not approved, or null (it is waiting, was approved, or never was a request). */
export async function outcomeOf(appointmentId: number, db?: Db): Promise<Outcome | null> {
  const [row] = await query<Outcome>("select outcome, reason from booking_requests where appointment_id = $1", [appointmentId], db);
  return row ?? null;
}

export type Request = AdminBooking & { createdAt: Date; visits: number };

/** The requests awaiting an answer, soonest first, with when each was made and whether the customer has been before. */
export async function pendingRequests(opts: { locale?: Locale; limit?: number } = {}, db: Db = getPool()): Promise<Request[]> {
  const rows = await bookingsBetween(new Date(0), new Date("9999-01-01"), { statuses: ["pending"], locale: opts.locale }, db);
  const shown = rows.slice(0, opts.limit ?? 100);
  if (shown.length === 0) return [];
  const extra = await query<{ id: number; createdAt: Date; visits: number }>(
    `select a.id::int, a.created_at as "createdAt",
       (select count(*)::int from appointments p where p.customer_id = a.customer_id and p.status = 'completed') as visits
     from appointments a where a.id = any($1)`,
    [shown.map((row) => row.id)],
    db,
  );
  const byId = new Map(extra.map((row) => [row.id, row]));
  return shown.map((row) => ({ ...row, createdAt: byId.get(row.id)?.createdAt ?? row.start, visits: byId.get(row.id)?.visits ?? 0 }));
}

type Result = { ok: true } | { ok: false; reason: "NotFound" };

/** The owner approves: the core confirms it and sends the confirmation. */
export async function approve(id: number, staffId: number, db?: Db): Promise<Result> {
  const result = await approvePending(id, staffId, { db });
  return result.ok ? { ok: true } : { ok: false, reason: "NotFound" };
}

/**
 * The owner refuses, with an optional reason for the customer: the time is
 * free again, the private link can no longer move or cancel, and the
 * customer is told.
 */
export async function refuse(id: number, reason: string | null, staffId: number, db: Db = getPool(), now = new Date()): Promise<Result> {
  return withTransaction(async (client) => {
    const before = await appointments.getAppointment(id, client);
    if (!before || before.status !== "pending") return { ok: false, reason: "NotFound" } as const;
    const cancelled = await appointments.cancel(id, client);
    if (!cancelled) return { ok: false, reason: "NotFound" } as const;
    const text = reason?.trim().slice(0, 300) || null;
    await query("insert into booking_requests (appointment_id, outcome, reason) values ($1, 'refused', $2)", [id, text], client);
    await Notify.cancel(id, ["reminder", "confirmation", RECEIVED], "refused", client);
    await Notify.queue(bookingMessages(cancelled, now, REFUSED), client);
    await writeAudit(client, { staffId, actor: "staff", entity: "appointments", entityId: id, action: "refuse", before, after: { ...cancelled, reason: text } });
    return { ok: true } as const;
  }, db);
}

/** Requests nobody answered before their time: closed, and the owner is told so she notices. Returns how many. */
export async function expireRequests(db: Db, now: Date): Promise<number> {
  const due = await query<{ id: number }>("select id::int from appointments where status = 'pending' and starts_at <= $1", [now], db);
  let expired = 0;
  for (const { id } of due) {
    const done = await withTransaction(async (client) => {
      if (!(await appointments.cancel(id, client))) return false;
      await query("insert into booking_requests (appointment_id, outcome) values ($1, 'expired') on conflict do nothing", [id], client);
      await Notify.cancel(id, ["reminder", "confirmation", RECEIVED], "expired", client);
      await addOwnerEvent("request_expired", id, {}, {}, client);
      return true;
    }, db);
    if (done) expired += 1;
  }
  return expired;
}

/** The owner's reason, in her words, or a plain sentence in the message's language when she gave none. */
export async function refusalReason(appointmentId: number, locale: Locale, db?: Db): Promise<string> {
  const say = translator(locale) as unknown as (key: string) => string;
  return (await outcomeOf(appointmentId, db))?.reason ?? say("requests.noReason");
}

/** The reasons are the owner's words about a customer, so they go with an erase. */
export async function forgetCustomer(customerId: number, db: Db): Promise<void> {
  await query("delete from booking_requests where appointment_id in (select id from appointments where customer_id = $1)", [customerId], db);
}

type Wording = { subject: string; body: string };

/**
 * The templates of the two messages, for email and for the messaging
 * channel, in the site's languages. Rows that exist are left alone. On the
 * messaging channel the provider must have approved a template of the same
 * name before it can be sent.
 */
export async function seedTemplates(db: Queryable): Promise<void> {
  const named = (text: string, locale: string) => text.replaceAll("%BRAND%", brandName(locale));
  for (const [key, entry] of Object.entries(templates)) {
    const wording = entry as unknown as Record<string, Wording | undefined>;
    const main = wording[DEFAULT_LOCALE] ?? wording.en!;
    for (const channel of ["email", "messaging"] as const) {
      await db.query(
        `insert into message_templates (key, channel, body_he, subject_he, provider_template, category)
         values ($1, $2, $3, $4, $5, $6) on conflict (key, channel) do nothing`,
        [
          key,
          channel,
          named(main.body, DEFAULT_LOCALE),
          channel === "email" ? named(main.subject, DEFAULT_LOCALE) : null,
          channel === "messaging" ? entry.provider_template : null,
          channel === "messaging" ? "utility" : null,
        ],
      );
      for (const locale of LOCALES) {
        const other = locale === DEFAULT_LOCALE ? undefined : wording[locale];
        if (!other) continue;
        for (const [field, value] of Object.entries({ body: other.body, ...(channel === "email" ? { subject: other.subject } : {}) })) {
          await db.query(
            `insert into content_translations (entity, entity_key, field, locale, value) values ('message_template', $1, $2, $3, $4)
             on conflict (entity, entity_key, field, locale) do nothing`,
            [`${key}:${channel}`, field, locale, named(value, locale)],
          );
        }
      }
    }
  }
}
