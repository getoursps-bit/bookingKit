import { DEFAULT_LOCALE } from "@/i18n/locales";
import { type Db, getPool, query, withTransaction } from "@/core/platform/db";
import { describeLines } from "@/core/booking/lines";
import { normalizePhone } from "@/core/platform/links";
import * as appointments from "@/core/booking/appointments";
import { findOrCreateByPhone } from "@/core/booking/customers";
import { Notify } from "@/core/platform/notify";
import { formatHe, localDateTimeToUtc } from "@/core/platform/time";

// Dibs import. Steps: stage the export, check and normalise it, report; then
// (not in a dry run) import it, and after the switch queue one "your new link"
// message per future booking. The CSV layout is read from a mapping file,
// because the real export format is still open (Q6).

export type DibsMapping = {
  columns: { ref: string; name: string; phone: string; date: string; time?: string; duration?: string; service: string; notes?: string };
  dateFormat: "dd/MM/yyyy" | "yyyy-MM-dd" | "MM/dd/yyyy";
  /** Dibs service name → services.name_he on the new site. */
  services: Record<string, string>;
};

export type ImportReport = {
  rows: number;
  /** Distinct valid phone numbers in the export. */
  customers: number;
  mergedDuplicates: number;
  futureInDibs: number;
  past: number;
  badPhones: { row: number; value: string }[];
  badTimes: { row: number; value: string }[];
  unmappedServices: Record<string, number>;
  missingRefs: number[];
  duplicateRefs: string[];
  clashes: { row: number; ref: string | null; start: string }[];
  /** Filled after a real import. */
  imported?: { future: number; past: number; alreadyThere: number; refusedByOverlap: number };
  futureInNewSystem?: number;
};

/** Splits CSV text into rows. Handles quotes, a byte-order mark, CRLF, and comma, semicolon or tab separators. */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const separator = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]!;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

/** A Dibs date (and time) as a UTC instant, read in Israel time; null when unreadable. */
export function parseDibsTime(date: string, time: string | undefined, format: DibsMapping["dateFormat"]): Date | null {
  const [datePart, inlineTime] = date.trim().split(/\s+/);
  const clock = (time?.trim() || inlineTime || "").slice(0, 5);
  const numbers = (datePart ?? "").split(/[./-]/).map(Number);
  if (numbers.length !== 3 || numbers.some((n) => !Number.isInteger(n))) return null;
  const [a, b, c] = numbers as [number, number, number];
  const [year, month, day] = format === "yyyy-MM-dd" ? [a, b, c] : format === "MM/dd/yyyy" ? [c, a, b] : [c, b, a];
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(clock)) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [hour, minute] = clock.split(":").map(Number) as [number, number];
  const local = `${year}-${pad(month)}-${pad(day)}`;
  const instant = localDateTimeToUtc(local, `${pad(hour)}:${pad(minute)}`);
  // Reject dates that do not exist (31/02 rolls over).
  return formatHe(instant, "yyyy-MM-dd") === local ? instant : null;
}

type Staged = {
  rowNo: number;
  ref: string | null;
  name: string;
  phoneRaw: string;
  phone: string | null;
  start: Date | null;
  durationMin: number | null;
  serviceRaw: string;
  serviceId: number | null;
  notes: string | null;
  problem: string | null;
};

/**
 * Steps 1, 2 and 4: stages the export, normalises phones, times and services,
 * merges customers by phone, finds clashes, and writes the report. Changes no
 * booking. Returns the run id and the report.
 */
export async function stageImport(
  input: { text: string; fileName: string; mapping: DibsMapping; dryRun: boolean; freezeTime: Date },
  db: Db = getPool(),
): Promise<{ runId: number; report: ImportReport }> {
  const table = parseCsv(input.text);
  const header = (table[0] ?? []).map((cell) => cell.trim());
  const column = (name: string | undefined) => (name ? header.indexOf(name) : -1);
  const columns = Object.fromEntries(
    Object.entries(input.mapping.columns).map(([key, name]) => [key, column(name)]),
  ) as Record<keyof DibsMapping["columns"], number>;
  for (const required of ["ref", "name", "phone", "date", "service"] as const) {
    if (columns[required] < 0) throw new Error(`Column "${input.mapping.columns[required]}" (${required}) not found in the CSV header`);
  }
  const services = await query<{ id: number; name: string; duration: number }>(
    "select id::int, name_he as name, duration_min as duration from services",
    [],
    db,
  );
  const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");

  const report: ImportReport = {
    rows: 0,
    customers: 0,
    mergedDuplicates: 0,
    futureInDibs: 0,
    past: 0,
    badPhones: [],
    badTimes: [],
    unmappedServices: {},
    missingRefs: [],
    duplicateRefs: [],
    clashes: [],
  };
  const seenRefs = new Set<string>();
  const staged: Staged[] = table.slice(1).map((row, index) => {
    const rowNo = index + 2;
    const ref = cell(row, columns.ref) || null;
    const phoneRaw = cell(row, columns.phone);
    const phone = normalizePhone(phoneRaw);
    const dateRaw = cell(row, columns.date);
    const start = parseDibsTime(dateRaw, columns.time >= 0 ? cell(row, columns.time) : undefined, input.mapping.dateFormat);
    const serviceRaw = cell(row, columns.service);
    const service = services.find((s) => s.name === input.mapping.services[serviceRaw]);
    const duration = Number(cell(row, columns.duration));
    let problem: string | null = null;
    if (!ref) {
      problem = "missing_ref";
      report.missingRefs.push(rowNo);
    } else if (seenRefs.has(ref)) {
      problem = "duplicate_ref";
      report.duplicateRefs.push(ref);
    } else if (!phone) {
      problem = "bad_phone";
      report.badPhones.push({ row: rowNo, value: phoneRaw });
    } else if (!start) {
      problem = "bad_time";
      report.badTimes.push({ row: rowNo, value: `${dateRaw} ${cell(row, columns.time)}`.trim() });
    } else if (!service) {
      problem = "unmapped_service";
      report.unmappedServices[serviceRaw || "(empty)"] = (report.unmappedServices[serviceRaw || "(empty)"] ?? 0) + 1;
    }
    if (ref) seenRefs.add(ref);
    return {
      rowNo,
      ref,
      name: cell(row, columns.name) || "לקוח",
      phoneRaw,
      phone,
      start,
      durationMin: Number.isInteger(duration) && duration > 0 && duration <= 600 ? duration : (service?.duration ?? null),
      serviceRaw,
      serviceId: service?.id ?? null,
      notes: cell(row, columns.notes) || null,
      problem,
    };
  });
  report.rows = staged.length;

  // Clashes: future bookings that overlap each other or a live booking already
  // in the new system that did not come from this export.
  const future = staged
    .filter((row) => !row.problem && row.start! >= input.freezeTime)
    .sort((a, b) => a.start!.getTime() - b.start!.getTime());
  let lastEnd = 0;
  for (const row of future) {
    const start = row.start!.getTime();
    const end = start + row.durationMin! * 60_000;
    const [existing] = await query(
      `select 1 from appointments where status in ('held', 'confirmed') and groomer = 1
         and during && tstzrange($1, $2, '[)') and (dibs_ref is null or dibs_ref <> $3) limit 1`,
      [new Date(start), new Date(end), row.ref],
      db,
    );
    if (start < lastEnd || existing) {
      row.problem = "clash";
      report.clashes.push({ row: row.rowNo, ref: row.ref, start: formatHe(row.start!, "dd/MM/yyyy HH:mm") });
    } else lastEnd = end;
  }
  report.futureInDibs = staged.filter((row) => row.start && row.start >= input.freezeTime && row.problem !== "duplicate_ref").length;
  report.past = staged.filter((row) => !row.problem && row.start! < input.freezeTime).length;

  const byPhone = new Map<string, { name: string; others: Set<string> }>();
  for (const row of staged) {
    if (!row.phone || row.problem === "bad_phone") continue;
    const entry = byPhone.get(row.phone);
    if (!entry) byPhone.set(row.phone, { name: row.name, others: new Set() });
    else if (entry.name !== row.name) entry.others.add(row.name);
  }
  report.customers = byPhone.size;
  report.mergedDuplicates = [...byPhone.values()].filter((entry) => entry.others.size > 0).length;

  const runId = await withTransaction(async (client) => {
    const [run] = await query<{ id: number }>(
      "insert into import_runs (file_name, dry_run, freeze_time, report) values ($1, $2, $3, $4) returning id::int",
      [input.fileName, input.dryRun, input.freezeTime, JSON.stringify(report)],
      client,
    );
    for (const row of staged) {
      await query(
        `insert into import_dibs_appointments (run_id, row_no, dibs_ref, name, phone_raw, phone_e164, starts_at,
           duration_min, service_raw, service_id, notes, problem)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [run!.id, row.rowNo, row.ref, row.name, row.phoneRaw, row.phone, row.start, row.durationMin, row.serviceRaw,
          row.serviceId, row.notes, row.problem],
        client,
      );
    }
    for (const [phone, entry] of byPhone) {
      await query(
        "insert into import_dibs_customers (run_id, phone_e164, display_name, other_names) values ($1, $2, $3, $4)",
        [run!.id, phone, entry.name, [...entry.others]],
        client,
      );
    }
    return run!.id;
  }, db);
  return { runId, report };
}

/**
 * Step 3: imports the staged rows without problems. Bookings are created with
 * `created_by = import` and their Dibs reference, so a second run adds
 * nothing. No owner alert and no customer message is queued here.
 */
export async function applyImport(runId: number, db: Db = getPool()): Promise<ImportReport> {
  const [run] = await query<{ freezeTime: Date; report: ImportReport }>(
    `select freeze_time as "freezeTime", report from import_runs where id = $1`,
    [runId],
    db,
  );
  if (!run) throw new Error(`Import run ${runId} not found`);
  const rows = await query<{ ref: string; phone: string; start: Date; duration: number; serviceId: number; notes: string | null }>(
    `select dibs_ref as ref, phone_e164 as phone, starts_at as start, duration_min as duration, service_id::int as "serviceId", notes
     from import_dibs_appointments where run_id = $1 and problem is null order by starts_at`,
    [runId],
    db,
  );
  const imported = { future: 0, past: 0, alreadyThere: 0, refusedByOverlap: 0 };

  await withTransaction(async (client) => {
    const names = new Map(
      (await query<{ phone: string; name: string }>(
        "select phone_e164 as phone, display_name as name from import_dibs_customers where run_id = $1",
        [runId],
        client,
      )).map((row) => [row.phone, row.name]),
    );
    for (const row of rows) {
      const [exists] = await query("select 1 from appointments where dibs_ref = $1", [row.ref], client);
      if (exists) {
        imported.alreadyThere += 1;
        continue;
      }
      const customer = await findOrCreateByPhone(row.phone, names.get(row.phone) ?? "לקוח", "import", client);
      const [service] = await query<{ price: number }>("select price_from_agorot as price from services where id = $1", [row.serviceId], client);
      const end = new Date(row.start.getTime() + row.duration * 60_000);
      const lines = [{ serviceId: row.serviceId, durationMin: row.duration, priceFromAgorot: service?.price ?? 0 }];
      if (row.start >= run.freezeTime) {
        const result = await appointments.createConfirmed(
          { customerId: customer.id, start: row.start, end, lines, createdBy: "import", notes: row.notes, source: { dibs: true } },
          client,
        );
        if (result.ok) {
          await query("update appointments set dibs_ref = $2 where id = $1", [result.appointment.id, row.ref], client);
          imported.future += 1;
        }
        else imported.refusedByOverlap += 1;
      } else {
        // History only: past visits count for the customer record and any pre-visit note.
        const [past] = await query<{ id: number }>(
          `insert into appointments (customer_id, starts_at, ends_at, status, created_by, dibs_ref, notes, source)
           values ($1, $2, $3, 'completed', 'import', $4, $5, '{"dibs": true}') returning id::int`,
          [customer.id, row.start, end, row.ref, row.notes],
          client,
        );
        await query(
          `insert into appointment_lines (appointment_id, position, service_id, duration_min, price_from_agorot)
           values ($1, 1, $2, $3, $4)`,
          [past!.id, row.serviceId, row.duration, service?.price ?? 0],
          client,
        );
        imported.past += 1;
      }
    }
  }, db);

  const [count] = await query<{ n: number }>(
    `select count(*)::int as n from appointments a
     where a.status = 'confirmed' and a.starts_at >= $2
       and exists (select 1 from import_dibs_appointments s where s.run_id = $1 and s.dibs_ref = a.dibs_ref)`,
    [runId, run.freezeTime],
    db,
  );
  const report: ImportReport = { ...run.report, imported, futureInNewSystem: count?.n ?? 0 };
  await query("update import_runs set report = $2 where id = $1", [runId, JSON.stringify(report)], db);
  return report;
}

/**
 * Step 5, after the switch: one "your new link" message per imported future
 * booking, in batches so the salon is not flooded with replies at once.
 */
export async function queueImportLinks(
  opts: { now?: Date; batchSize?: number; gapMin?: number } = {},
  db: Db = getPool(),
): Promise<number> {
  const now = opts.now ?? new Date();
  const batch = opts.batchSize ?? 30;
  const gap = opts.gapMin ?? 10;
  const rows = await query<{ id: number; customerId: number }>(
    `select a.id::int, a.customer_id::int as "customerId" from appointments a
     where a.created_by = 'import' and a.status = 'confirmed' and a.starts_at > $1
       and not exists (select 1 from message_outbox o where o.kind = 'import_link' and o.appointment_id = a.id)
     order by a.starts_at`,
    [now],
    db,
  );
  await Notify.queue(
    rows.map((row, index) => ({
      kind: "import_link" as const,
      templateKey: "import_link",
      appointmentId: row.id,
      customerId: row.customerId,
      sendAt: new Date(now.getTime() + Math.floor(index / batch) * gap * 60_000),
      dedupeKey: `import_link:${row.id}`,
    })),
    db,
  );
  return rows.length;
}

const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Every future confirmed booking as CSV (Israel time), so the salon could
 * enter them back into Dibs by hand if the switch is undone.
 */
export async function exportFutureCsv(now: Date = new Date(), db: Db = getPool()): Promise<string> {
  const found = await query<{
    id: number;
    start: Date;
    end: Date;
    name: string;
    phone: string | null;
    lines: { position: number; service: string }[];
    notes: string | null;
    ref: string | null;
  }>(
    `select a.id::int, a.starts_at as start, a.ends_at as "end", c.display_name as name, c.phone_e164 as phone, a.notes,
       a.dibs_ref as ref,
       coalesce((select json_agg(json_build_object('position', ap.position, 'service', s.name_he) order by ap.position)
                 from appointment_lines ap join services s on s.id = ap.service_id
                 where ap.appointment_id = a.id), '[]') as lines
     from appointments a join customers c on c.id = a.customer_id
     where a.status = 'confirmed' and a.starts_at > $1 order by a.starts_at`,
    [now],
    db,
  );
  // An extension may name a line (a pet's name, say); the name goes before the service.
  const describe = await describeLines(
    found.map((row) => row.id),
    DEFAULT_LOCALE,
    db,
  );
  const rows = found.map((row) => ({
    ...row,
    services: row.lines.map((line) => [describe(row.id, line.position).label, line.service].filter(Boolean).join(" – ")).join("; "),
  }));
  const header = ["date", "start", "end", "name", "phone", "services", "notes", "dibs_ref"];
  const lines = rows.map((row) =>
    [
      formatHe(row.start, "dd/MM/yyyy"),
      formatHe(row.start, "HH:mm"),
      formatHe(row.end, "HH:mm"),
      row.name,
      row.phone?.startsWith("+972") ? `0${row.phone.slice(4)}` : (row.phone ?? ""),
      row.services,
      row.notes,
      row.ref,
    ]
      .map(csvCell)
      .join(","),
  );
  // A byte-order mark so Excel opens the Hebrew correctly.
  return `﻿${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

/** Removes a customer's Dibs reference, as part of an erase. */
export async function forgetReference(customerId: number, db: Db = getPool()): Promise<void> {
  await query("update customers set dibs_ref = null where id = $1", [customerId], db);
}
