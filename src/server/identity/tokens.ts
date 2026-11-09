import { type Db, getPool, query } from "../db";
import * as appointments from "../repos/appointments";
import { newRawToken, secretHash } from "./hash";

// Private links and trusted devices. The raw token goes to the customer only;
// the database keeps its keyed hash.

export const TRUSTED_DEVICE_COOKIE = "bk_device";
export const TRUSTED_DEVICE_DAYS = 90;

/** A private link for one booking, valid until the visit ends. Returns the raw token. */
export async function issueManageToken(appointmentId: number, expiresAt: Date, db?: Db): Promise<string> {
  const raw = newRawToken();
  await appointments.issueManageToken(appointmentId, raw, expiresAt, db);
  return raw;
}

/** The booking behind a private link, or null when the link is unknown, expired or revoked. */
export async function resolveManageToken(raw: string, db?: Db): Promise<appointments.Appointment | null> {
  if (!/^[\w-]{20,100}$/.test(raw)) return null;
  return appointments.getByToken(raw, db);
}

/** Ends every private link of a booking, for example when it is cancelled. */
export async function revoke(appointmentId: number, db?: Db): Promise<void> {
  await query(
    "update manage_tokens set revoked_at = now() where appointment_id = $1 and revoked_at is null",
    [appointmentId],
    db,
  );
}

/** Remembers a verified customer's browser for 90 days, so they are not sent a paid code each visit. */
export async function issueTrustedDevice(
  customerId: number,
  db: Db = getPool(),
): Promise<{ raw: string; expiresAt: Date }> {
  const raw = newRawToken();
  const [row] = await query<{ expiresAt: Date }>(
    `insert into trusted_devices (customer_id, token_hash, expires_at)
     values ($1, $2, now() + make_interval(days => $3::int))
     returning expires_at as "expiresAt"`,
    [customerId, secretHash(raw), TRUSTED_DEVICE_DAYS],
    db,
  );
  return { raw, expiresAt: row!.expiresAt };
}

/** The customer a trusted-device cookie belongs to, or null when unknown or expired. */
export async function resolveTrustedDevice(raw: string | undefined, db?: Db): Promise<number | null> {
  if (!raw || !/^[\w-]{20,100}$/.test(raw)) return null;
  const [row] = await query<{ customerId: number }>(
    `select customer_id::int as "customerId" from trusted_devices
     where token_hash = $1 and expires_at > now()`,
    [secretHash(raw)],
    db,
  );
  return row?.customerId ?? null;
}
