// The owner's changes to bookings from the admin calendar. They skip the
// customer rules (notice, horizon, cutoff); a move must still sit inside
// opening hours and clear of time off, never breaks the no-overlap rule, and
// each one is audited and, when asked, tells the customer.
import { type Db, getPool, withTransaction } from "../platform/db";
import * as appointments from "./appointments";
import { writeAudit } from "../platform/audit";
import { addOwnerEvent } from "../platform/events";
import { Notify } from "../platform/notify";
import { bookingMessages, ownerTimeCheck } from "./service";

type Result =
  | { ok: true; appointment: appointments.Appointment }
  | { ok: false; reason: "NotFound" | "SlotTaken" | "OutsideHours" | "TimeOff" };

async function finish(
  client: Db,
  staffId: number,
  action: string,
  before: appointments.Appointment,
  after: appointments.Appointment,
  notify: { change: string } | null,
  now: Date,
): Promise<void> {
  if (notify) {
    await Notify.cancel(after.id, ["reminder"], action, client);
    await Notify.queue(bookingMessages(after, now, "owner_change", notify.change), client);
  }
  await writeAudit(client, { staffId, actor: "staff", entity: "appointments", entityId: after.id, action, before, after });
}

/** Moves a booking, keeping its length, and tells the customer. */
export async function ownerMove(id: number, start: Date, staffId: number, db: Db = getPool(), now = new Date()): Promise<Result> {
  return withTransaction(async (client) => {
    const before = await appointments.getAppointment(id, client);
    if (!before || before.status !== "confirmed") return { ok: false, reason: "NotFound" } as const;
    const end = new Date(start.getTime() + (before.end.getTime() - before.start.getTime()));
    const fits = await ownerTimeCheck(start, (end.getTime() - start.getTime()) / 60_000, client);
    if (!fits.ok) return fits;
    const moved = await appointments.move(id, start, end, client);
    if (!moved) return { ok: false, reason: "NotFound" } as const;
    if (!moved.ok) return moved;
    await finish(client, staffId, "move", before, moved.appointment, { change: "moved" }, now);
    await addOwnerEvent("booking_moved", id, { by: "owner" }, { silent: true }, client);
    return moved;
  }, db);
}

/** Lengthens (or shortens) a booking by `minutes`. The customer is not messaged for this. */
export async function ownerExtend(id: number, minutes: number, staffId: number, db: Db = getPool(), now = new Date()): Promise<Result> {
  return withTransaction(async (client) => {
    const before = await appointments.getAppointment(id, client);
    if (!before || before.status !== "confirmed") return { ok: false, reason: "NotFound" } as const;
    const end = new Date(before.end.getTime() + minutes * 60_000);
    if (end <= before.start) return { ok: false, reason: "NotFound" } as const;
    const moved = await appointments.move(id, before.start, end, client);
    if (!moved) return { ok: false, reason: "NotFound" } as const;
    if (!moved.ok) return moved;
    await finish(client, staffId, "extend", before, moved.appointment, null, now);
    return moved;
  }, db);
}

/** Cancels a booking; with `notify`, the customer gets a message. */
export async function ownerCancel(id: number, notify: boolean, staffId: number, db: Db = getPool(), now = new Date()): Promise<Result> {
  return withTransaction(async (client) => {
    const before = await appointments.getAppointment(id, client);
    if (!before) return { ok: false, reason: "NotFound" } as const;
    const cancelled = await appointments.cancel(id, client);
    if (!cancelled) return { ok: false, reason: "NotFound" } as const;
    await Notify.cancel(id, ["reminder", "confirmation"], "cancelled", client);
    await finish(client, staffId, "cancel", before, cancelled, notify ? { change: "cancelled" } : null, now);
    await addOwnerEvent("booking_cancelled", id, { by: "owner" }, { silent: true }, client);
    return { ok: true, appointment: cancelled } as const;
  }, db);
}

/** Marks a past booking as completed or as a no-show. */
export async function ownerSetStatus(
  id: number,
  status: "completed" | "no_show",
  staffId: number,
  db: Db = getPool(),
): Promise<Result> {
  return withTransaction(async (client) => {
    const before = await appointments.getAppointment(id, client);
    if (!before) return { ok: false, reason: "NotFound" } as const;
    const after =
      status === "completed" ? await appointments.markCompleted(id, client) : await appointments.markNoShow(id, client);
    if (!after) return { ok: false, reason: "NotFound" } as const;
    await Notify.cancel(id, ["reminder"], status, client);
    await finish(client, staffId, status, before, after, null, new Date());
    return { ok: true, appointment: after } as const;
  }, db);
}
