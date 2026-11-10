import { randomUUID } from "node:crypto";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { openDay } from "../setup/days";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { bookingView, resendCode, setMessageConsent, startBooking, verifyAndConfirm } from "@/core/booking/flow";
import { cancelBooking, requestHold } from "@/core/booking/service";
import { checkCode, issueCode } from "@/core/platform/identity/codes";
import { secretHash } from "@/core/platform/identity/hash";
import { issueTrustedDevice, resolveManageToken, resolveTrustedDevice, revoke } from "@/core/booking/manageTokens";
import { customerRecipient } from "@/core/platform/notify/recipients";
import { maskEmail, maskPhone } from "@/core/booking/customers";
import { localDateTimeToUtc } from "@/core/platform/time";
import { testDog } from "../setup/pets";
import { LOCALES } from "@/i18n/locales";

const hasDb = await testDbAvailable();

// Fictional 0555 test numbers only.
const phone = (n: number) => `+97255501${String(n).padStart(4, "0")}`;

function holdInput(n: number, time = "10:00", over: Record<string, unknown> = {}) {
  return {
    start: localDateTimeToUtc(openDay(), time),
    lines: [testDog],
    name: `לקוח ${n}`,
    phone: phone(n),
    idempotencyKey: randomUUID(),
    address: `10.1.0.${n}`,
    ...over,
  };
}

/** The code the fake WhatsApp channel "sent" to a number. */
async function lastCode(pool: pg.Pool, to: string): Promise<string> {
  const { rows } = await pool.query<{ body: string }>(
    "select body from fake_messages where recipient = $1 and template_key = 'code' order by id desc limit 1",
    [to],
  );
  return /(\d{6})/.exec(rows[0]?.body ?? "")?.[1] ?? "";
}

describe.skipIf(!hasDb)("codes", () => {
  it("stores only a keyed hash, sends through the outbox, and is used up once right", async () => {
    await withMigratedSchema(async (pool) => {
      const hold = await requestHold(holdInput(1), { db: pool });
      if (!hold.ok) throw new Error(hold.reason);
      const sent = await issueCode({ ...hold.hold, address: "a1", appointmentId: hold.hold.appointmentId }, pool);
      expect(sent).toMatchObject({ ok: true, channel: "whatsapp" });

      const code = await lastCode(pool, phone(1));
      const { rows } = await pool.query("select code_hash, contact from verification_codes");
      expect(rows[0].code_hash).toBe(secretHash(`${hold.hold.appointmentId}:${code}`));
      expect(JSON.stringify(rows)).not.toContain(code);
      const outbox = await pool.query("select kind, channel, status, data from message_outbox where kind = 'code'");
      expect(outbox.rows).toEqual([{ kind: "code", channel: "whatsapp", status: "sent", data: {} }]);

      const wrong = code === "000000" ? "111111" : "000000";
      expect(await checkCode(hold.hold.appointmentId, wrong, pool)).toEqual({ ok: false, reason: "Wrong" });
      expect(await checkCode(hold.hold.appointmentId, code, pool)).toMatchObject({ ok: true, contact: phone(1) });
      expect(await checkCode(hold.hold.appointmentId, code, pool)).toEqual({ ok: false, reason: "Expired" });
    });
  });

  it("allows five attempts, then refuses even the right code", async () => {
    await withMigratedSchema(async (pool) => {
      const hold = await requestHold(holdInput(2), { db: pool });
      if (!hold.ok) throw new Error(hold.reason);
      await issueCode({ ...hold.hold, address: "a2" }, pool);
      const code = await lastCode(pool, phone(2));
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) await checkCode(hold.hold.appointmentId, wrong, pool);
      expect(await checkCode(hold.hold.appointmentId, code, pool)).toEqual({ ok: false, reason: "TooManyAttempts" });
    });
  });

  it("expires after ten minutes", async () => {
    await withMigratedSchema(async (pool) => {
      const hold = await requestHold(holdInput(3), { db: pool });
      if (!hold.ok) throw new Error(hold.reason);
      await issueCode({ ...hold.hold, address: "a3" }, pool);
      await pool.query("update verification_codes set expires_at = now() - interval '1 second'");
      expect(await checkCode(hold.hold.appointmentId, await lastCode(pool, phone(3)), pool)).toEqual({
        ok: false,
        reason: "Expired",
      });
    });
  });

  it("sends at most three codes per phone an hour", async () => {
    await withMigratedSchema(async (pool) => {
      const hold = await requestHold(holdInput(4), { db: pool });
      if (!hold.ok) throw new Error(hold.reason);
      const results = [];
      for (let i = 0; i < 4; i++) results.push(await issueCode({ ...hold.hold, address: `b${i}` }, pool));
      expect(results.map((result) => result.ok)).toEqual([true, true, true, false]);
      expect(results[3]).toEqual({ ok: false, reason: "RateLimited" });
    });
  });

  it("sends by email when asked, and refuses when no email is known", async () => {
    await withMigratedSchema(async (pool) => {
      const withEmail = await requestHold(holdInput(5, "10:00", { email: "five@example.com" }), { db: pool });
      const without = await requestHold(holdInput(6, "13:00"), { db: pool });
      if (!withEmail.ok || !without.ok) throw new Error("hold failed");
      expect(await issueCode({ ...withEmail.hold, address: "c1", prefer: "email" }, pool)).toMatchObject({
        ok: true,
        channel: "email",
      });
      expect(await issueCode({ ...without.hold, address: "c2", prefer: "email" }, pool)).toEqual({
        ok: false,
        reason: "NoChannel",
      });
    });
  });
  it("a code with nowhere to go does not use up the limits", async () => {
    await withMigratedSchema(async (pool) => {
      const hold = await requestHold(holdInput(7), { db: pool });
      if (!hold.ok) throw new Error(hold.reason);
      for (let i = 0; i < 4; i++) {
        expect(await issueCode({ ...hold.hold, address: "d1", prefer: "email" }, pool)).toEqual({
          ok: false,
          reason: "NoChannel",
        });
      }
      expect(await issueCode({ ...hold.hold, address: "d1" }, pool)).toMatchObject({ ok: true, channel: "whatsapp" });
    });
  });
});

describe.skipIf(!hasDb)("tokens", () => {
  it("private links expire at the visit's end, are revoked, and open only their booking", async () => {
    await withMigratedSchema(async (pool) => {
      const first = await startBooking(holdInput(10), undefined, { db: pool });
      if (!first.ok || !("held" in first)) throw new Error("expected a hold");
      const confirmed = await verifyAndConfirm(first.held.appointmentId, await lastCode(pool, phone(10)), "d1", {
        db: pool,
      });
      if (!confirmed.ok) throw new Error(confirmed.reason);
      const token = confirmed.confirmed.manageToken;
      expect((await resolveManageToken(token, pool))?.id).toBe(first.held.appointmentId);
      const { rows } = await pool.query(
        "select expires_at, ends_at from manage_tokens join appointments a on a.id = appointment_id",
      );
      expect(rows[0].expires_at).toEqual(rows[0].ends_at);
      expect(await resolveManageToken(`${token}x`, pool)).toBeNull();

      await revoke(first.held.appointmentId, pool);
      expect(await resolveManageToken(token, pool)).toBeNull();
    });
  });

  it("a cancelled booking's link stops working", async () => {
    await withMigratedSchema(async (pool) => {
      const started = await startBooking(holdInput(11), undefined, { db: pool });
      if (!started.ok || !("held" in started)) throw new Error("expected a hold");
      const done = await verifyAndConfirm(started.held.appointmentId, await lastCode(pool, phone(11)), "d2", {
        db: pool,
      });
      if (!done.ok) throw new Error(done.reason);
      expect((await cancelBooking(done.confirmed.manageToken, { db: pool })).ok).toBe(true);
      expect(await bookingView(done.confirmed.manageToken, { db: pool })).toBeNull();
    });
  });

  it("trusted devices last 90 days and then stop", async () => {
    await withMigratedSchema(async (pool) => {
      const { rows } = await pool.query(
        "insert into customers (display_name, phone_e164, source) values ('t', $1, 'online') returning id::int",
        [phone(12)],
      );
      const device = await issueTrustedDevice(rows[0].id, pool);
      const days = (device.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(89.9);
      expect(days).toBeLessThan(90.1);
      expect(await resolveTrustedDevice(device.raw, pool)).toBe(rows[0].id);
      await pool.query("update trusted_devices set expires_at = now() - interval '1 second'");
      expect(await resolveTrustedDevice(device.raw, pool)).toBeNull();
      expect(await resolveTrustedDevice(undefined, pool)).toBeNull();
    });
  });
});

describe.skipIf(!hasDb)("booking flow", () => {
  it("a trusted device of the same customer skips the code; another customer's device does not", async () => {
    await withMigratedSchema(async (pool) => {
      const first = await startBooking(holdInput(20, "10:00"), undefined, { db: pool });
      if (!first.ok || !("held" in first)) throw new Error("expected a hold");
      const done = await verifyAndConfirm(first.held.appointmentId, await lastCode(pool, phone(20)), "e1", {
        db: pool,
      });
      if (!done.ok) throw new Error(done.reason);

      const again = await startBooking(holdInput(20, "13:00"), done.device.raw, { db: pool });
      expect(again.ok && "confirmed" in again).toBe(true);

      const other = await startBooking(holdInput(21, "11:30"), done.device.raw, { db: pool });
      expect(other.ok && "held" in other).toBe(true);
    });
  });

  it("an email another record holds: unverified it moves at once, verified it moves when proven", async () => {
    await withMigratedSchema(async (pool) => {
      const owner = (value: string) =>
        pool
          .query<{ id: number; verified: boolean }>(
            "select customer_id::int as id, verified_at is not null as verified from customer_contacts where value = $1",
            [value],
          )
          .then((result) => result.rows[0]);

      // A test record that was never verified gives the address up to the next booking.
      const first = await requestHold(holdInput(30, "10:00", { email: "Shared@Example.com" }), { db: pool });
      const second = await requestHold(holdInput(31, "11:30", { email: "shared@example.com" }), { db: pool });
      if (!first.ok || !second.ok) throw new Error("hold failed");
      expect(await owner("shared@example.com")).toEqual({ id: second.hold.customerId, verified: false });

      // Once verified there, a new phone's booking gets its code at the typed address and takes it over when proven.
      await pool.query("update customer_contacts set verified_at = now() where value = 'shared@example.com'");
      const third = await startBooking(holdInput(32, "13:00", { email: "shared@example.com" }), undefined, { db: pool });
      if (!third.ok || !("held" in third)) throw new Error("expected a hold");
      expect(third.emailOnFile).toBeNull();
      expect(await owner("shared@example.com")).toEqual({ id: second.hold.customerId, verified: true });
      const sent = await resendCode(third.held.appointmentId, "email", "f1", pool, LOCALES[LOCALES.length - 1], "shared@example.com");
      expect(sent).toMatchObject({ ok: true, channel: "email", to: "shared@example.com" });
      const code = await lastCode(pool, "shared@example.com");
      const done = await verifyAndConfirm(third.held.appointmentId, code, "f1", { db: pool }, "shared@example.com");
      if (!done.ok) throw new Error(done.reason);
      const thirdCustomer = done.confirmed.appointment.customerId;
      expect(await owner("shared@example.com")).toEqual({ id: thirdCustomer, verified: true });
      expect((await customerRecipient(thirdCustomer, pool)).email).toBe("shared@example.com");
    });
  });

  describe("one email per phone", () => {
    const emailsOf = (pool: pg.Pool, customerId: number) =>
      pool
        .query<{ value: string; verified: boolean }>(
          "select value, verified_at is not null as verified from customer_contacts where customer_id = $1 and kind = 'email' order by id",
          [customerId],
        )
        .then((result) => result.rows);

    /** A customer with phone n whose email is verified, as after an earlier booking proven by email. */
    async function verifiedCustomer(pool: pg.Pool, n: number, email: string): Promise<number> {
      const hold = await requestHold(holdInput(n, "09:00", { email }), { db: pool });
      if (!hold.ok) throw new Error(hold.reason);
      await pool.query("update customer_contacts set verified_at = now() where value = $1", [email]);
      await pool.query("update appointments set status = 'released' where id = $1", [hold.hold.appointmentId]);
      return hold.hold.customerId;
    }

    it("a new email replaces one nobody verified, so the customer keeps one", async () => {
      await withMigratedSchema(async (pool) => {
        const a = await requestHold(holdInput(40, "10:00", { email: "old@example.com" }), { db: pool });
        const b = await requestHold(holdInput(40, "13:00", { email: "new@example.com" }), { db: pool });
        if (!a.ok || !b.ok) throw new Error("hold failed");
        expect(await emailsOf(pool, a.hold.customerId)).toEqual([{ value: "new@example.com", verified: false }]);
      });
    });

    it("with a verified email on file the code goes there, and the new one replaces it once proven", async () => {
      await withMigratedSchema(async (pool) => {
        const customerId = await verifiedCustomer(pool, 41, "old@example.com");
        const started = await startBooking(holdInput(41, "11:30", { email: "new@example.com" }), undefined, { db: pool });
        if (!started.ok || !("held" in started)) throw new Error("expected a hold");
        expect(started.emailOnFile).toBe("old@example.com");
        // Not stored yet: only the owner of the address on file may replace it.
        expect(await emailsOf(pool, customerId)).toEqual([{ value: "old@example.com", verified: true }]);

        const sent = await resendCode(started.held.appointmentId, "email", "g1", pool, "he", "new@example.com");
        expect(sent).toMatchObject({ ok: true, channel: "email", to: "old@example.com" });
        const code = await lastCode(pool, "old@example.com");
        const done = await verifyAndConfirm(started.held.appointmentId, code, "g1", { db: pool }, "new@example.com");
        if (!done.ok) throw new Error(done.reason);
        expect(await emailsOf(pool, customerId)).toEqual([{ value: "new@example.com", verified: true }]);
        expect((await customerRecipient(customerId, pool)).email).toBe("new@example.com");
      });
    });

    it("keeping the email on file leaves it, and the code can go to the phone instead", async () => {
      await withMigratedSchema(async (pool) => {
        const customerId = await verifiedCustomer(pool, 42, "old@example.com");
        const started = await startBooking(holdInput(42, "11:30", { email: "new@example.com" }), undefined, { db: pool });
        if (!started.ok || !("held" in started)) throw new Error("expected a hold");
        const sent = await resendCode(started.held.appointmentId, "whatsapp", "h1", pool, "he", "new@example.com");
        expect(sent).toMatchObject({ ok: true, channel: "whatsapp", to: phone(42) });
        const done = await verifyAndConfirm(started.held.appointmentId, await lastCode(pool, phone(42)), "h1", { db: pool }, null);
        if (!done.ok) throw new Error(done.reason);
        expect(await emailsOf(pool, customerId)).toEqual([{ value: "old@example.com", verified: true }]);
      });
    });

    it("a trusted device replaces the email at once, and the booking page names where messages go", async () => {
      await withMigratedSchema(async (pool) => {
        const customerId = await verifiedCustomer(pool, 43, "old@example.com");
        const device = await issueTrustedDevice(customerId, pool);
        const started = await startBooking(holdInput(43, "11:30", { email: "new@example.com" }), device.raw, { db: pool });
        if (!started.ok || !("confirmed" in started)) throw new Error("expected a confirmed booking");
        expect(await emailsOf(pool, customerId)).toEqual([{ value: "new@example.com", verified: true }]);
        const view = await bookingView(started.confirmed.manageToken, { db: pool });
        // Fake mode has WhatsApp on, so booking messages go there first.
        expect(view?.messagesTo).toEqual({ channel: "whatsapp", to: "***0043" });
      });
    });
  });

  it("masks addresses so their owner can recognise them", () => {
    expect(maskEmail("kalil@proton.me")).toBe("k***@proton.me");
    expect(maskPhone("+972555010043")).toBe("***0043");
  });

  it("confirmation records consent, and the private link can turn messages off and on", async () => {
    await withMigratedSchema(async (pool) => {
      const started = await startBooking(holdInput(22), undefined, { db: pool });
      if (!started.ok || !("held" in started)) throw new Error("expected a hold");
      const done = await verifyAndConfirm(started.held.appointmentId, await lastCode(pool, phone(22)), "e2", {
        db: pool,
      });
      if (!done.ok) throw new Error(done.reason);
      const token = done.confirmed.manageToken;
      const customerId = done.confirmed.appointment.customerId;

      expect((await customerRecipient(customerId, pool)).optedOut).toBe(false);
      expect(await setMessageConsent({ token, on: false }, pool)).toBe(true);
      expect((await customerRecipient(customerId, pool)).optedOut).toBe(true);
      expect((await bookingView(token, { db: pool }))?.messagesOn).toBe(false);
      await setMessageConsent({ token, on: true }, pool);
      expect((await customerRecipient(customerId, pool)).optedOut).toBe(false);
      expect((await bookingView(token, { db: pool }))?.messagesOn).toBe(true);
    });
  });

  it("the view allows changes only before the cutoff", async () => {
    await withMigratedSchema(async (pool) => {
      const started = await startBooking(holdInput(23), undefined, { db: pool });
      if (!started.ok || !("held" in started)) throw new Error("expected a hold");
      const done = await verifyAndConfirm(started.held.appointmentId, await lastCode(pool, phone(23)), "e3", {
        db: pool,
      });
      if (!done.ok) throw new Error(done.reason);
      const start = done.confirmed.appointment.start;
      const token = done.confirmed.manageToken;
      expect((await bookingView(token, { db: pool, now: new Date(start.getTime() - 13 * 3_600_000) }))?.canChange).toBe(
        true,
      );
      expect((await bookingView(token, { db: pool, now: new Date(start.getTime() - 11 * 3_600_000) }))?.canChange).toBe(
        false,
      );
    });
  });
});
