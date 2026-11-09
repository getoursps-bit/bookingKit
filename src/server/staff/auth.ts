import { randomInt, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import type { Locale } from "../../i18n/locales";
import { type Db, getPool, query } from "../db";
import { newRawToken, secretHash } from "../identity/hash";
import { deliver } from "../notify/deliver";
import { claimOne, enqueue } from "../repos/outbox";
import { hit } from "../repos/rateLimits";

// Staff login, two ways to the same 30-day session cookie (it renews on use,
// so the home-screen app stays in):
// - email and password (Argon2id), then a time-based code from an app;
// - or a 6-digit code sent to the staff email.

export { SESSION_COOKIE, SESSION_DAYS } from "./cookie";
import { SESSION_DAYS } from "./cookie";
import { brand } from "@/brand";
export const PENDING_COOKIE = "ff_admin_2fa";
/** The address an emailed login code was sent to, signed, while the code is live. */
export const EMAIL_PENDING_COOKIE = "ff_admin_mail";
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
const EMAIL_CODE_TRIES = 5;
const EMAIL_CODE_SENDS = { windowMin: 15, max: 3 };

export type EmailCodeSend = { ok: true } | { ok: false; reason: "Locked" | "EmailFailed" };

/**
 * Emails a login code to a staff account. The answer is the same whether or
 * not the address has an account, so the page never tells which emails exist.
 * Three sends per address in 15 minutes; each new code replaces the last.
 * The code goes through an outbox row and `route()` like every message.
 */
export async function sendEmailCode(email: string, locale: Locale, db: Db = getPool()): Promise<EmailCodeSend> {
  const address = email.trim().toLowerCase();
  if (!(await hit(`login:email-code:${address}`, EMAIL_CODE_SENDS.windowMin, EMAIL_CODE_SENDS.max, db))) {
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
    `update staff set email_code_hash = $2, email_code_attempts = 0,
       email_code_expires_at = now() + make_interval(mins => $3::int)
     where id = $1`,
    [staff.id, secretHash(`staff:${staff.id}:${code}`), EMAIL_CODE_TTL_MIN],
    db,
  );
  const [id] = await enqueue([{ kind: "staff_code", templateKey: "staff_code", staffId: staff.id }], db);
  const row = id ? await claimOne(id, db) : null;
  const sent = row
    ? await deliver(row, { phone: null, email: staff.email, prefer: "email", locale }, { code }, { db })
    : null;
  if (!sent?.ok) {
    await query("update staff set email_code_hash = null, email_code_expires_at = null where id = $1", [staff.id], db);
    return { ok: false, reason: "EmailFailed" };
  }
  return { ok: true };
}

/**
 * Checks an emailed login code. Five tries per code, counted in the database
 * before comparing; a right code is used up. A locked account is refused.
 */
export async function checkEmailCode(email: string, code: string, db: Db = getPool()): Promise<number | null> {
  const address = email.trim().toLowerCase();
  if (!/^\d{6}$/.test(code)) return null;
  const [staff] = await query<{ id: number; hash: string }>(
    `update staff set email_code_attempts = email_code_attempts + 1
     where lower(email) = $1 and email_code_hash is not null and email_code_expires_at > now()
       and email_code_attempts < $2 and not coalesce(locked_until > now(), false)
     returning id::int, email_code_hash as hash`,
    [address, EMAIL_CODE_TRIES],
    db,
  );
  if (!staff) return null;
  const given = Buffer.from(secretHash(`staff:${staff.id}:${code}`));
  const stored = Buffer.from(staff.hash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return null;
  await query(
    `update staff set email_code_hash = null, email_code_expires_at = null, email_code_attempts = 0, failed_logins = 0
     where id = $1`,
    [staff.id],
    db,
  );
  return staff.id;
}

export function newTotpSecret(email: string): { secret: string; uri: string } {
  const secret = generateSecret();
  return { secret, uri: generateURI({ issuer: brand.name.en, label: email, secret }) };
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
