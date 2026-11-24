import type pg from "pg";
import { describe, expect, it } from "vitest";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { CUSTOMERS_PER_PAGE, listCustomers } from "@/core/booking/owner-data";
import { localDateTimeToUtc } from "@/core/platform/time";

// The owner's customers list (requirement R1): every customer without a
// search, a page at a time, sorted, and narrowed by a search.

const hasDb = await testDbAvailable();

// A fixed "now": Tuesday 27 October 2026, 14:00 in Israel.
const NOW = localDateTimeToUtc("2026-10-27", "14:00");
const at = (date: string, time = "10:00") => localDateTimeToUtc(date, time);

async function addCustomer(pool: pg.Pool, name: string, phone: string | null = null): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `insert into customers (display_name, phone_e164, source) values ($1, $2, 'online') returning id::int`,
    [name, phone],
  );
  return rows[0]!.id;
}

async function addBooking(pool: pg.Pool, customerId: number, start: Date, status: string): Promise<void> {
  // Each booking at its own minute, so the no-overlap rule never meets them.
  await pool.query(
    `insert into appointments (customer_id, starts_at, ends_at, status, created_by, hold_expires_at)
     values ($1, $2, $2::timestamptz + interval '1 minute', $3, 'owner',
             case when $3 = 'held' then $2::timestamptz else null end)`,
    [customerId, start, status],
  );
}

describe.skipIf(!hasDb)("listCustomers", () => {
  it("lists every customer without a search, newest visit first, and leaves out erased ones", async () => {
    await withMigratedSchema(async (pool) => {
      const old = await addCustomer(pool, "e2e Old Visit", "+972555090001");
      const recent = await addCustomer(pool, "e2e Recent Visit", "+972555090002");
      const fresh = await addCustomer(pool, "e2e Never Visited", "+972555090003");
      const erased = await addCustomer(pool, "e2e Erased", null);
      await pool.query("update customers set erased_at = now() where id = $1", [erased]);

      await addBooking(pool, old, at("2026-09-01"), "completed");
      await addBooking(pool, recent, at("2026-10-20"), "completed");
      await addBooking(pool, recent, at("2026-11-03", "09:00"), "confirmed");
      // Not visits: a no-show, a cancelled booking, an open hold, a released hold.
      await addBooking(pool, fresh, at("2026-10-25", "11:00"), "no_show");
      await addBooking(pool, fresh, at("2026-10-26", "11:00"), "cancelled");
      await addBooking(pool, fresh, at("2026-10-28", "12:00"), "held");
      await addBooking(pool, fresh, at("2026-10-29", "12:00"), "released");

      const list = await listCustomers({ now: NOW }, pool);
      const mine = list.rows.filter((row) => row.name.startsWith("e2e "));
      expect(mine.map((row) => row.id)).toEqual([recent, old, fresh]);
      expect(list.rows.some((row) => row.id === erased)).toBe(false);

      const byId = new Map(mine.map((row) => [row.id, row]));
      expect(byId.get(recent)).toMatchObject({ bookings: 2, lastVisit: at("2026-10-20"), nextBooking: at("2026-11-03", "09:00") });
      expect(byId.get(old)).toMatchObject({ bookings: 1, lastVisit: at("2026-09-01"), nextBooking: null });
      // The no-show and the cancelled booking count as bookings; holds do not.
      expect(byId.get(fresh)).toMatchObject({ bookings: 2, lastVisit: null, nextBooking: null });
    });
  });

  it("sorts by name and by number of bookings", async () => {
    await withMigratedSchema(async (pool) => {
      const b = await addCustomer(pool, "e2e B");
      const a = await addCustomer(pool, "e2e A");
      await addBooking(pool, b, at("2026-10-01"), "completed");
      await addBooking(pool, b, at("2026-10-02"), "completed");

      const ours = (rows: { id: number }[]) => rows.map((row) => row.id).filter((id) => id === a || id === b);
      expect(ours((await listCustomers({ sort: "name", now: NOW }, pool)).rows)).toEqual([a, b]);
      expect(ours((await listCustomers({ sort: "bookings", now: NOW }, pool)).rows)).toEqual([b, a]);
    });
  });

  it("narrows the list by part of a name or at least three digits of a phone", async () => {
    await withMigratedSchema(async (pool) => {
      const dana = await addCustomer(pool, "e2e Dana Levi", "+972555091234");
      await addCustomer(pool, "e2e Other", "+972555099999");

      expect((await listCustomers({ q: "dana", now: NOW }, pool)).rows.map((row) => row.id)).toEqual([dana]);
      expect((await listCustomers({ q: "055-509-1234", now: NOW }, pool)).rows.map((row) => row.id)).toEqual([dana]);
      // Two digits are too few to search phones by.
      expect((await listCustomers({ q: "12", now: NOW }, pool)).total).toBe(0);
      expect((await listCustomers({ q: "nobody by this name", now: NOW }, pool)).rows).toEqual([]);
    });
  });

  it("pages through the list and keeps the page inside it", async () => {
    await withMigratedSchema(async (pool) => {
      const before = (await listCustomers({ now: NOW }, pool)).total;
      await pool.query(
        `insert into customers (display_name, source)
         select 'e2e page ' || n, 'online' from generate_series(1, $1::int) n`,
        [CUSTOMERS_PER_PAGE + 5],
      );
      const total = before + CUSTOMERS_PER_PAGE + 5;
      const pages = Math.ceil(total / CUSTOMERS_PER_PAGE);

      const first = await listCustomers({ now: NOW }, pool);
      expect(first).toMatchObject({ total, page: 1, pages });
      expect(first.rows).toHaveLength(CUSTOMERS_PER_PAGE);

      const last = await listCustomers({ page: pages, now: NOW }, pool);
      expect(last.rows).toHaveLength(total - CUSTOMERS_PER_PAGE * (pages - 1));
      const seen = new Set([...first.rows, ...last.rows].map((row) => row.id));
      expect(seen.size).toBe(first.rows.length + last.rows.length);

      expect((await listCustomers({ page: 999, now: NOW }, pool)).page).toBe(pages);
      expect((await listCustomers({ page: -3, now: NOW }, pool)).page).toBe(1);
    });
  });
});
