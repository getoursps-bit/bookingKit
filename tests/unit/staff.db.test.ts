import { randomUUID } from "node:crypto";
import { generate } from "otplib";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { openDay } from "../setup/days";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { ownerCancel, ownerExtend, ownerMove } from "@/core/booking/owner";
import { requestHold, confirmBooking } from "@/core/booking/service";
import {
  checkEmailCode,
  checkPassword,
  checkTotp,
  createSession,
  hashPassword,
  newTotpSecret,
  resolveSession,
  revokeSession,
  sendEmailCode,
} from "@/core/platform/staff/auth";
import { localDateTimeToUtc } from "@/core/platform/time";
import { testDog } from "../setup/pets";

const hasDb = await testDbAvailable();

// A made-up test password; never a real one.
const PASSWORD = "test-password-not-real";

async function addStaff(pool: pg.Pool, email = "owner@example.test") {
  const totp = newTotpSecret(email);
  const { rows } = await pool.query<{ id: number }>(
    "insert into staff (email, password_hash, totp_secret) values ($1, $2, $3) returning id::int",
    [email, await hashPassword(PASSWORD), totp.secret],
  );
  return { id: rows[0]!.id, secret: totp.secret, email };
}

describe.skipIf(!hasDb)("staff login", () => {
  it("accepts the right password, ignores email case, and refuses a wrong one", async () => {
    await withMigratedSchema(async (pool) => {
      const staff = await addStaff(pool);
      expect(await checkPassword("Owner@Example.test", PASSWORD, pool)).toEqual({ ok: true, staffId: staff.id });
      expect(await checkPassword(staff.email, "wrong", pool)).toEqual({ ok: false, reason: "Wrong" });
      expect(await checkPassword("nobody@example.test", PASSWORD, pool)).toEqual({ ok: false, reason: "Wrong" });
    });
  });

  it("locks the email after ten failures, even for the right password", async () => {
    await withMigratedSchema(async (pool) => {
      const staff = await addStaff(pool);
      for (let i = 0; i < 10; i++) await checkPassword(staff.email, "wrong", pool);
      expect((await checkPassword(staff.email, "wrong", pool)).ok).toBe(false);
      expect(await checkPassword(staff.email, PASSWORD, pool)).toEqual({ ok: false, reason: "Locked" });
    });
  });

  it("accepts an app code once and refuses it the second time", async () => {
    await withMigratedSchema(async (pool) => {
      const staff = await addStaff(pool);
      const code = await generate({ secret: staff.secret });
      expect(await checkTotp(staff.id, "12345", pool)).toBe(false);
      expect(await checkTotp(staff.id, code, pool)).toBe(true);
      expect(await checkTotp(staff.id, code, pool)).toBe(false);
    });
  });

  it("logs in with a code sent to the staff email, once, and keeps only its hash", async () => {
    await withMigratedSchema(async (pool) => {
      const staff = await addStaff(pool);
      expect(await sendEmailCode("Owner@Example.test", "he", pool)).toEqual({ ok: true });
      const { rows } = await pool.query<{ body: string }>(
        "select body from fake_messages where recipient = $1 and template_key = 'staff_code' order by id desc limit 1",
        [staff.email],
      );
      const code = /(\d{6})/.exec(rows[0]?.body ?? "")?.[1] ?? "";
      expect(code).toMatch(/^\d{6}$/);
      const stored = await pool.query("select email_code_hash from staff where id = $1", [staff.id]);
      expect(JSON.stringify(stored.rows)).not.toContain(code);
      const outbox = await pool.query("select kind, channel, status from message_outbox where kind = 'staff_code'");
      expect(outbox.rows).toEqual([{ kind: "staff_code", channel: "email", status: "sent" }]);

      const wrong = code === "000000" ? "111111" : "000000";
      expect(await checkEmailCode(staff.email, wrong, pool)).toBeNull();
      expect(await checkEmailCode(staff.email, code, pool)).toBe(staff.id);
      expect(await checkEmailCode(staff.email, code, pool)).toBeNull();
    });
  });

  it("answers the same for an unknown email, limits sends, and voids a code after five wrong tries", async () => {
    await withMigratedSchema(async (pool) => {
      const staff = await addStaff(pool);
      expect(await sendEmailCode("nobody@example.test", "he", pool)).toEqual({ ok: true });
      const none = await pool.query(
        "select count(*)::int as n from fake_messages where recipient = 'nobody@example.test'",
      );
      expect(none.rows[0].n).toBe(0);

      await sendEmailCode(staff.email, "he", pool);
      const { rows } = await pool.query<{ body: string }>(
        "select body from fake_messages where recipient = $1 and template_key = 'staff_code' order by id desc limit 1",
        [staff.email],
      );
      const code = /(\d{6})/.exec(rows[0]?.body ?? "")?.[1] ?? "";
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) expect(await checkEmailCode(staff.email, wrong, pool)).toBeNull();
      expect(await checkEmailCode(staff.email, code, pool)).toBeNull();

      await sendEmailCode(staff.email, "he", pool);
      await sendEmailCode(staff.email, "he", pool);
      expect(await sendEmailCode(staff.email, "he", pool)).toEqual({ ok: false, reason: "Locked" });
    });
  });

  it("keeps a session by its hash only, and logs out", async () => {
    await withMigratedSchema(async (pool) => {
      const staff = await addStaff(pool);
      const session = await createSession(staff.id, "test", pool);
      const { rows } = await pool.query("select session_hash from staff_sessions");
      expect(JSON.stringify(rows)).not.toContain(session.raw);
      expect(await resolveSession(session.raw, pool)).toEqual({ id: staff.id, email: staff.email });
      expect(await resolveSession("x".repeat(43), pool)).toBeNull();
      await revokeSession(session.raw, pool);
      expect(await resolveSession(session.raw, pool)).toBeNull();
    });
  });

  it("refuses an expired session", async () => {
    await withMigratedSchema(async (pool) => {
      const staff = await addStaff(pool);
      const session = await createSession(staff.id, null, pool);
      await pool.query("update staff_sessions set expires_at = now() - interval '1 minute'");
      expect(await resolveSession(session.raw, pool)).toBeNull();
    });
  });
});

describe.skipIf(!hasDb)("owner booking actions", () => {
  async function booked(pool: pg.Pool, n: number, time: string) {
    const hold = await requestHold(
      {
        start: localDateTimeToUtc(openDay(), time),
        lines: [testDog],
        name: `לקוח ${n}`,
        phone: `+97255502${String(n).padStart(4, "0")}`,
        idempotencyKey: randomUUID(),
        address: `10.2.0.${n}`,
      },
      { db: pool },
    );
    if (!hold.ok) throw new Error(hold.reason);
    const confirmed = await confirmBooking(hold.hold.appointmentId, { db: pool });
    if (!confirmed.ok) throw new Error(confirmed.reason);
    return hold.hold.appointmentId;
  }

  it("moves, refuses an overlap, extends, and cancels with a notice", async () => {
    await withMigratedSchema(async (pool) => {
      const staff = await addStaff(pool);
      const first = await booked(pool, 1, "09:00");
      await booked(pool, 2, "12:00");

      expect(await ownerMove(first, localDateTimeToUtc(openDay(), "12:30"), staff.id, pool)).toEqual({
        ok: false,
        reason: "SlotTaken",
      });
      // Outside opening hours (opens at 09:00 on open days) and onto time off are refused too.
      expect(await ownerMove(first, localDateTimeToUtc(openDay(), "07:00"), staff.id, pool)).toEqual({
        ok: false,
        reason: "OutsideHours",
      });
      await pool.query("insert into time_off (starts_at, ends_at, reason) values ($1, $2, 'test')", [
        localDateTimeToUtc(openDay(), "14:00"),
        localDateTimeToUtc(openDay(), "15:00"),
      ]);
      expect(await ownerMove(first, localDateTimeToUtc(openDay(), "13:45"), staff.id, pool)).toEqual({
        ok: false,
        reason: "TimeOff",
      });
      expect((await ownerMove(first, localDateTimeToUtc(openDay(), "10:00"), staff.id, pool)).ok).toBe(true);
      expect((await ownerExtend(first, 15, staff.id, pool)).ok).toBe(true);
      expect((await ownerCancel(first, true, staff.id, pool)).ok).toBe(true);

      const { rows } = await pool.query(
        "select kind, data from message_outbox where appointment_id = $1 and kind = 'owner_change' order by id",
        [first],
      );
      expect(rows.map((row) => row.data.change)).toEqual(["moved", "cancelled"]);
      const audit = await pool.query("select action from audit_log where entity = 'appointments' and staff_id = $1", [
        staff.id,
      ]);
      expect(audit.rows.map((row) => row.action)).toEqual(expect.arrayContaining(["move", "extend", "cancel"]));
    });
  });
});
