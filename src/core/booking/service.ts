// Booking entry points shared by the customer flow, the move flow and the
// owner's booking form. Each checks its input with Zod, combines the
// repositories with the pure functions in slots.ts, and keeps every change and
// the messages it causes in one transaction.
import { z } from "zod";
import { bookingLinePoints, firstWith } from "../../extension/registry";
import type { Locale } from "../../i18n/locales";
import { type Db, getPool, query, withTransaction } from "../platform/db";
import { newRawToken } from "../platform/identity/hash";
import { revoke } from "./manageTokens";
import * as appointments from "./appointments";
import { writeAudit } from "../platform/audit";
import * as catalog from "./catalog";
import * as customers from "./customers";
import { addOwnerEvent } from "../platform/events";
import { Notify } from "../platform/notify";
import { hit } from "../platform/rateLimits";
import { getSettings, type Settings } from "../platform/settings";
import { localDateOf, localDayBounds } from "../platform/time";
import {
  addLocalDays,
  type DayInput,
  dayStatus,
  type DayStatus,
  firstAvailable,
  fitsDay,
  freeSlots,
  type Interval,
  type SlotRules,
  visitLength,
  weekdayOf,
} from "./slots";

export type Context = {
  db?: Db;
  now?: Date;
  /** The language of the page the customer booked from; a confirmed booking stores it on the customer. */
  locale?: Locale;
};

const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PhoneE164 = z.string().regex(/^\+[1-9]\d{7,14}$/);
const ServiceId = z.number().int().positive();
/** One line of a customer booking: the chosen service, and what each extension asked about it, by extension id. */
const LineInput = z.object({ serviceId: ServiceId, details: z.record(z.string(), z.unknown()).default({}) });

const RATE = {
  holdsPerPhonePerHour: 5,
  holdsPerAddressPerHour: 20,
  holdsPerPhonePerDay: 10,
};

export type BookingError =
  | "TooManyLines"
  | "NoRule"
  | "NotBookableOnline"
  | "SlotUnavailable"
  | "SlotTaken"
  | "RateLimited"
  | "HoldExpired"
  | "NotFound"
  | "PastCutoff"
  | "OutsideHours"
  | "TimeOff";

type Fail = { ok: false; reason: BookingError };

function slotRules(settings: Settings): SlotRules {
  return {
    slotStepMin: settings["booking.slotStepMin"],
    gapMin: settings["booking.gapMin"],
    bufferMin: settings["booking.bufferMin"],
    noticeMin: settings["booking.noticeMin"],
    horizonDays: settings["booking.horizonDays"],
  };
}

type Line = appointments.AppointmentLine & { serviceNameHe: string };

/** Turns the chosen services into booking lines, or the first reason one cannot be booked online. */
async function resolveLines(
  serviceIds: number[],
  settings: Settings,
  db: Db,
): Promise<{ ok: true; lines: Line[] } | Fail> {
  if (serviceIds.length === 0 || serviceIds.length > settings["booking.maxLines"]) {
    return { ok: false, reason: "TooManyLines" };
  }
  const services = await catalog.listServices({ activeOnly: true }, db);
  const lines: Line[] = [];
  for (const id of serviceIds) {
    const service = services.find((candidate) => candidate.id === id);
    if (!service) return { ok: false, reason: "NoRule" };
    if (!service.bookableOnline) return { ok: false, reason: "NotBookableOnline" };
    lines.push({
      serviceId: service.id,
      serviceNameHe: service.name,
      durationMin: service.durationMin,
      priceFromAgorot: service.priceFromAgorot,
    });
  }
  return { ok: true, lines };
}

/** Hours, time off and live bookings for each local day from `from` to `to`, inclusive. */
async function loadDays(from: string, to: string, db: Db, excludeAppointmentId?: number): Promise<DayInput[]> {
  const rangeStart = localDayBounds(from).start;
  const rangeEnd = localDayBounds(to).end;
  const hours = await catalog.getOpeningHours(db);
  const timeOff = await catalog.listTimeOff(rangeStart, rangeEnd, db);
  const busy = await appointments.listForRange(rangeStart, rangeEnd, {}, db);
  const toInterval = (row: Interval): Interval => ({ start: row.start, end: row.end });
  const days: DayInput[] = [];
  for (let date = from; date <= to; date = addLocalDays(date, 1)) {
    const bounds = localDayBounds(date);
    const touches = (row: Interval) => row.start < bounds.end && row.end > bounds.start;
    days.push({
      date,
      hours: hours.find((row) => row.weekday === weekdayOf(date)),
      timeOff: timeOff.filter(touches).map(toInterval),
      busy: busy.filter((row) => row.id !== excludeAppointmentId && touches(row)).map(toInterval),
    });
  }
  return days;
}

/** For the owner's own bookings and moves: inside opening hours and clear of time off. */
export async function ownerTimeCheck(
  start: Date,
  lengthMin: number,
  db: Db,
): Promise<{ ok: true } | { ok: false; reason: "OutsideHours" | "TimeOff" }> {
  const settings = await getSettings(db);
  const date = localDateOf(start);
  const [day] = await loadDays(date, date, db);
  const fit = fitsDay(day!, start, lengthMin, settings["booking.bufferMin"]);
  return fit === "ok" ? { ok: true } : { ok: false, reason: fit };
}

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

const WeekInput = z.object({
  date: LocalDate,
  /** The chosen services, one per line. */
  serviceIds: z.array(ServiceId).min(1),
});

export type Week = {
  lengthMin: number;
  days: { date: string; status: DayStatus }[];
  /** Free start times for `date`. */
  slots: Date[];
  firstAvailable: { date: string; start: Date } | null;
};

/** The weekly strip starting at `date`, the free times on `date`, and the first free time overall. */
export async function getWeek(
  input: z.input<typeof WeekInput>,
  ctx: Context = {},
): Promise<{ ok: true; week: Week } | Fail> {
  const { date, serviceIds } = WeekInput.parse(input);
  const db = ctx.db ?? getPool();
  const settings = await getSettings(db);
  const resolved = await resolveLines(serviceIds, settings, db);
  if (!resolved.ok) return resolved;
  const rules = slotRules(settings);
  return {
    ok: true,
    week: await buildWeek(date, visitLength(resolved.lines, rules), rules, db, ctx.now ?? new Date()),
  };
}

/** The same week view for moving a booking: its own length, ignoring its own slot. */
export async function getWeekForMove(
  token: string,
  date: string,
  ctx: Context = {},
): Promise<{ ok: true; week: Week } | Fail> {
  const db = ctx.db ?? getPool();
  const current = await appointments.getByToken(token, db);
  if (!current || !appointments.changeable(current)) return { ok: false, reason: "NotFound" };
  const settings = await getSettings(db);
  const lengthMin = Math.round((current.end.getTime() - current.start.getTime()) / 60_000);
  const week = await buildWeek(
    LocalDate.parse(date),
    lengthMin,
    slotRules(settings),
    db,
    ctx.now ?? new Date(),
    current.id,
  );
  return { ok: true, week };
}

async function buildWeek(
  date: string,
  lengthMin: number,
  rules: SlotRules,
  db: Db,
  now: Date,
  excludeAppointmentId?: number,
): Promise<Week> {
  const today = localDateOf(now);
  const lastDay = addLocalDays(today, rules.horizonDays);
  const weekEnd = addLocalDays(date, 6);
  const days = await loadDays(
    date < today ? date : today,
    weekEnd > lastDay ? weekEnd : lastDay,
    db,
    excludeAppointmentId,
  );
  const week = days.filter((day) => day.date >= date && day.date <= weekEnd);
  return {
    lengthMin,
    days: week.map((day) => ({ date: day.date, status: dayStatus(day, lengthMin, rules, now) })),
    slots: freeSlots(week[0]!, lengthMin, rules, now),
    firstAvailable: firstAvailable(
      days.filter((day) => day.date >= today),
      lengthMin,
      rules,
      now,
    ),
  };
}

const HoldInput = z.object({
  start: z.coerce.date(),
  lines: z.array(LineInput).min(1),
  name: z.string().trim().min(1).max(80),
  phone: PhoneE164,
  email: z.email().max(200).nullable().default(null),
  idempotencyKey: z.string().min(16).max(100),
  /** Instagram and other campaign tags captured on the first visit. */
  source: z.record(z.string(), z.string().max(200)).default({}),
  /** Client address, used only as a rate-limit key. */
  address: z.string().max(100),
});

export type Hold = { appointmentId: number; customerId: number; holdExpiresAt: Date };

/**
 * Takes the chosen slot while the customer enters the code. The slot is
 * checked again against fresh data, and the database's no-overlap rule decides
 * any race between two customers.
 */
export async function requestHold(
  input: z.input<typeof HoldInput>,
  ctx: Context = {},
): Promise<{ ok: true; hold: Hold } | Fail> {
  const data = HoldInput.parse(input);
  const db = ctx.db ?? getPool();
  const now = ctx.now ?? new Date();

  // The same form sent again gets the first answer, before any other check.
  const earlier = await appointments.getByIdempotencyKey(data.idempotencyKey, db);
  if (earlier) return { ok: true, hold: toHold(earlier) };

  const allowed = [
    await hit(`hold:phone:${data.phone}`, 60, RATE.holdsPerPhonePerHour, db),
    await hit(`hold:phone-day:${data.phone}`, 24 * 60, RATE.holdsPerPhonePerDay, db),
    await hit(`hold:address:${data.address}`, 60, RATE.holdsPerAddressPerHour, db),
  ];
  if (allowed.includes(false)) return { ok: false, reason: "RateLimited" };

  const settings = await getSettings(db);
  const resolved = await resolveLines(
    data.lines.map((line) => line.serviceId),
    settings,
    db,
  );
  if (!resolved.ok) return resolved;
  // Each extension that asked for details on the lines may still refuse them.
  for (const { id, point } of bookingLinePoints()) {
    const reason = await point.check?.(
      data.lines.map((line, index) => ({ position: index + 1, serviceId: line.serviceId, details: line.details[id] })),
      db,
    );
    if (reason) return { ok: false, reason };
  }
  const rules = slotRules(settings);
  const lengthMin = visitLength(resolved.lines, rules);
  const date = localDateOf(data.start);
  const [day] = await loadDays(date, date, db);
  if (!freeSlots(day!, lengthMin, rules, now).some((slot) => sameInstant(slot, data.start))) {
    return { ok: false, reason: "SlotUnavailable" };
  }

  const customer = await customers.findOrCreateByPhone(data.phone, data.name, "online", db);
  // A typed email replaces one nobody verified. A verified email on file stays until
  // the customer proves who they are with the code (see verifyAndConfirm).
  if (data.email) {
    const onFile = await customers.getEmail(customer.id, db);
    if (!onFile?.verified || onFile.value === data.email.trim().toLowerCase()) {
      await customers.setEmail(customer.id, data.email, { verify: false, takeOver: false }, db);
    }
  }
  // The lines' details are saved on the customer only once the phone is verified, so an
  // unverified form cannot add anything to someone else's record.
  const result = await appointments.createHold(
    {
      customerId: customer.id,
      start: data.start,
      end: new Date(data.start.getTime() + lengthMin * 60_000),
      lines: resolved.lines,
      createdBy: "customer",
      source: { ...data.source, lineDrafts: data.lines.map((line) => line.details) },
      idempotencyKey: data.idempotencyKey,
    },
    settings["booking.holdMin"],
    db,
  );
  if (!result.ok) return result;
  return { ok: true, hold: toHold(result.appointment) };
}

function toHold(appointment: appointments.Appointment): Hold {
  return {
    appointmentId: appointment.id,
    customerId: appointment.customerId,
    holdExpiresAt: appointment.holdExpiresAt ?? appointment.start,
  };
}

/**
 * Message rows for a booking. They carry no private link: the worker issues a
 * fresh one when it sends, so the outbox never stores a usable token.
 */
export function bookingMessages(
  appointment: appointments.Appointment,
  now: Date,
  /** One of the core's, or an extension's own customer message kind. */
  kind: "confirmation" | "customer_change" | "owner_change" | (string & {}),
  change?: string,
) {
  const rows: Parameters<typeof Notify.queue>[0] = [
    {
      kind,
      templateKey: kind,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      data: change ? { change } : {},
      dedupeKey: `${kind}:${appointment.id}:${appointment.start.toISOString()}:${appointment.status}`,
    },
  ];
  const reminderAt = new Date(appointment.start.getTime() - 24 * 60 * 60_000);
  if (appointment.status === "confirmed" && reminderAt > now) {
    rows.push({
      kind: "reminder",
      templateKey: "reminder",
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      sendAt: reminderAt,
      dedupeKey: `reminder:${appointment.id}:${appointment.start.toISOString()}`,
    });
  }
  return rows;
}

export type Confirmed = { appointment: appointments.Appointment; manageToken: string };

/**
 * Settles a hold after the code (or a trusted device) proved the phone. In one
 * transaction: confirms it (or, when an extension asks, leaves it pending), lets the extensions save the lines' details, issues the
 * private link, and queues the confirmation, the reminder and the owner alert.
 */
export async function confirmBooking(
  holdId: number,
  ctx: Context = {},
): Promise<{ ok: true; booking: Confirmed } | Fail> {
  const now = ctx.now ?? new Date();
  return withTransaction(async (client) => {
    // An extension may make the booking wait for an answer; it then keeps its time as pending.
    const approval = firstWith("approval");
    const waits = approval ? await approval.needed(client) : false;
    const appointment = await appointments.settle(holdId, waits ? "pending" : "confirmed", client);
    if (!appointment) {
      const existing = await appointments.getAppointment(holdId, client);
      return { ok: false, reason: existing ? "HoldExpired" : "NotFound" } as const;
    }

    const drafts = z.array(z.record(z.string(), z.unknown())).catch([]).parse(appointment.source.lineDrafts);
    const source = { ...appointment.source };
    delete source.lineDrafts;
    // Each extension saves what it asked about the lines.
    const lines = await appointments.listLines(appointment.id, client);
    for (const { id, point } of bookingLinePoints()) {
      await point.confirm(
        client,
        appointment,
        lines.map((line, index) => ({ position: index + 1, serviceId: line.serviceId, details: drafts[index]?.[id] })),
        now,
      );
    }
    await query("update appointments set source = $2 where id = $1", [appointment.id, JSON.stringify(source)], client);

    const manageToken = newRawToken();
    await appointments.issueManageToken(appointment.id, manageToken, appointment.end, client);
    // Booking is the customer's request for appointment messages; a later
    // withdrawal from the private link is kept as a newer row.
    await query(
      `insert into consents (customer_id, purpose, channel, source)
       select $1, 'appointment_messages', null, 'booking'
       where not exists (select 1 from consents where customer_id = $1 and purpose = 'appointment_messages'
                         and revoked_at is null)`,
      [appointment.customerId],
      client,
    );
    // The phone is proven by now, so the booking may set the customer's language.
    if (ctx.locale) await customers.setLocale(appointment.customerId, ctx.locale, client);
    if (approval && appointment.status === "pending") {
      await approval.requested(appointment, client, now);
    } else {
      await Notify.queue(bookingMessages(appointment, now, "confirmation"), client);
      await addOwnerEvent("booking_created", appointment.id, {}, {}, client);
    }
    return { ok: true, booking: { appointment: { ...appointment, source }, manageToken } } as const;
  }, ctx.db ?? getPool());
}

/**
 * A pending booking is approved: it becomes confirmed and the customer gets
 * the confirmation and the reminder. The owner's own action, so no alert
 * goes back to her. For the extension that made it wait.
 */
export async function approvePending(
  id: number,
  staffId: number,
  ctx: Context = {},
): Promise<{ ok: true; appointment: appointments.Appointment } | Fail> {
  const now = ctx.now ?? new Date();
  return withTransaction(async (client) => {
    const before = await appointments.getAppointment(id, client);
    const approved = before ? await appointments.approve(id, client) : null;
    if (!before || !approved) return { ok: false, reason: "NotFound" } as const;
    await Notify.queue(bookingMessages(approved, now, "confirmation"), client);
    await addOwnerEvent("booking_created", id, { by: "owner", approved: true }, { silent: true }, client);
    await writeAudit(client, { staffId, actor: "staff", entity: "appointments", entityId: id, action: "approve", before, after: approved });
    return { ok: true, appointment: approved } as const;
  }, ctx.db ?? getPool());
}

function beforeCutoff(appointment: appointments.Appointment, settings: Settings, now: Date): boolean {
  return now.getTime() < appointment.start.getTime() - settings["booking.cutoffHours"] * 60 * 60_000;
}

/** Moves a booking from its private link. Same length, new start; free-time rules apply as for a new booking. */
export async function moveBooking(
  token: string,
  newStart: Date,
  ctx: Context = {},
): Promise<{ ok: true; appointment: appointments.Appointment } | Fail> {
  const db = ctx.db ?? getPool();
  const now = ctx.now ?? new Date();
  const start = z.coerce.date().parse(newStart);
  return withTransaction(async (client) => {
    const current = await appointments.getByToken(token, client);
    if (!current || !appointments.changeable(current)) return { ok: false, reason: "NotFound" } as const;
    const settings = await getSettings(client);
    if (!beforeCutoff(current, settings, now)) return { ok: false, reason: "PastCutoff" } as const;

    const rules = slotRules(settings);
    const lengthMin = Math.round((current.end.getTime() - current.start.getTime()) / 60_000);
    const date = localDateOf(start);
    const [day] = await loadDays(date, date, client, current.id);
    if (!freeSlots(day!, lengthMin, rules, now).some((slot) => sameInstant(slot, start))) {
      return { ok: false, reason: "SlotUnavailable" } as const;
    }
    const moved = await appointments.move(current.id, start, new Date(start.getTime() + lengthMin * 60_000), client);
    if (!moved) return { ok: false, reason: "NotFound" } as const;
    if (!moved.ok) return moved;

    await Notify.cancel(current.id, ["reminder"], "moved", client);
    await Notify.queue(bookingMessages(moved.appointment, now, "customer_change", "moved"), client);
    await addOwnerEvent("booking_moved", current.id, { from: current.start.toISOString() }, {}, client);
    return { ok: true, appointment: moved.appointment } as const;
  }, db);
}

/** Cancels a booking from its private link, up to the cutoff. */
export async function cancelBooking(
  token: string,
  ctx: Context = {},
): Promise<{ ok: true; appointment: appointments.Appointment } | Fail> {
  const now = ctx.now ?? new Date();
  return withTransaction(async (client) => {
    const current = await appointments.getByToken(token, client);
    if (!current || !appointments.changeable(current)) return { ok: false, reason: "NotFound" } as const;
    const settings = await getSettings(client);
    if (!beforeCutoff(current, settings, now)) return { ok: false, reason: "PastCutoff" } as const;
    const cancelled = await appointments.cancel(current.id, client);
    if (!cancelled) return { ok: false, reason: "NotFound" } as const;
    await Notify.cancel(current.id, ["reminder"], "cancelled", client);
    await revoke(current.id, client);
    await Notify.queue(bookingMessages(cancelled, now, "customer_change", "cancelled"), client);
    await addOwnerEvent("booking_cancelled", current.id, {}, {}, client);
    return { ok: true, appointment: cancelled } as const;
  }, ctx.db ?? getPool());
}

const OwnerBookingInput = z.object({
  start: z.coerce.date(),
  customer: z.object({ name: z.string().trim().min(1).max(80), phone: PhoneE164 }),
  /** Owner picks services directly, including ones not bookable online. */
  lines: z
    .array(
      z.object({ serviceId: z.number().int().positive() }),
    )
    .min(1),
  notes: z.string().max(1000).nullable().default(null),
  /** False when the owner books for a walk-in who should get no message. */
  notifyCustomer: z.boolean().default(true),
});

/**
 * A booking the owner enters, for example from a phone call. It skips the hold
 * and the notice and horizon rules, but not opening hours, time off or the
 * no-overlap rule.
 */
export async function ownerCreateBooking(
  input: z.input<typeof OwnerBookingInput>,
  staffId: number,
  ctx: Context = {},
): Promise<{ ok: true; appointment: appointments.Appointment } | Fail> {
  const data = OwnerBookingInput.parse(input);
  const now = ctx.now ?? new Date();
  return withTransaction(async (client) => {
    const settings = await getSettings(client);
    const services = await catalog.listServices({}, client);
    const lines: appointments.AppointmentLine[] = [];
    for (const line of data.lines) {
      const service = services.find((candidate) => candidate.id === line.serviceId);
      if (!service) return { ok: false, reason: "NoRule" } as const;
      lines.push({
        serviceId: service.id,
        durationMin: service.durationMin,
        priceFromAgorot: service.priceFromAgorot,
      });
    }
    const lengthMin = visitLength(lines, slotRules(settings));
    const fits = await ownerTimeCheck(data.start, lengthMin, client);
    if (!fits.ok) return fits;
    const customer = await customers.findOrCreateByPhone(data.customer.phone, data.customer.name, "owner", client);
    const result = await appointments.createConfirmed(
      {
        customerId: customer.id,
        start: data.start,
        end: new Date(data.start.getTime() + lengthMin * 60_000),
        lines,
        createdBy: "owner",
        notes: data.notes,
      },
      client,
    );
    if (!result.ok) return result;
    if (data.notifyCustomer) await Notify.queue(bookingMessages(result.appointment, now, "confirmation"), client);
    // The owner made this change, so the event is kept but no alert is sent.
    await addOwnerEvent("booking_created", result.appointment.id, { by: "owner" }, { silent: true }, client);
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "appointments",
      entityId: result.appointment.id,
      action: "create",
      after: result.appointment,
    });
    return result;
  }, ctx.db ?? getPool());
}
