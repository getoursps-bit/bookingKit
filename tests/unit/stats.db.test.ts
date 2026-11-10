import type pg from "pg";
import { describe, expect, it } from "vitest";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { bucketByWeek, getStats, periodBounds, weekStartOf } from "@/core/stats";
import { localDateTimeToUtc } from "@/core/platform/time";

// Needs the compose Postgres locally or the CI service; skipped otherwise.
const hasDb = await testDbAvailable();

// A fixed "now": Tuesday 27 October 2026, 14:00 in Israel.
const NOW = localDateTimeToUtc("2026-10-27", "14:00");
const at = (date: string, time = "10:00") => localDateTimeToUtc(date, time);

describe("stats periods and weeks", () => {
  it("covers whole Israel days ending today", () => {
    const period = periodBounds(7, NOW);
    expect(period.from).toBe("2026-10-21");
    expect(period.to).toBe("2026-10-27");
    expect(period.start).toEqual(at("2026-10-21", "00:00"));
    expect(period.end).toEqual(at("2026-10-28", "00:00"));
  });

  it("starts weeks on Sunday and keeps empty weeks", () => {
    expect(weekStartOf("2026-10-27")).toBe("2026-10-25");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-25");
    const weeks = bucketByWeek(["2026-10-25", "2026-10-27", "2026-10-13", "2025-01-01"], "2026-10-27", 3);
    expect(weeks).toEqual([
      { weekStart: "2026-10-11", count: 1 },
      { weekStart: "2026-10-18", count: 0 },
      { weekStart: "2026-10-25", count: 2 },
    ]);
  });
});

async function addBooking(
  pool: pg.Pool,
  b: { created: Date; start: Date; status: string; by: string; source?: object; serviceKey?: string },
) {
  const { rows } = await pool.query<{ id: number }>(
    `insert into customers (display_name, source) values ('בדיקה', 'online') returning id::int`,
  );
  const { rows: appt } = await pool.query<{ id: number }>(
    `insert into appointments (customer_id, starts_at, ends_at, status, created_by, source, created_at)
     values ($1, $2, $2::timestamptz + interval '1 hour', $3, $4, $5, $6) returning id::int`,
    [rows[0]!.id, b.start, b.status, b.by, JSON.stringify(b.source ?? {}), b.created],
  );
  await pool.query(
    `insert into appointment_lines (appointment_id, position, service_id, duration_min, price_from_agorot)
     select $1, 1, id, 60, 10000 from services order by sort_order, id limit 1`,
    [appt[0]!.id],
  );
}

describe.skipIf(!hasDb)("getStats", () => {
  it("counts bookings, sources, visits, clicks and messages inside the period only", async () => {
    await withMigratedSchema(async (pool) => {
      // In the last 7 days: two online (one from Instagram, one direct, the direct one later cancelled), one by the owner.
      await addBooking(pool, {
        created: at("2026-10-26"),
        start: at("2026-10-26", "12:00"),
        status: "completed",
        by: "customer",
        source: { utm_source: "Instagram" },
      });
      await addBooking(pool, {
        created: at("2026-10-22"),
        start: at("2026-11-02"),
        status: "cancelled",
        by: "customer",
      });
      await addBooking(pool, {
        created: at("2026-10-27", "09:00"),
        start: at("2026-10-27", "11:00"),
        status: "no_show",
        by: "owner",
      });
      // Outside the period, or not a booking at all.
      await addBooking(pool, {
        created: at("2026-10-01"),
        start: at("2026-10-02"),
        status: "completed",
        by: "customer",
      });
      await addBooking(pool, {
        created: at("2026-10-26"),
        start: at("2026-11-05"),
        status: "released",
        by: "customer",
      });

      await pool.query(
        `insert into site_counters (day, key, count) values ('2026-10-24', 'book', 6), ('2026-10-01', 'book', 50), ('2026-10-25', 'order_whatsapp', 2)`,
      );
      await pool.query(
        `insert into message_outbox (kind, template_key, status, channel, cost_agorot, created_at) values
         ('confirmation', 'confirmation', 'delivered', 'messaging', 30, $1),
         ('code', 'code', 'sent', 'email', 0, $1),
         ('reminder', 'reminder', 'failed', null, 0, $1),
         ('reminder', 'reminder', 'sent', 'messaging', 30, $2)`,
        [at("2026-10-25"), at("2026-09-01")],
      );

      const stats = await getStats(7, { locale: "he", now: NOW }, pool);
      expect(stats.bookings).toEqual({ total: 3, online: 2, owner: 1, imported: 0, cancelled: 1 });
      expect(stats.visits).toEqual({ completed: 1, noShow: 1 });
      expect(stats.clicks).toEqual({ book: 6, orderWhatsapp: 2 });
      expect(stats.messages).toEqual({ whatsapp: 1, email: 1, push: 0, failed: 1, costAgorot: 30 });
      expect(stats.sources).toEqual([
        { source: "", count: 1 },
        { source: "instagram", count: 1 },
      ]);
      expect(stats.services).toHaveLength(1);
      expect(stats.services[0]!.count).toBe(2);
      // Week of 25 Oct holds the two bookings made on the 26th and 27th; the 22nd falls in the week before.
      expect(stats.weekly.at(-1)).toEqual({ weekStart: "2026-10-25", count: 2 });
      expect(stats.weekly.at(-2)).toEqual({ weekStart: "2026-10-18", count: 1 });
      expect(stats.weekly).toHaveLength(12);
    });
  });
});
