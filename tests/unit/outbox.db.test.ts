import { randomUUID } from "node:crypto";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { checkReceipts, queueDailyCheck } from "../../src/core/platform/ownerAlerts";
import { claimDaily } from "../../src/core/platform/jobRuns";
import { openDay } from "../setup/days";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { startBooking, verifyAndConfirm } from "@/core/booking/flow";
import { cancelBooking } from "@/core/booking/service";
import { dispatch } from "@/core/platform/notify/dispatch";
import { handleWebhook } from "@/core/platform/notify/webhook";
import { claimDue, enqueue } from "@/core/platform/outbox";
import { localDateTimeToUtc } from "@/core/platform/time";
import { testDog } from "../setup/pets";

const hasDb = await testDbAvailable();

// Fictional 0555 test numbers only.
const phone = (n: number) => `+97255502${String(n).padStart(4, "0")}`;

/** A confirmed booking made through the real flow; returns its id and private link. */
async function book(pool: pg.Pool, n: number, opts: { email?: string; time?: string } = {}) {
  const started = await startBooking(
    {
      start: localDateTimeToUtc(openDay(), opts.time ?? "10:00"),
      lines: [testDog],
      name: `לקוח ${n}`,
      phone: phone(n),
      email: opts.email ?? null,
      idempotencyKey: randomUUID(),
      address: `10.2.0.${n}`,
    },
    undefined,
    { db: pool },
  );
  if (!started.ok || !("held" in started)) throw new Error("expected a hold");
  const { rows } = await pool.query<{ body: string }>(
    "select body from fake_messages where recipient = $1 and template_key = 'code' order by id desc limit 1",
    [phone(n)],
  );
  const code = /(\d{6})/.exec(rows[0]!.body)![1]!;
  const done = await verifyAndConfirm(started.held.appointmentId, code, `10.2.0.${n}`, { db: pool });
  if (!done.ok) throw new Error(done.reason);
  return { id: started.held.appointmentId, token: done.confirmed.manageToken };
}

async function sendAllDue(pool: pg.Pool, now?: Date) {
  for (const row of await claimDue(50, now, pool)) await dispatch(row, pool, now ?? new Date());
}

async function outbox(pool: pg.Pool, kind: string) {
  const { rows } = await pool.query(
    "select id::int, status, channel, tried_channels, provider_ref, data from message_outbox where kind = $1 order by id",
    [kind],
  );
  return rows;
}

describe.skipIf(!hasDb)("outbox", () => {
  it("two workers never take the same row", async () => {
    await withMigratedSchema(async (pool) => {
      await enqueue(
        Array.from({ length: 30 }, (_, i) => ({
          kind: "owner_alert" as const,
          templateKey: "owner_alert",
          dedupeKey: `t${i}`,
        })),
        pool,
      );
      const [a, b] = await Promise.all([claimDue(20, undefined, pool), claimDue(20, undefined, pool)]);
      const ids = [...a, ...b].map((row) => row.id);
      expect(ids).toHaveLength(30);
      expect(new Set(ids).size).toBe(30);
    });
  });

  it("sends the confirmation with a fresh private link that the outbox never stores", async () => {
    await withMigratedSchema(async (pool) => {
      const booking = await book(pool, 1);
      await sendAllDue(pool);
      const [row] = await outbox(pool, "confirmation");
      expect(row).toMatchObject({ status: "sent", channel: "whatsapp" });
      const { rows } = await pool.query<{ body: string }>(
        "select body from fake_messages where recipient = $1 and template_key = 'confirmation'",
        [phone(1)],
      );
      const link = /\/b\/([\w-]+)/.exec(rows[0]!.body)![1]!;
      expect(link).not.toBe(booking.token);
      const all = await pool.query("select data, error from message_outbox");
      expect(JSON.stringify(all.rows)).not.toContain(link);
    });
  });

  it("a failed WhatsApp callback queues email once, and a repeat changes nothing", async () => {
    await withMigratedSchema(async (pool) => {
      await book(pool, 2, { email: "two@example.com" });
      await sendAllDue(pool);
      const [sent] = await outbox(pool, "confirmation");
      const failed = {
        entry: [
          {
            changes: [
              { value: { statuses: [{ id: sent.provider_ref, status: "failed", errors: [{ code: 131026 }] }] } },
            ],
          },
        ],
      };
      expect(await handleWebhook(failed, pool)).toMatchObject({ statuses: 1 });
      await sendAllDue(pool);
      const [after] = await outbox(pool, "confirmation");
      expect(after).toMatchObject({ status: "sent", channel: "email", tried_channels: ["whatsapp", "email"] });

      expect(await handleWebhook(failed, pool)).toMatchObject({ statuses: 0 });
      await sendAllDue(pool);
      const emails = await pool.query(
        "select 1 from fake_messages where recipient = 'two@example.com' and template_key = 'confirmation'",
      );
      expect(emails.rowCount).toBe(1);
    });
  });

  it("a delivery status only moves forward", async () => {
    await withMigratedSchema(async (pool) => {
      await book(pool, 3);
      await sendAllDue(pool);
      const [sent] = await outbox(pool, "confirmation");
      const status = (value: string) => ({
        entry: [{ changes: [{ value: { statuses: [{ id: sent.provider_ref, status: value }] } }] }],
      });
      await handleWebhook(status("read"), pool);
      await handleWebhook(status("delivered"), pool);
      expect((await outbox(pool, "confirmation"))[0].status).toBe("read");
    });
  });

  it("a cancelled booking's reminder is skipped", async () => {
    await withMigratedSchema(async (pool) => {
      const booking = await book(pool, 4);
      expect((await cancelBooking(booking.token, { db: pool })).ok).toBe(true);
      const [reminder] = await outbox(pool, "reminder");
      expect(reminder.status).toBe("skipped");
      // Even if one were still queued, the worker would not send it.
      await pool.query("update message_outbox set status = 'queued', send_at = now() where kind = 'reminder'");
      await sendAllDue(pool);
      expect((await outbox(pool, "reminder"))[0].status).toBe("skipped");
    });
  });

  it("a booking message with no way to reach the customer lands in the owner's failed list", async () => {
    await withMigratedSchema(async (pool) => {
      await book(pool, 5);
      await pool.query(
        `insert into settings (key, value) values ('messaging.whatsappOutage', 'true') on conflict (key) do update set value = 'true'`,
      );
      await sendAllDue(pool);
      expect((await outbox(pool, "confirmation"))[0].status).toBe("failed");
      const events = await pool.query("select 1 from owner_events where type = 'message_failed'");
      expect(events.rowCount).toBe(1);
    });
  });
});

describe.skipIf(!hasDb)("whatsapp replies", () => {
  it("stores a reply once, answers once a day, and an opt-out word withdraws consent", async () => {
    await withMigratedSchema(async (pool) => {
      await book(pool, 6);
      const from = phone(6).slice(1);
      const message = (id: string, body: string) => ({
        entry: [{ changes: [{ value: { messages: [{ id, from, type: "text", text: { body } }] } }] }],
      });
      expect(await handleWebhook(message("m1", "שלום"), pool)).toMatchObject({ messages: 1 });
      expect(await handleWebhook(message("m1", "שלום"), pool)).toMatchObject({ messages: 0 });
      expect(await handleWebhook(message("m2", "הסר"), pool)).toMatchObject({ messages: 1 });

      expect((await pool.query("select 1 from inbound_messages")).rowCount).toBe(2);
      expect((await pool.query("select 1 from owner_events where type = 'reply_received'")).rowCount).toBe(2);
      expect((await outbox(pool, "auto_reply")).length).toBe(1);
      await sendAllDue(pool);
      expect((await outbox(pool, "auto_reply"))[0]).toMatchObject({ status: "sent", channel: "whatsapp" });
      const consent = await pool.query("select 1 from consents where revoked_at is not null");
      expect(consent.rowCount).toBe(1);
    });
  });
});

describe.skipIf(!hasDb)("owner alerts", () => {
  it("are skipped without owner devices and pushed to each device with them", async () => {
    await withMigratedSchema(async (pool) => {
      await book(pool, 7);
      await sendAllDue(pool);
      expect((await outbox(pool, "owner_alert"))[0].status).toBe("skipped");

      const { rows } = await pool.query(
        "insert into staff (email, password_hash) values ('owner@example.com', 'x') returning id::int",
      );
      for (const n of [1, 2]) {
        await pool.query(
          "insert into push_subscriptions (staff_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')",
          [rows[0].id, `https://push.example.com/${n}`],
        );
      }
      await book(pool, 8, { time: "13:00" });
      await sendAllDue(pool);
      expect((await outbox(pool, "owner_alert"))[1].status).toBe("sent");
      const pushes = await pool.query<{ body: string }>("select body from fake_messages where channel = 'push'");
      expect(pushes.rowCount).toBe(2);
      // The payload holds the type, the time and a path only.
      expect(Object.keys(JSON.parse(pushes.rows[0]!.body)).sort()).toEqual(["path", "time", "type"]);
    });
  });

  it("emails the owner when no device answered the daily check", async () => {
    await withMigratedSchema(async (pool) => {
      const { rows } = await pool.query(
        "insert into staff (email, password_hash) values ('owner@example.com', 'x') returning id::int",
      );
      await pool.query(
        "insert into push_subscriptions (staff_id, endpoint, p256dh, auth, last_receipt_at) values ($1, 'https://push.example.com/x', 'k', 'a', now() - interval '7 hours')",
        [rows[0].id],
      );
      const now = new Date();
      await queueDailyCheck(now, pool);
      await queueDailyCheck(now, pool);
      expect(await checkReceipts(now, pool)).toBe(true);
      await sendAllDue(pool);
      const checks = await outbox(pool, "owner_check");
      expect(checks.map((row) => row.channel)).toEqual(["push", "email"]);
      const mail = await pool.query("select 1 from fake_messages where recipient = 'owner@example.com'");
      expect(mail.rowCount).toBe(1);

      await pool.query("update push_subscriptions set last_receipt_at = now()");
      expect(await checkReceipts(now, pool)).toBe(false);
    });
  });

  it("daily jobs run once per local day, and not before their hour", async () => {
    await withMigratedSchema(async (pool) => {
      const morning = localDateTimeToUtc(openDay(1), "07:59");
      const later = localDateTimeToUtc(openDay(1), "08:30");
      expect(await claimDaily("owner_check", 8, morning, pool)).toBe(false);
      expect(await claimDaily("owner_check", 8, later, pool)).toBe(true);
      expect(await claimDaily("owner_check", 8, later, pool)).toBe(false);
    });
  });
});
