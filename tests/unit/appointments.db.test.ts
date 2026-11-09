import { randomUUID } from "node:crypto";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { seed } from "../../db/seed/seed";
import { migrate, pendingMigrations } from "../../scripts/migrate";
import { openDay } from "../setup/days";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { hasExtension } from "@/extension/registry";
import * as booking from "@/server/booking/service";
import * as appointments from "@/server/repos/appointments";
import { localDateTimeToUtc } from "@/server/time";
import { dogWith, testDog } from "../setup/pets";

// Needs the compose Postgres locally or the CI service; skipped otherwise.
const hasDb = await testDbAvailable();
/** Tests of what the pets extension adds to a booking run only for a client that has it on. */
const pets = hasExtension("pets");

/** The first open day (not Wednesday or Friday) at least `ahead` days away. */
// Test numbers from the fictional 0555 range, never real customers.
const phone = (n: number) => `+97255500${String(n).padStart(4, "0")}`;

function holdInput(start: Date, n: number, overrides: Record<string, unknown> = {}) {
  return {
    start,
    lines: [testDog],
    name: `לקוח ${n}`,
    phone: phone(n),
    idempotencyKey: randomUUID(),
    address: `10.0.0.${n}`,
    ...overrides,
  };
}

async function count(pool: pg.Pool, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`select count(*)::int as n from (${sql}) x`, params);
  return rows[0]!.n;
}

describe.skipIf(!hasDb)("migrations and seed", () => {
  it("apply once, report nothing pending, and seed twice without duplicates", async () => {
    await withMigratedSchema(async (pool) => {
      const client = await pool.connect();
      try {
        expect(await pendingMigrations(client)).toEqual([]);
        expect(await migrate(client)).toEqual([]);
        await seed(client);
      } finally {
        client.release();
      }
      expect(await count(pool, "select * from services")).toBe(6);
      expect(await count(pool, "select * from products")).toBe(8);
      expect(await count(pool, "select * from opening_hours where closed")).toBe(2);
      expect(await count(pool, "select * from services where not bookable_online")).toBe(1);
      expect(await count(pool, "select * from pg_tables where schemaname = current_schema() and not rowsecurity")).toBe(
        0,
      );
    });
  });
});

describe.skipIf(!hasDb)("booking against Postgres", () => {
  const date = openDay();
  const noon = localDateTimeToUtc(date, "12:00");

  it("gives exactly one hold when twenty customers ask for the same slot at once", async () => {
    await withMigratedSchema(async (db) => {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, n) => booking.requestHold(holdInput(noon, n + 1), { db })),
      );
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      for (const result of results.filter((result) => !result.ok)) {
        expect(["SlotTaken", "SlotUnavailable"]).toContain(result.reason);
      }
      expect(await count(db, "select * from appointments where status = 'held'")).toBe(1);
    });
  });

  it("releases an expired hold and the slot becomes free", async () => {
    await withMigratedSchema(async (db) => {
      const first = await booking.requestHold(holdInput(noon, 1), { db });
      expect(first.ok).toBe(true);
      expect(await booking.requestHold(holdInput(noon, 2), { db })).toMatchObject({ ok: false });

      await db.query("update appointments set hold_expires_at = now() - interval '1 minute'");
      const second = await booking.requestHold(holdInput(noon, 3), { db });
      expect(second.ok).toBe(true);
      const { rows } = await db.query<{ status: string }>("select status from appointments order by id");
      expect(rows.map((row) => row.status)).toEqual(["released", "held"]);
      if (first.ok)
        expect(await booking.confirmBooking(first.hold.appointmentId, { db })).toMatchObject({ reason: "HoldExpired" });
    });
  });

  it("confirms in one step: line details saved, private link issued, messages and owner alert queued", async () => {
    await withMigratedSchema(async (db) => {
      const hold = await booking.requestHold(holdInput(noon, 1, { source: { utm_source: "instagram" } }), { db });
      if (!hold.ok) throw new Error(hold.reason);
      const confirmed = await booking.confirmBooking(hold.hold.appointmentId, { db });
      if (!confirmed.ok) throw new Error(confirmed.reason);

      expect(confirmed.booking.appointment.status).toBe("confirmed");
      expect(confirmed.booking.appointment.source).toEqual({ utm_source: "instagram" });
      expect((await appointments.getByToken(confirmed.booking.manageToken, db))?.id).toBe(hold.hold.appointmentId);
      if (pets) {
        expect(await count(db, "select * from pets")).toBe(1);
        // The vet and the vaccine confirmation are kept on the pet, with its size from the service.
        const { rows: pets } = await db.query(
          "select vet_name, vaccines_confirmed_at is not null as vaccines, age_group, weight_group from pets",
        );
        expect(pets[0]).toEqual({ vet_name: "מרפאת בדיקה", vaccines: true, age_group: "adult", weight_group: "small" });
        expect(await count(db, "select * from appointment_pets where pet_id is not null")).toBe(1);
      }
      const { rows } = await db.query<{ kind: string }>("select kind from message_outbox order by kind");
      expect(rows.map((row) => row.kind)).toEqual(["confirmation", "owner_alert", "reminder"]);
      expect(await count(db, "select * from owner_events where type = 'booking_created' and read_at is null")).toBe(1);
      // The outbox never holds a usable private link.
      expect(
        await count(db, "select * from message_outbox where data::text like $1", [
          `%${confirmed.booking.manageToken}%`,
        ]),
      ).toBe(0);
    });
  });

  it("moves a booking in one step, even onto part of its own old slot", async () => {
    await withMigratedSchema(async (db) => {
      const hold = await booking.requestHold(holdInput(noon, 1), { db });
      if (!hold.ok) throw new Error(hold.reason);
      const confirmed = await booking.confirmBooking(hold.hold.appointmentId, { db });
      if (!confirmed.ok) throw new Error(confirmed.reason);

      const later = localDateTimeToUtc(date, "12:30");
      const moved = await booking.moveBooking(confirmed.booking.manageToken, later, { db });
      expect(moved).toMatchObject({ ok: true, appointment: { start: later } });
      expect(await count(db, "select * from appointments where status = 'confirmed'")).toBe(1);
      expect(await count(db, "select * from message_outbox where kind = 'reminder' and status = 'skipped'")).toBe(1);
      expect(await count(db, "select * from message_outbox where kind = 'reminder' and status = 'queued'")).toBe(1);
      // The link the customer already has now lasts until the new end.
      const { rows: links } = await db.query<{ expires_at: Date; ends_at: Date }>(
        "select t.expires_at, a.ends_at from manage_tokens t join appointments a on a.id = t.appointment_id",
      );
      expect(links.map((link) => link.expires_at.getTime())).toEqual(links.map((link) => link.ends_at.getTime()));

      // 11:00 to 12:30 overlapped the old slot only; 13:00 is inside the moved booking.
      expect((await booking.requestHold(holdInput(localDateTimeToUtc(date, "11:00"), 2), { db })).ok).toBe(true);
      expect(await booking.requestHold(holdInput(localDateTimeToUtc(date, "13:00"), 3), { db })).toMatchObject({
        ok: false,
        reason: "SlotUnavailable",
      });
    });
  });

  it.skipIf(!pets)("refuses a pet of the wrong species for its service", async () => {
    await withMigratedSchema(async (db) => {
      expect(
        await booking.requestHold(holdInput(noon, 1, { lines: [dogWith({ species: "cat" })] }), { db }),
      ).toEqual({ ok: false, reason: "NoRule" });
      expect(await count(db, "select * from appointments")).toBe(0);
    });
  });

  it.skipIf(!pets)("books a pet without a vaccination certificate and keeps the answer", async () => {
    await withMigratedSchema(async (db) => {
      const hold = await booking.requestHold(holdInput(noon, 1, { lines: [dogWith({ vaccinesConfirmed: false })] }), {
        db,
      });
      if (!hold.ok) throw new Error(hold.reason);
      expect((await booking.confirmBooking(hold.hold.appointmentId, { db })).ok).toBe(true);
      const { rows } = await db.query("select vaccines_confirmed_at from pets");
      expect(rows).toEqual([{ vaccines_confirmed_at: null }]);
    });
  });

  it.skipIf(!pets)("updates a pet booked before instead of adding it again", async () => {
    await withMigratedSchema(async (db) => {
      for (const [n, time, vetName] of [
        [1, "10:00", "מרפאה ראשונה"],
        [2, "13:00", "מרפאה שנייה"],
      ] as const) {
        const hold = await booking.requestHold(
          { ...holdInput(localDateTimeToUtc(date, time), n, { lines: [dogWith({ vetName })] }), phone: phone(1) },
          { db },
        );
        if (!hold.ok) throw new Error(hold.reason);
        expect((await booking.confirmBooking(hold.hold.appointmentId, { db })).ok).toBe(true);
      }
      const { rows } = await db.query<{ vet_name: string }>("select vet_name from pets");
      expect(rows).toEqual([{ vet_name: "מרפאה שנייה" }]);
    });
  });

  it("refuses an owner booking that clashes with a held slot", async () => {
    await withMigratedSchema(async (db) => {
      expect((await booking.requestHold(holdInput(noon, 1), { db })).ok).toBe(true);
      const { rows } = await db.query<{ id: number }>("select id::int from services where duration_min = 80");
      const owner = await booking.ownerCreateBooking(
        {
          start: localDateTimeToUtc(date, "12:30"),
          customer: { name: "טלפון", phone: phone(50) },
          lines: [{ serviceId: rows[0]!.id }],
        },
        1,
        { db },
      );
      expect(owner).toEqual({ ok: false, reason: "SlotTaken" });
      expect(await count(db, "select * from appointments")).toBe(1);
    });
  });

  it("returns the same booking for the same one-time key", async () => {
    await withMigratedSchema(async (db) => {
      const input = holdInput(noon, 1);
      const [first, second] = await Promise.all([
        booking.requestHold(input, { db }),
        booking.requestHold(input, { db }),
      ]);
      const third = await booking.requestHold(input, { db });
      expect(first.ok && second.ok && third.ok).toBe(true);
      if (first.ok && second.ok && third.ok) {
        expect(second.hold.appointmentId).toBe(first.hold.appointmentId);
        expect(third.hold.appointmentId).toBe(first.hold.appointmentId);
      }
      expect(await count(db, "select * from appointments")).toBe(1);
    });
  });

  it("refuses to cancel inside the cutoff", async () => {
    await withMigratedSchema(async (db) => {
      const hold = await booking.requestHold(holdInput(noon, 1), { db });
      if (!hold.ok) throw new Error(hold.reason);
      const confirmed = await booking.confirmBooking(hold.hold.appointmentId, { db });
      if (!confirmed.ok) throw new Error(confirmed.reason);
      const lateNow = new Date(noon.getTime() - 60 * 60_000);
      expect(await booking.cancelBooking(confirmed.booking.manageToken, { db, now: lateNow })).toEqual({
        ok: false,
        reason: "PastCutoff",
      });
      expect((await booking.cancelBooking(confirmed.booking.manageToken, { db })).ok).toBe(true);
      expect(await appointments.getByToken(confirmed.booking.manageToken, db)).toBeNull();
    });
  });
});
