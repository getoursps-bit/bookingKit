import { randomInt, timingSafeEqual } from "node:crypto";
import type { Locale } from "../../i18n/locales";
import { type Db, getPool, query } from "../db";
import { getFeatures } from "../features";
import { deliver } from "../notify/deliver";
import { customerRecipient } from "../notify/recipients";
import { route } from "../notify/routing";
import { claimOne, enqueue, monthlyCount } from "../repos/outbox";
import { getSettings } from "../repos/settings";
import { secretHash } from "./hash";
import { hit, LIMITS } from "./rateLimit";

export const CODE_TTL_MIN = 10;

export type CodeChannel = "whatsapp" | "email";

export type IssueResult =
  | { ok: true; channel: CodeChannel; expiresAt: Date; to: string }
  /** NoChannel: no way to send (cap reached, nothing set up, no email for "send by email"). */
  | { ok: false; reason: "RateLimited" | "NoChannel" | "Failed" };

/**
 * Creates a 6-digit code for a held booking and sends it now, while the
 * customer waits: it is the one message not left to the worker. It still goes
 * through an outbox row and `route()`, so its channel, cost and outcome are
 * recorded like any other message. Only the code's keyed hash is stored.
 */
export async function issueCode(
  input: {
    appointmentId: number;
    customerId: number;
    address: string;
    prefer?: CodeChannel;
    locale?: Locale;
    /** Where an emailed code goes for this booking; it wins over the one on record. */
    email?: string | null;
  },
  db: Db = getPool(),
): Promise<IssueResult> {
  const to = await customerRecipient(input.customerId, db);
  // Consent to appointment messages does not cover a code the customer asked for.
  // The code goes out in the language of the page the customer is on.
  const recipient = {
    ...to,
    email: input.email?.trim().toLowerCase() || to.email,
    optedOut: false,
    prefer: input.prefer,
    locale: input.locale ?? to.locale,
  };
  // A code with nowhere to go is not a send, so it does not use up the limits.
  const settings = await getSettings(db);
  const channels = route("code", recipient, { settings, features: getFeatures(), monthlyCount: await monthlyCount(new Date(), db) });
  if (channels.length === 0) return { ok: false, reason: "NoChannel" };
  const allowed = [
    await hit(
      `code:contact:${to.phone ?? input.customerId}`,
      LIMITS.codeSendsPerPhonePerHour.windowMin,
      LIMITS.codeSendsPerPhonePerHour.max,
      db,
    ),
    await hit(
      `code:address:${input.address}`,
      LIMITS.codeSendsPerAddressPerHour.windowMin,
      LIMITS.codeSendsPerAddressPerHour.max,
      db,
    ),
  ];
  if (allowed.includes(false)) return { ok: false, reason: "RateLimited" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [id] = await enqueue(
    [{ kind: "code", templateKey: "code", appointmentId: input.appointmentId, customerId: input.customerId }],
    db,
  );
  const row = await claimOne(id!, db);
  if (!row) return { ok: false, reason: "Failed" };
  const sent = await deliver(row, recipient, { code }, { buttonParam: code, db });
  if (!sent.ok) return { ok: false, reason: sent.reason === "NoChannel" ? "NoChannel" : "Failed" };
  if (sent.channel === "push") return { ok: false, reason: "Failed" };

  const contact = sent.channel === "email" ? recipient.email! : recipient.phone!;
  const [stored] = await query<{ expiresAt: Date }>(
    `insert into verification_codes (contact, channel, code_hash, appointment_id, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(mins => $5::int))
     returning expires_at as "expiresAt"`,
    [contact, sent.channel, secretHash(`${input.appointmentId}:${code}`), input.appointmentId, CODE_TTL_MIN],
    db,
  );
  return { ok: true, channel: sent.channel, expiresAt: stored!.expiresAt, to: contact };
}

export type CheckResult =
  { ok: true; contact: string; channel: CodeChannel } | { ok: false; reason: "Wrong" | "Expired" | "TooManyAttempts" };

/**
 * Checks a code against the newest live code for the booking. Each check uses
 * one of five attempts, counted in the database before comparing, so parallel
 * guesses cannot get past the limit. A right code is used up.
 */
export async function checkCode(appointmentId: number, code: string, db: Db = getPool()): Promise<CheckResult> {
  const [latest] = await query<{ id: number; attempts: number; expired: boolean }>(
    `select id::int, attempts, expires_at <= now() as expired from verification_codes
     where appointment_id = $1 order by created_at desc, id desc limit 1`,
    [appointmentId],
    db,
  );
  if (!latest || latest.expired) return { ok: false, reason: "Expired" };
  const [row] = await query<{ codeHash: string; contact: string; channel: CodeChannel }>(
    `update verification_codes set attempts = attempts + 1
     where id = $1 and attempts < $2
     returning code_hash as "codeHash", contact, channel`,
    [latest.id, LIMITS.codeAttempts],
    db,
  );
  if (!row) return { ok: false, reason: "TooManyAttempts" };
  const given = Buffer.from(secretHash(`${appointmentId}:${code.trim()}`));
  const stored = Buffer.from(row.codeHash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return { ok: false, reason: "Wrong" };
  await query("delete from verification_codes where appointment_id = $1", [appointmentId], db);
  return { ok: true, contact: row.contact, channel: row.channel };
}

/** Removes codes that expired more than a day ago. Run daily by the worker. */
export async function cleanup(db?: Db): Promise<number> {
  const rows = await query(
    "delete from verification_codes where expires_at < now() - interval '1 day' returning id",
    [],
    db,
  );
  return rows.length;
}
