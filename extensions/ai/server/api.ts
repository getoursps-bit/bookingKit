import { hasExtension } from "@/extension/registry";
import { type Db, getPool, query } from "@/core/platform/db";
import { getAi } from "./provider";
import type { AiRequest } from "./types";

// What another extension may use of this one. An extension that wants an AI
// call of its own (looking at a pet's photo, say) describes a kind of job
// under `provides.ai` in its manifest and queues jobs of that kind here. The
// worker runs them within the owner's monthly cap. AI never blocks or changes
// a booking: a job that fails is retried once and then left.

export type { AiRequest } from "./types";

export type AiJob = { appointmentId: number; subjectId: number | null };

export type AiJobKind = {
  /** True when the owner has this kind switched on. */
  on(db: Db): Promise<boolean>;
  /** What the question holds, for the cost reserved before the call. */
  input: "text" | "image";
  /** Recorded with every call. A changed prompt gets a new version. */
  promptVersion: string;
  /** The question, or why there is nothing to ask any more. */
  request(job: AiJob, db: Db): Promise<AiRequest | { skip: string }>;
  /** Checks the model's answer and returns what is stored as the job's result. Throws when the answer cannot be used. */
  result(answer: string): unknown;
};

/** What an extension puts under `provides.ai`. */
export type AiOffer = {
  /** Its kinds of job, by name. */
  jobs?: Record<string, AiJobKind>;
  /** Facts about booked lines for the pre-visit note, keyed "<appointment id>:<position>". Only what the owner may read. */
  lineFacts?(appointmentIds: number[], db: Db): Promise<Map<string, Record<string, unknown>>>;
};

/** Marks an offer, keeping its type checked. */
export function offerAi(offer: AiOffer): AiOffer {
  return offer;
}

/** True when this extension is on for the client and an AI provider is set up. */
export function aiOn(): boolean {
  return hasExtension("ai") && getAi() !== null;
}

/** Queues one job, or queues it again when the same one was asked before. */
export async function queueAiJob(kind: string, job: AiJob, db: Db = getPool()): Promise<void> {
  await query(
    `insert into ai_jobs (kind, appointment_id, subject_id) values ($1, $2, $3)
     on conflict (kind, appointment_id, subject_id) do update
       set status = 'queued', attempts = 0, result = null, error = null, updated_at = now()`,
    [kind, job.appointmentId, job.subjectId],
    db,
  );
}

/** The finished results of one kind for a booking, by subject. */
export async function aiResults<Result>(kind: string, appointmentId: number, db: Db = getPool()): Promise<Map<number | null, Result>> {
  const rows = await query<{ subjectId: number | null; result: Result }>(
    `select subject_id::int as "subjectId", result from ai_jobs
     where kind = $1 and appointment_id = $2 and status = 'done' order by id`,
    [kind, appointmentId],
    db,
  );
  return new Map(rows.map((row) => [row.subjectId, row.result]));
}

/** Marks a finished job as used, so its result is not offered again. */
export async function closeAiJob(kind: string, job: AiJob, reason: string, db: Db = getPool()): Promise<void> {
  await query(
    "update ai_jobs set status = 'skipped', error = $4 where kind = $1 and appointment_id = $2 and subject_id is not distinct from $3",
    [kind, job.appointmentId, job.subjectId, reason],
    db,
  );
}
