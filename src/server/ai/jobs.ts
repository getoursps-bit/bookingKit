import { type Db, getPool, query, withTransaction } from "../db";
import { log } from "../log";
import { addOwnerEvent } from "../repos/events";
import { getSettings } from "../repos/settings";
import { getStorage } from "../storage";
import { formatHe, localDateOf, localDayBounds } from "../time";
import { addLocalDays } from "../booking/slots";
import { getAi } from ".";
import { AiError, type AiProvider, type SummaryInput } from "./types";

export const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 20_000;

type Job = { id: number; kind: "photo" | "summary"; appointmentId: number; petId: number | null; attempts: number };

/** Claims one queued AI job, or null. */
async function claim(db: Db): Promise<Job | null> {
  const [job] = await query<Job>(
    `update ai_jobs set status = 'running', attempts = attempts + 1, updated_at = now()
     where id = (select id from ai_jobs where status = 'queued' order by id limit 1 for update skip locked)
     returning id::int, kind, appointment_id::int as "appointmentId", pet_id::int as "petId", attempts`,
    [],
    db,
  );
  return job ?? null;
}

async function finish(id: number, fields: { status: string; error?: string; model?: string; promptVersion?: string; cost?: number; result?: unknown }, db: Db) {
  await query(
    `update ai_jobs set status = $2, error = $3, model = coalesce($4, model), prompt_version = coalesce($5, prompt_version),
       cost_agorot = cost_agorot + $6, result = coalesce($7, result), updated_at = now()
     where id = $1`,
    [id, fields.status, fields.error ?? null, fields.model ?? null, fields.promptVersion ?? null, fields.cost ?? 0,
      fields.result === undefined ? null : JSON.stringify(fields.result)],
    db,
  );
}

const month = (now: Date) => `${now.toISOString().slice(0, 7)}-01`;

/**
 * Reserves the most a call may cost against this month's cap. Returns false
 * (and tells the owner once a month) when the cap would be passed.
 */
async function reserve(estimate: number, cap: number, now: Date, db: Db): Promise<boolean> {
  const ok = await withTransaction(async (client) => {
    await query("insert into ai_spend (month) values ($1) on conflict do nothing", [month(now)], client);
    const [row] = await query<{ total: number }>(
      "select total_agorot as total from ai_spend where month = $1 for update",
      [month(now)],
      client,
    );
    if ((row?.total ?? 0) + estimate > cap) return false;
    await query("update ai_spend set total_agorot = total_agorot + $2 where month = $1", [month(now), estimate], client);
    return true;
  }, db);
  if (!ok) {
    const first = await query(
      "insert into job_runs (name, run_date) values ('ai_cap', $1) on conflict do nothing returning name",
      [month(now)],
      db,
    );
    if (first.length > 0) await addOwnerEvent("ai_cap_reached", null, {}, {}, db);
  }
  return ok;
}

/** Replaces the reservation with what the call really cost. */
async function settle(estimate: number, actual: number, now: Date, db: Db) {
  await query("update ai_spend set total_agorot = greatest(0, total_agorot + $2) where month = $1", [month(now), actual - estimate], db);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new AiError("timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Runs queued AI jobs until none is left (or `limit` ran). A job whose switch
 * is off, or that would pass the cap, is skipped. Failures are retried once,
 * then left as failed; they never touch the booking or reach the customer.
 */
export async function runAiJobs(
  opts: { db?: Db; now?: Date; ai?: AiProvider | null; timeoutMs?: number; limit?: number } = {},
): Promise<number> {
  const db = opts.db ?? getPool();
  const now = opts.now ?? new Date();
  const ai = opts.ai === undefined ? getAi() : opts.ai;
  let ran = 0;
  for (let job = await claim(db); job; job = await claim(db)) {
    ran += 1;
    await runOne(job, { db, now, ai, timeoutMs: opts.timeoutMs ?? TIMEOUT_MS });
    if (opts.limit && ran >= opts.limit) break;
  }
  return ran;
}

async function runOne(job: Job, ctx: { db: Db; now: Date; ai: AiProvider | null; timeoutMs: number }): Promise<void> {
  const { db, now, ai } = ctx;
  const settings = await getSettings(db);
  const switchOn = job.kind === "photo" ? settings["ai.photo"] : settings["ai.summary"];
  if (!ai || !switchOn) {
    await finish(job.id, { status: "skipped", error: ai ? "switched off" : "AI not set up" }, db);
    return;
  }
  const estimate = ai.estimateAgorot(job.kind);
  if (!(await reserve(estimate, settings["cap.aiMonthlyAgorot"], now, db))) {
    await finish(job.id, { status: "skipped", error: "monthly cap" }, db);
    return;
  }
  try {
    if (job.kind === "photo") {
      const [photo] = await query<{ key: string }>(
        "select storage_key as key from pet_photos where pet_id = $1 and appointment_id = $2",
        [job.petId, job.appointmentId],
        db,
      );
      const image = photo ? await getStorage().get(photo.key) : null;
      if (!image) {
        await settle(estimate, 0, now, db);
        await finish(job.id, { status: "skipped", error: "photo gone" }, db);
        return;
      }
      const result = await withTimeout(ai.analysePhoto(image, "image/webp"), ctx.timeoutMs);
      const { model, promptVersion, costAgorot, ...suggestion } = result;
      await settle(estimate, costAgorot, now, db);
      await finish(job.id, { status: "done", model, promptVersion, cost: costAgorot, result: suggestion }, db);
    } else {
      const input = await summaryInput(job.appointmentId, db);
      if (!input) {
        await settle(estimate, 0, now, db);
        await finish(job.id, { status: "skipped", error: "booking no longer confirmed" }, db);
        return;
      }
      const result = await withTimeout(ai.summarise(input), ctx.timeoutMs);
      await settle(estimate, result.costAgorot, now, db);
      await finish(
        job.id,
        { status: "done", model: result.model, promptVersion: result.promptVersion, cost: result.costAgorot, result: { textHe: result.textHe } },
        db,
      );
    }
  } catch (error) {
    const spent = error instanceof AiError ? error.costAgorot : 0;
    await settle(estimate, spent, now, db);
    const last = job.attempts >= MAX_ATTEMPTS;
    log.warn({ aiJob: job.id, kind: job.kind, attempt: job.attempts, err: (error as Error).message }, "AI job failed");
    await finish(job.id, { status: last ? "failed" : "queued", error: (error as Error).message.slice(0, 200), cost: spent }, db);
  }
}

/** The facts for a pre-visit summary; null when the booking is no longer confirmed. */
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
  const pets = await query<SummaryInput["pets"][number]>(
    `select coalesce(p.name, 'חיה') as name, coalesce(p.species, '') as species, p.breed, s.name_he as service,
       p.coat_notes as "coatNotes", p.coat_condition as "coatCondition", p.temperament_note as "temperamentNote"
     from appointment_pets ap join services s on s.id = ap.service_id left join pets p on p.id = ap.pet_id
     where ap.appointment_id = $1 order by ap.position`,
    [appointmentId],
    db,
  );
  const [history] = await query<{ visits: number }>(
    "select count(*)::int as visits from appointments where customer_id = $1 and status = 'completed'",
    [booking.customerId],
    db,
  );
  return {
    when: formatHe(booking.start, "EEEE HH:mm"),
    customerNotes: booking.notes,
    ownerNotes: booking.ownerNotes,
    noShowCount: booking.noShowCount,
    pastVisits: history?.visits ?? 0,
    pets,
  };
}

/** The 19:00 job: queue a summary for each confirmed booking tomorrow, when the switch is on. */
export async function queueSummaries(now: Date, db: Db = getPool()): Promise<number> {
  const settings = await getSettings(db);
  if (!settings["ai.summary"] || !getAi()) return 0;
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
