import { extensions } from "@/extension/registry";
import { DEFAULT_LOCALE, PACKS } from "@/i18n/locales";
import { addLocalDays } from "@/core/booking/slots";
import { type Db, getPool, query } from "@/core/platform/db";
import { describeLines } from "@/core/booking/lines";
import { readSettings } from "@/core/platform/settings";
import { formatLocal, localDateOf, localDayBounds } from "@/core/platform/time";
import type { AiJobKind, AiOffer } from "./api";
import { getAi } from "./provider";
import { AI_SETTINGS } from "./settings";

// The pre-visit note: a few lines for the owner, written the evening before
// from what the booking, the customer record and the extensions know.

const PROMPT_VERSION = "summary-v2";

const prompt = (language: string) => `You write a short note for the owner of a business that takes bookings, read the evening before a visit.
Write in this language: ${language}.
Use only the facts in the JSON you are given. Do not guess, do not add advice about health or medicine,
and do not mention prices. At most 4 short lines: who is coming, what each booked line needs, anything to
prepare, and notes from the customer or the business.
Answer with the note text only.`;

export type SummaryInput = {
  when: string;
  customerNotes: string | null;
  ownerNotes: string | null;
  noShowCount: number;
  pastVisits: number;
  /** One per booked service: its name (a pet's name, say), the service, and what the extensions know about it. */
  lines: ({ name: string | null; service: string; notes: string[] } & Record<string, unknown>)[];
};

/** The facts for a pre-visit note; null when the booking is no longer confirmed. */
export async function summaryInput(appointmentId: number, db: Db = getPool()): Promise<SummaryInput | null> {
  const [booking] = await query<{
    start: Date;
    status: string;
    notes: string | null;
    ownerNotes: string | null;
    noShowCount: number;
    customerId: number;
  }>(
    `select a.starts_at as start, a.status, a.notes, c.notes as "ownerNotes", c.no_show_count as "noShowCount",
       c.id::int as "customerId"
     from appointments a join customers c on c.id = a.customer_id where a.id = $1`,
    [appointmentId],
    db,
  );
  if (!booking || booking.status !== "confirmed") return null;
  const lines = await query<{ position: number; service: string }>(
    `select ap.position, s.name_he as service
     from appointment_lines ap join services s on s.id = ap.service_id
     where ap.appointment_id = $1 order by ap.position`,
    [appointmentId],
    db,
  );
  const describe = await describeLines([appointmentId], DEFAULT_LOCALE, db);
  const facts = new Map<string, Record<string, unknown>>();
  for (const extension of extensions()) {
    const offered = await (extension.provides?.ai as AiOffer | undefined)?.lineFacts?.([appointmentId], db);
    for (const [key, value] of offered ?? []) facts.set(key, { ...facts.get(key), ...value });
  }
  const [history] = await query<{ visits: number }>(
    "select count(*)::int as visits from appointments where customer_id = $1 and status = 'completed'",
    [booking.customerId],
    db,
  );
  return {
    when: formatLocal(booking.start, "EEEE HH:mm", DEFAULT_LOCALE),
    customerNotes: booking.notes,
    ownerNotes: booking.ownerNotes,
    noShowCount: booking.noShowCount,
    pastVisits: history?.visits ?? 0,
    lines: lines.map((line) => {
      const described = describe(appointmentId, line.position);
      return { ...facts.get(`${appointmentId}:${line.position}`), name: described.label, service: line.service, notes: described.notes };
    }),
  };
}

export const summaryKind: AiJobKind = {
  on: async (db) => (await readSettings(AI_SETTINGS, db))["ai.summary"],
  input: "text",
  promptVersion: PROMPT_VERSION,
  async request(job, db) {
    const input = await summaryInput(job.appointmentId, db);
    if (!input) return { skip: "booking no longer confirmed" };
    return {
      system: prompt(`${PACKS[DEFAULT_LOCALE].name} (${DEFAULT_LOCALE})`),
      text: JSON.stringify(input),
      fake: `${input.when}: ${input.lines.map((line) => line.name ?? line.service).join(", ")}.`,
    };
  },
  result(answer) {
    if (!answer) throw new Error("invalid output");
    if (answer.length > 800) throw new Error("summary too long");
    return { text: answer };
  },
};

/** The 19:00 job: queue a note for each confirmed booking tomorrow, when the switch is on. */
export async function queueSummaries(now: Date, db: Db = getPool()): Promise<number> {
  if (!getAi() || !(await summaryKind.on(db))) return 0;
  const tomorrow = localDayBounds(addLocalDays(localDateOf(now), 1));
  const rows = await query(
    `insert into ai_jobs (kind, appointment_id)
     select 'summary', a.id from appointments a
     where a.status = 'confirmed' and a.starts_at >= $1 and a.starts_at < $2
       and not exists (select 1 from ai_jobs j where j.kind = 'summary' and j.appointment_id = a.id)
     returning id`,
    [tomorrow.start, tomorrow.end],
    db,
  );
  return rows.length;
}

/** The latest note written for each of these bookings. */
export async function summaries(appointmentIds: number[], db: Db = getPool()): Promise<Map<number, string>> {
  const rows = await query<{ appointmentId: number; text: string }>(
    `select distinct on (appointment_id) appointment_id::int as "appointmentId", result->>'text' as text
     from ai_jobs where kind = 'summary' and status = 'done' and appointment_id = any($1::bigint[])
     order by appointment_id, id desc`,
    [appointmentIds],
    db,
  );
  return new Map(rows.flatMap((row) => (row.text ? [[row.appointmentId, row.text] as const] : [])));
}
