import { extensions } from "@/extension/registry";
import { type Db, getPool, query, withTransaction } from "@/server/db";
import { log } from "@/server/log";
import { addOwnerEvent } from "@/server/repos/events";
import { readSettings } from "@/server/repos/settings";
import type { AiJobKind, AiOffer } from "./api";
import { getAi } from "./provider";
import { AI_SETTINGS } from "./settings";
import { summaryKind } from "./summary";
import { AiError, type AiProvider } from "./types";

export const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 20_000;

type Job = { id: number; kind: string; appointmentId: number; subjectId: number | null; attempts: number };

/** Every kind of job: this extension's own note, and what the other extensions offer under `provides.ai`. */
function kinds(): Record<string, AiJobKind> {
  return Object.assign({ summary: summaryKind }, ...extensions().map((extension) => (extension.provides?.ai as AiOffer | undefined)?.jobs ?? {}));
}

/** Claims one queued AI job, or null. */
async function claim(db: Db): Promise<Job | null> {
  const [job] = await query<Job>(
    `update ai_jobs set status = 'running', attempts = attempts + 1, updated_at = now()
     where id = (select id from ai_jobs where status = 'queued' order by id limit 1 for update skip locked)
     returning id::int, kind, appointment_id::int as "appointmentId", subject_id::int as "subjectId", attempts`,
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
  const kind = kinds()[job.kind];
  // A kind nobody offers belongs to an extension that is off now.
  if (!ai || !kind || !(await kind.on(db))) {
    await finish(job.id, { status: "skipped", error: ai ? "switched off" : "AI not set up" }, db);
    return;
  }
  const estimate = ai.estimateAgorot(kind.input);
  if (!(await reserve(estimate, (await readSettings(AI_SETTINGS, db))["cap.aiMonthlyAgorot"], now, db))) {
    await finish(job.id, { status: "skipped", error: "monthly cap" }, db);
    return;
  }
  try {
    const request = await kind.request({ appointmentId: job.appointmentId, subjectId: job.subjectId }, db);
    if ("skip" in request) {
      await settle(estimate, 0, now, db);
      await finish(job.id, { status: "skipped", error: request.skip }, db);
      return;
    }
    const answer = await withTimeout(ai.ask(request), ctx.timeoutMs);
    let result: unknown;
    try {
      result = kind.result(answer.text);
    } catch (error) {
      // The call was paid for even though its answer cannot be used.
      throw new AiError((error as Error).message || "invalid output", answer.costAgorot);
    }
    await settle(estimate, answer.costAgorot, now, db);
    await finish(
      job.id,
      { status: "done", model: answer.model, promptVersion: kind.promptVersion, cost: answer.costAgorot, result },
      db,
    );
  } catch (error) {
    const spent = error instanceof AiError ? error.costAgorot : 0;
    await settle(estimate, spent, now, db);
    const last = job.attempts >= MAX_ATTEMPTS;
    log.warn({ aiJob: job.id, kind: job.kind, attempt: job.attempts, err: (error as Error).message }, "AI job failed");
    await finish(job.id, { status: last ? "failed" : "queued", error: (error as Error).message.slice(0, 200), cost: spent }, db);
  }
}

/** What AI cost in a month ("yyyy-mm-01"). */
export async function spentIn(month: string, db: Db = getPool()): Promise<number> {
  const [row] = await query<{ total: number }>("select total_agorot::int as total from ai_spend where month = $1::date", [month], db);
  return row?.total ?? 0;
}
