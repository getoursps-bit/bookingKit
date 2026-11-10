import { randomUUID } from "node:crypto";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { openDay } from "../setup/days";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { testDog } from "../setup/pets";
import { approve, expireRequests, outcomeOf, pendingRequests, refuse } from "@ext/approval/server/requests";
import { erase } from "@/core/booking/customers";
import { bookingView } from "@/core/booking/flow";
import { cancelBooking, confirmBooking, requestHold } from "@/core/booking/service";
import { Notify } from "@/core/platform/notify";
import { claimDue } from "@/core/platform/outbox";
import { localDateTimeToUtc } from "@/core/platform/time";
import { hasExtension } from "@/extension/registry";

const hasDb = await testDbAvailable();

// Fictional 0555 test numbers only.
const phone = (n: number) => `+97255504${String(n).padStart(4, "0")}`;

async function approvalOn(pool: pg.Pool) {
  await pool.query(`insert into settings (key, value) values ('booking.approval', 'true') on conflict (key) do update set value = 'true'`);
}

/** A booking made online, as far as the proven phone; with approval on it ends as a request. */
async function request(pool: pg.Pool, n: number, time = "10:00", ahead = 3) {
  const hold = await requestHold(
    { start: localDateTimeToUtc(openDay(ahead), time), lines: [testDog], name: `לקוח ${n}`, phone: phone(n), idempotencyKey: randomUUID(), address: `10.4.0.${n}` },
    { db: pool },
  );
  if (!hold.ok) throw new Error(hold.reason);
  const done = await confirmBooking(hold.hold.appointmentId, { db: pool });
  if (!done.ok) throw new Error(done.reason);
  return done.booking;
}

async function sendAllDue(pool: pg.Pool, now?: Date) {
  for (const row of await claimDue(50, now, pool)) await Notify.dispatch(row, pool, now ?? new Date());
}

async function sent(pool: pg.Pool, n: number, key: string): Promise<string[]> {
  const { rows } = await pool.query<{ body: string }>("select body from fake_messages where recipient = $1 and template_key = $2 order by id", [phone(n), key]);
  return rows.map((row) => row.body);
}

const statusOf = async (pool: pg.Pool, id: number) =>
  (await pool.query<{ status: string }>("select status from appointments where id = $1", [id])).rows[0]!.status;

describe.skipIf(!hasDb || !hasExtension("approval"))("booking requests the owner approves", () => {
  it("with approval off a booking is confirmed at once, as without the extension", async () => {
    await withMigratedSchema(async (pool) => {
      const booking = await request(pool, 1);
      expect(booking.appointment.status).toBe("confirmed");
      expect(await pendingRequests({}, pool)).toEqual([]);
    });
  });

  it("a request keeps its time, tells the customer and the owner, and can still be changed", async () => {
    await withMigratedSchema(async (pool) => {
      await approvalOn(pool);
      const booking = await request(pool, 2);
      expect(booking.appointment.status).toBe("pending");

      // The time is taken: nobody else can book it.
      const again = await requestHold(
        { start: booking.appointment.start, lines: [testDog], name: "אחר", phone: phone(99), idempotencyKey: randomUUID(), address: "10.4.0.99" },
        { db: pool },
      );
      expect(again).toMatchObject({ ok: false, reason: "SlotUnavailable" });

      await sendAllDue(pool);
      expect(await sent(pool, 2, "request_received")).toHaveLength(1);
      expect(await sent(pool, 2, "confirmation")).toEqual([]);
      const events = await pool.query("select type from owner_events order by id");
      expect(events.rows.map((row) => row.type)).toEqual(["request_new"]);

      const [waiting] = await pendingRequests({}, pool);
      expect(waiting).toMatchObject({ id: booking.appointment.id, visits: 0, status: "pending" });
      expect((await bookingView(booking.manageToken, { db: pool }))?.canChange).toBe(true);
      expect(await cancelBooking(booking.manageToken, { db: pool })).toMatchObject({ ok: true });
      expect(await pendingRequests({}, pool)).toEqual([]);
    });
  });

  it("approving confirms it and sends the confirmation, once", async () => {
    await withMigratedSchema(async (pool) => {
      await approvalOn(pool);
      const booking = await request(pool, 3);
      expect(await approve(booking.appointment.id, 1, pool)).toEqual({ ok: true });
      expect(await statusOf(pool, booking.appointment.id)).toBe("confirmed");
      expect(await approve(booking.appointment.id, 1, pool)).toEqual({ ok: false, reason: "NotFound" });
      await sendAllDue(pool);
      expect(await sent(pool, 3, "confirmation")).toHaveLength(1);
      // The "request received" message was still queued; it no longer applies.
      expect(await sent(pool, 3, "request_received")).toEqual([]);
      const audit = await pool.query("select action from audit_log where entity = 'appointments' and action = 'approve'");
      expect(audit.rowCount).toBe(1);
    });
  });

  it("refusing frees the time and tells the customer why, in her words", async () => {
    await withMigratedSchema(async (pool) => {
      await approvalOn(pool);
      const booking = await request(pool, 4);
      expect(await refuse(booking.appointment.id, "  אין מקום ביום הזה  ", 1, pool)).toEqual({ ok: true });
      expect(await statusOf(pool, booking.appointment.id)).toBe("cancelled");
      expect(await outcomeOf(booking.appointment.id, pool)).toEqual({ outcome: "refused", reason: "אין מקום ביום הזה" });
      expect(await bookingView(booking.manageToken, { db: pool })).toBeNull();
      await sendAllDue(pool);
      const [told] = await sent(pool, 4, "request_refused");
      expect(told).toContain("אין מקום ביום הזה");
      expect(await sent(pool, 4, "request_received")).toEqual([]);

      // The time is free again, and a refusal with no reason says a plain sentence.
      const next = await request(pool, 5);
      expect(next.appointment.start.getTime()).toBe(booking.appointment.start.getTime());
      await refuse(next.appointment.id, null, 1, pool);
      await sendAllDue(pool);
      expect((await sent(pool, 5, "request_refused"))[0]).not.toContain("{reason}");

      // Her words about a customer go when the customer is erased.
      await erase(booking.appointment.customerId, pool);
      expect(await outcomeOf(booking.appointment.id, pool)).toBeNull();
    });
  });

  it("a request nobody answered before its time expires, and the owner is told", async () => {
    await withMigratedSchema(async (pool) => {
      await approvalOn(pool);
      const booking = await request(pool, 6);
      expect(await expireRequests(pool, new Date())).toBe(0);
      const after = new Date(booking.appointment.start.getTime() + 60_000);
      expect(await expireRequests(pool, after)).toBe(1);
      expect(await expireRequests(pool, after)).toBe(0);
      expect(await outcomeOf(booking.appointment.id, pool)).toEqual({ outcome: "expired", reason: null });
      const events = await pool.query("select type from owner_events order by id");
      expect(events.rows.map((row) => row.type)).toEqual(["request_new", "request_expired"]);
    });
  });
});
