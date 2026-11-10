import { describe, expect, it } from "vitest";
import { openDay } from "../setup/days";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { addLocalDays } from "@/core/booking/slots";
import mapping from "@ext/dibs-import/service-map.json" with { type: "json" };
import { hasExtension } from "@/extension/registry";
import {
  applyImport,
  type DibsMapping,
  exportFutureCsv,
  parseCsv,
  parseDibsTime,
  queueImportLinks,
  stageImport,
} from "@ext/dibs-import/server/dibs";
import { localDateOf, localDateTimeToUtc } from "@/core/platform/time";

const hasDb = await testDbAvailable();
const map = mapping as DibsMapping;
const dibsDate = (iso: string) => iso.split("-").reverse().join("/");

// Fictional numbers in the 0555 test range only.
function exportCsv(): string {
  const day = dibsDate(openDay(5));
  const later = dibsDate(openDay(8));
  const past = dibsDate(addLocalDays(localDateOf(new Date()), -20));
  return [
    "מזהה,שם לקוח,טלפון,תאריך,שעה,משך,שירות,הערות",
    `D1,דנה,055-5040001,${day},09:00,,כלב קטן,"נובח, אבל חמוד"`,
    `D2,דנה כהן,+972 55 504 0001,${later},10:00,,ציפורניים,`,
    `D3,יוסי,0555040002,${day},09:30,,כלב גדול,`,
    `D4,רונית,12345,${day},12:00,,חתול,`,
    `D5,עמית,055-5040003,31/02/2027,10:00,,חתול,`,
    `D6,מיכל,055-5040004,${day},14:00,,שירות ישן,`,
    `D7,אבי,055-5040005,${past},10:00,,חתול,`,
    `,בלי מזהה,055-5040006,${day},15:00,,חתול,`,
    `D1,כפול,055-5040007,${later},15:00,,חתול,`,
  ].join("\r\n");
}

describe("CSV and dates", () => {
  it("reads quotes, a byte-order mark and semicolons", () => {
    expect(parseCsv('﻿a;b\r\n"x; ""y""";2\n')).toEqual([
      ["a", "b"],
      ['x; "y"', "2"],
    ]);
  });

  it("reads Dibs dates in Israel time and refuses impossible ones", () => {
    expect(parseDibsTime("05/01/2027", "09:30", "dd/MM/yyyy")).toEqual(localDateTimeToUtc("2027-01-05", "09:30"));
    expect(parseDibsTime("05/01/2027 9:30", undefined, "dd/MM/yyyy")).toEqual(localDateTimeToUtc("2027-01-05", "09:30"));
    expect(parseDibsTime("2027-07-05", "16:00", "yyyy-MM-dd")).toEqual(localDateTimeToUtc("2027-07-05", "16:00"));
    expect(parseDibsTime("31/02/2027", "10:00", "dd/MM/yyyy")).toBeNull();
    expect(parseDibsTime("05/01/2027", "", "dd/MM/yyyy")).toBeNull();
  });
});

describe.skipIf(!hasDb || !hasExtension("dibs-import"))("Dibs import", () => {
  it("a dry run checks and reports without importing", async () => {
    await withMigratedSchema(async (pool) => {
      const { report } = await stageImport({ text: exportCsv(), fileName: "dibs.csv", mapping: map, dryRun: true, freezeTime: new Date() }, pool);
      expect(report).toMatchObject({
        rows: 9,
        customers: 7,
        mergedDuplicates: 1,
        past: 1,
        missingRefs: [9],
        duplicateRefs: ["D1"],
        unmappedServices: { "שירות ישן": 1 },
      });
      expect(report.badPhones.map((entry) => entry.row)).toEqual([5]);
      expect(report.badTimes.map((entry) => entry.row)).toEqual([6]);
      // D3 at 09:30 overlaps D1 (09:00 + 80 minutes).
      expect(report.clashes.map((entry) => entry.ref)).toEqual(["D3"]);
      expect((await pool.query("select 1 from appointments")).rowCount).toBe(0);
      expect((await pool.query("select 1 from customers")).rowCount).toBe(0);
    });
  });

  it("imports once, merges by phone, maps services, and sends nothing", async () => {
    await withMigratedSchema(async (pool) => {
      const run = async () => {
        const { runId } = await stageImport({ text: exportCsv(), fileName: "dibs.csv", mapping: map, dryRun: false, freezeTime: new Date() }, pool);
        return applyImport(runId, pool);
      };
      const first = await run();
      expect(first.imported).toEqual({ future: 2, past: 1, alreadyThere: 0, refusedByOverlap: 0 });
      expect(first.futureInNewSystem).toBe(2);

      const customers = await pool.query("select display_name, phone_e164, source from customers order by id");
      expect(customers.rows).toEqual([
        { display_name: "אבי", phone_e164: "+972555040005", source: "import" },
        { display_name: "דנה", phone_e164: "+972555040001", source: "import" },
      ]);
      const booked = await pool.query(
        `select a.dibs_ref, a.status, a.created_by, a.notes, s.name_he as service, a.ends_at - a.starts_at as length
         from appointments a join appointment_lines ap on ap.appointment_id = a.id join services s on s.id = ap.service_id
         order by a.dibs_ref`,
      );
      expect(booked.rows.map((row) => [row.dibs_ref, row.status, row.created_by, row.service])).toEqual([
        ["D1", "confirmed", "import", "כלב - גזע קטן עד 10 קילו"],
        ["D2", "confirmed", "import", "גזיזת ציפורניים"],
        ["D7", "completed", "import", "חתול"],
      ]);
      expect(booked.rows[0].notes).toBe("נובח, אבל חמוד");

      const second = await run();
      expect(second.imported).toEqual({ future: 0, past: 0, alreadyThere: 3, refusedByOverlap: 0 });
      expect((await pool.query("select 1 from appointments")).rowCount).toBe(3);
      expect((await pool.query("select 1 from customers")).rowCount).toBe(2);

      expect((await pool.query("select 1 from message_outbox")).rowCount).toBe(0);
      expect((await pool.query("select 1 from owner_events")).rowCount).toBe(0);
    });
  });

  it("queues one new-link message per future booking, in batches, once", async () => {
    await withMigratedSchema(async (pool) => {
      const { runId } = await stageImport({ text: exportCsv(), fileName: "dibs.csv", mapping: map, dryRun: false, freezeTime: new Date() }, pool);
      await applyImport(runId, pool);
      const now = new Date();
      expect(await queueImportLinks({ now, batchSize: 1, gapMin: 10 }, pool)).toBe(2);
      expect(await queueImportLinks({ now }, pool)).toBe(0);
      const rows = await pool.query("select kind, send_at from message_outbox order by send_at");
      expect(rows.rows.map((row) => row.kind)).toEqual(["import_link", "import_link"]);
      expect(rows.rows[1].send_at.getTime() - rows.rows[0].send_at.getTime()).toBe(10 * 60_000);
    });
  });

  it("exports future bookings to CSV for a way back to Dibs", async () => {
    await withMigratedSchema(async (pool) => {
      const { runId } = await stageImport({ text: exportCsv(), fileName: "dibs.csv", mapping: map, dryRun: false, freezeTime: new Date() }, pool);
      await applyImport(runId, pool);
      const csv = await exportFutureCsv(new Date(), pool);
      const rows = parseCsv(csv);
      expect(rows[0]).toEqual(["date", "start", "end", "name", "phone", "services", "notes", "dibs_ref"]);
      expect(rows.slice(1).map((row) => [row[1], row[4], row[7]])).toEqual([
        ["09:00", "0555040001", "D1"],
        ["10:00", "0555040001", "D2"],
      ]);
      expect(rows[1]?.[6]).toBe("נובח, אבל חמוד");
    });
  });
});
