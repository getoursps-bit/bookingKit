import { randomInt, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import { DEFAULT_LOCALE, type Locale } from "../../../i18n/locales";
import { type Db, getPool, query, withTransaction } from "../db";
import { writeAudit } from "../audit";
import { newRawToken, secretHash } from "../identity/hash";
import { Notify } from "../notify";
import { claimOne } from "../outbox";
import { hit } from "../rateLimits";

// Staff login, two ways to the same 30-day session cookie (it renews on use,
// so the home-screen app stays in):
// - email and password (Argon2id), then a time-based code from an app;
// - or a 6-digit code sent to the staff email.
// A forgotten password is replaced with another emailed code (`resetPassword`).

export { SESSION_COOKIE, SESSION_DAYS } from "./cookie";
import { SESSION_DAYS } from "./cookie";
import { brandName } from "@/brand";
export const PENDING_COOKIE = "bk_admin_2fa";
/** The address an emailed login code was sent to, signed, while the code is live. */
export const EMAIL_PENDING_COOKIE = "bk_admin_mail";
/** The address a password reset code was sent to, signed, while the code is live. */
export const RESET_PENDING_COOKIE = "bk_admin_reset";
const LOCK = { windowMin: 15, maxFailures: 10 };

export type Staff = { id: number; email: string };

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export type PasswordResult = { ok: true; staffId: number } | { ok: false; reason: "Wrong" | "Locked" };

/**
 * Checks email and password. Ten failures for one email in 15 minutes lock it
 * for 15 minutes. The answer never says whether the email exists.
 */
export async function checkPassword(email: string, password: string, db: Db = getPool()): Promise<PasswordResult> {
  const address = email.trim().toLowerCase();
  const [staff] = await query<{ id: number; passwordHash: string; locked: boolean }>(
    `select id::int, password_hash as "passwordHash", coalesce(locked_until > now(), false) as locked
     from staff where lower(email) = $1`,
    [address],
    db,
  );
  if (staff?.locked) return { ok: false, reason: "Locked" };
  const valid = staff ? await argon2.verify(staff.passwordHash, password).catch(() => false) : false;
  if (valid && staff) {
    await query("update staff set failed_logins = 0 where id = $1", [staff.id], db);
    return { ok: true, staffId: staff.id };
  }
  const allowed = await hit(`login:${address}`, LOCK.windowMin, LOCK.maxFailures, db);
  if (staff) {
    await query(
      `update staff set failed_logins = failed_logins + 1,
         locked_until = case when $2 then now() + make_interval(mins => $3::int) else locked_until end
       where id = $1`,
      [staff.id, !allowed, LOCK.windowMin],
      db,
    );
  }
  return { ok: false, reason: allowed ? "Wrong" : "Locked" };
}

/** Checks the 6-digit app code; each time step can be used once. */
export async function checkTotp(staffId: number, code: string, db: Db = getPool()): Promise<boolean> {
  const [staff] = await query<{ secret: string | null; lastStep: string | null }>(
    `select totp_secret as secret, totp_last_step::text as "lastStep" from staff where id = $1`,
    [staffId],
    db,
  );
  if (!staff?.secret || !/^\d{6}$/.test(code)) return false;
  const result = await verifyTotp({ secret: staff.secret, token: code, epochTolerance: 30 }).catch(() => null);
  if (!result?.valid) return false;
  const step = Math.floor(Date.now() / 30_000) + (result.delta ?? 0);
  const used = await query(
    `update staff set totp_last_step = $2 where id = $1 and (totp_last_step is null or totp_last_step < $2) returning id`,
    [staffId, step],
    db,
  );
  return used.length > 0;
}

export const EMAIL_CODE_TTL_MIN = 10;
export const RESET_CODE_TTL_MIN = 10;
/** The shortest password a staff member may choose, here and in `pnpm staff:create`. */
export const MIN_PASSWORD_LENGTH = 12;
const EMAIL_CODE_TRIES = 5;
const EMAIL_CODE_SENDS = { windowMin: 15, max: 3 };

export type EmailCodeSend = { ok: true } | { ok: false; reason: "Locked" | "EmailFailed" };

// The two codes sent to the staff email: one logs in, one sets a new
// password. Each has its own columns, so asking for one never cancels the other.
const CODES = {
  login: { kind: "staff_code", column: "email_code", limitKey: "login:email-code", ttlMin: EMAIL_CODE_TTL_MIN },
  reset: { kind: "staff_reset", column: "reset_code", limitKey: "login:reset-code", ttlMin: RESET_CODE_TTL_MIN },
} as const;
type CodePurpose = keyof typeof CODES;

function codeHash(purpose: CodePurpose, staffId: number, code: string): string {
  return secretHash(purpose === "login" ? `staff:${staffId}:${code}` : `staff:${staffId}:${purpose}:${code}`);
}

/**
 * Emails a code to a staff account. The answer is the same whether or not the
 * address has an account, so the page never tells which emails exist. Three
 * sends per address and purpose in 15 minutes; each new code replaces the
 * last. The code goes through an outbox row and `route()` like every message.
 */
async function sendStaffCode(purpose: CodePurpose, email: string, locale: Locale, db: Db): Promise<EmailCodeSend> {
  const { kind, column, limitKey, ttlMin } = CODES[purpose];
  const address = email.trim().toLowerCase();
  if (!(await hit(`${limitKey}:${address}`, EMAIL_CODE_SENDS.windowMin, EMAIL_CODE_SENDS.max, db))) {
    return { ok: false, reason: "Locked" };
  }
  const [staff] = await query<{ id: number; email: string; locked: boolean }>(
    `select id::int, email, coalesce(locked_until > now(), false) as locked from staff where lower(email) = $1`,
    [address],
    db,
  );
  if (!staff) return { ok: true };
  if (staff.locked) return { ok: false, reason: "Locked" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await query(
    `update staff set ${column}_hash = $2, ${column}_attempts = 0,
       ${column}_expires_at = now() + make_interval(mins => $3::int)
     where id = $1`,
    [staff.id, codeHash(purpose, staff.id, code), ttlMin],
    db,
  );
  const [id] = await Notify.queue([{ kind, templateKey: kind, staffId: staff.id }], db);
  const row = id ? await claimOne(id, db) : null;
  const sent = row
    ? await Notify.send(row, { phone: null, email: staff.email, prefer: "email", locale }, { code }, { db })
    : null;
  if (!sent?.ok) {
    await query(`update staff set ${column}_hash = null, ${column}_expires_at = null where id = $1`, [staff.id], db);
    return { ok: false, reason: "EmailFailed" };
  }
  return { ok: true };
}

/**
 * Uses up one try of a live code and says whether it was right: five tries per
 * code, counted in the database before comparing. A locked account is refused.
 * Returns the staff id and the stored hash, so the caller can spend the code.
 */
async function tryStaffCode(
  purpose: CodePurpose,
  email: string,
  code: string,
  db: Db,
): Promise<{ id: number; hash: string } | null> {
  const { column } = CODES[purpose];
  const address = email.trim().toLowerCase();
  if (!/^\d{6}$/.test(code)) return null;
  const [staff] = await query<{ id: number; hash: string }>(
    `update staff set ${column}_attempts = ${column}_attempts + 1
     where lower(email) = $1 and ${column}_hash is not null and ${column}_expires_at > now()
       and ${column}_attempts < $2 and not coalesce(locked_until > now(), false)
     returning id::int, ${column}_hash as hash`,
    [address, EMAIL_CODE_TRIES],
    db,
  );
  if (!staff) return null;
  const given = Buffer.from(codeHash(purpose, staff.id, code));
  const stored = Buffer.from(staff.hash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return null;
  return staff;
}

/** Emails a login code to a staff account (see `sendStaffCode`). */
export function sendEmailCode(email: string, locale: Locale, db: Db = getPool()): Promise<EmailCodeSend> {
  return sendStaffCode("login", email, locale, db);
}

/** Checks an emailed login code; a right code is used up. */
export async function checkEmailCode(email: string, code: string, db: Db = getPool()): Promise<number | null> {
  const staff = await tryStaffCode("login", email, code, db);
  if (!staff) return null;
  await query(
    `update staff set email_code_hash = null, email_code_expires_at = null, email_code_attempts = 0, failed_logins = 0
     where id = $1`,
    [staff.id],
    db,
  );
  return staff.id;
}

/** Emails a code for setting a new password (see `sendStaffCode`). */
export function sendResetCode(email: string, locale: Locale, db: Db = getPool()): Promise<EmailCodeSend> {
  return sendStaffCode("reset", email, locale, db);
}

export type ResetResult = { ok: true } | { ok: false; reason: "Code" | "Short" };

/**
 * Sets a new password with an emailed reset code. A password that is too short
 * is refused before the code is tried, so it costs no try. A right code is
 * used up, every session of the account ends (the person logs in again, with
 * the app code or an email code as usual), and the change is audited.
 */
export async function resetPassword(
  email: string,
  code: string,
  password: string,
  db: Db = getPool(),
): Promise<ResetResult> {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "Short" };
  const staff = await tryStaffCode("reset", email, code, db);
  if (!staff) return { ok: false, reason: "Code" };
  const passwordHash = await hashPassword(password);
  const done = await withTransaction(async (client) => {
    // The hash in the where clause makes a code good for one reset, even when
    // two arrive at once.
    const [row] = await query(
      `update staff set password_hash = $3, reset_code_hash = null, reset_code_expires_at = null,
         reset_code_attempts = 0, failed_logins = 0
       where id = $1 and reset_code_hash = $2 returning id`,
      [staff.id, staff.hash, passwordHash],
      client,
    );
    if (!row) return false;
    await query("delete from staff_sessions where staff_id = $1", [staff.id], client);
    await writeAudit(client, { staffId: staff.id, actor: "staff", entity: "staff", entityId: staff.id, action: "password_reset" });
    return true;
  }, db);
  return done ? { ok: true } : { ok: false, reason: "Code" };
}

export function newTotpSecret(email: string): { secret: string; uri: string } {
  const secret = generateSecret();
  return { secret, uri: generateURI({ issuer: brandName(DEFAULT_LOCALE), label: email, secret }) };
}

export async function createSession(
  staffId: number,
  device: string | null,
  db: Db = getPool(),
): Promise<{ raw: string; expiresAt: Date }> {
  const raw = newRawToken();
  const [row] = await query<{ expiresAt: Date }>(
    `insert into staff_sessions (staff_id, session_hash, device, expires_at)
     values ($1, $2, left($3, 200), now() + make_interval(days => $4::int))
     returning expires_at as "expiresAt"`,
    [staffId, secretHash(raw), device, SESSION_DAYS],
    db,
  );
  return { raw, expiresAt: row!.expiresAt };
}

/**
 * The staff member behind a session cookie, or null. Each use pushes the
 * expiry 30 days ahead (at most once an hour, to spare writes).
 */
export async function resolveSession(raw: string | undefined, db: Db = getPool()): Promise<Staff | null> {
  if (!raw || !/^[\w-]{20,100}$/.test(raw)) return null;
  const [row] = await query<Staff>(
    `with session as (
       update staff_sessions set expires_at = now() + make_interval(days => $2::int)
       where session_hash = $1 and expires_at > now()
         and expires_at < now() + make_interval(days => $2::int) - interval '1 hour'
       returning staff_id)
     select s.id::int, s.email from staff s
     where s.id = coalesce((select staff_id from session),
                           (select staff_id from staff_sessions where session_hash = $1 and expires_at > now()))`,
    [secretHash(raw), SESSION_DAYS],
    db,
  );
  return row ?? null;
}

export async function revokeSession(raw: string | undefined, db: Db = getPool()): Promise<void> {
  if (!raw) return;
  await query("delete from staff_sessions where session_hash = $1", [secretHash(raw)], db);
}

/** Makes a staff account, or resets the password and authenticator key of the one with this email. */
export async function saveStaff(email: string, passwordHash: string, totpSecret: string, db?: Db): Promise<void> {
  await query(
    `insert into staff (email, password_hash, totp_secret) values ($1, $2, $3)
     on conflict (email) do update set password_hash = excluded.password_hash, totp_secret = excluded.totp_secret,
       totp_last_step = null, failed_logins = 0, locked_until = null`,
    [email, passwordHash, totpSecret],
    db,
  );
}
