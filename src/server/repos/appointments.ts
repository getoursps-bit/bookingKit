import type pg from "pg";
import { type Db, pgError, query, withTransaction } from "../db";
import { secretHash } from "../identity/hash";

export type AppointmentStatus = "held" | "confirmed" | "cancelled" | "completed" | "no_show" | "released";

export type Appointment = {
  id: number;
  customerId: number;
  start: Date;
  /** End of the slot taken, buffer included, so the database rule enforces the buffer too. */
  end: Date;
  status: AppointmentStatus;
  holdExpiresAt: Date | null;
  createdBy: "customer" | "owner" | "import";
  source: Record<string, unknown>;
  notes: string | null;
};

/**
 * One line of a booking: a service, with its length and price copied at
 * booking time. An extension that keeps something about a line (which pet it
 * is for, say) adds its own column to appointment_lines and fills it itself.
 */
export type AppointmentLine = {
  serviceId: number;
  durationMin: number;
  priceFromAgorot: number;
};

export type NewAppointment = {
  customerId: number;
  start: Date;
  end: Date;
  lines: AppointmentLine[];
  createdBy: Appointment["createdBy"];
  source?: Record<string, unknown>;
  notes?: string | null;
  idempotencyKey?: string | null;
};

export type SlotResult = { ok: true; appointment: Appointment } | { ok: false; reason: "SlotTaken" };

const COLUMNS = `id::int, customer_id::int as "customerId", starts_at as start, ends_at as "end", status,
  hold_expires_at as "holdExpiresAt", created_by as "createdBy", source, notes`;

function isOverlap(error: unknown): boolean {
  const { code, constraint } = pgError(error);
  return code === "23P01" && constraint === "appointments_no_overlap";
}

/**
 * Writes that take a time on the schedule wait their turn on one transaction
 * lock. Without it, several inserts racing for one time can deadlock inside
 * Postgres's exclusion-constraint check instead of one winning and the rest
 * getting an overlap. One salon books a few times an hour, so a single lock
 * costs nothing; the constraint still guards every write.
 */
const SCHEDULE_LOCK = 4_737_001;

async function lockSchedule(client: pg.PoolClient): Promise<void> {
  await client.query("select pg_advisory_xact_lock($1)", [SCHEDULE_LOCK]);
}

function isDuplicateKey(error: unknown): boolean {
  const { code, constraint } = pgError(error);
  return code === "23505" && constraint === "appointments_idempotency_key_key";
}

export function hashToken(token: string): string {
  return secretHash(token);
}

export async function getByIdempotencyKey(key: string, db?: Db): Promise<Appointment | null> {
  const [row] = await query<Appointment>(`select ${COLUMNS} from appointments where idempotency_key = $1`, [key], db);
  return row ?? null;
}

export async function getAppointment(id: number, db?: Db): Promise<Appointment | null> {
  const [row] = await query<Appointment>(`select ${COLUMNS} from appointments where id = $1`, [id], db);
  return row ?? null;
}

export async function listLines(appointmentId: number, db?: Db): Promise<AppointmentLine[]> {
  return query<AppointmentLine>(
    `select service_id::int as "serviceId", duration_min as "durationMin",
       price_from_agorot as "priceFromAgorot"
     from appointment_lines where appointment_id = $1 order by position`,
    [appointmentId],
    db,
  );
}

async function insert(
  input: NewAppointment,
  status: "held" | "confirmed",
  holdMin: number | null,
  db?: Db,
): Promise<SlotResult> {
  if (input.idempotencyKey) {
    const existing = await getByIdempotencyKey(input.idempotencyKey, db);
    if (existing) return { ok: true, appointment: existing };
  }
  try {
    const appointment = await withTransaction(async (client) => {
      await lockSchedule(client);
      await releaseExpiredHolds(new Date(), client);
      const [row] = await query<Appointment>(
        `insert into appointments
           (customer_id, starts_at, ends_at, status, hold_expires_at, created_by, source, notes, idempotency_key)
         values ($1, $2, $3, $4, now() + make_interval(mins => $5::int), $6, $7, $8, $9)
         returning ${COLUMNS}`,
        [
          input.customerId,
          input.start,
          input.end,
          status,
          holdMin,
          input.createdBy,
          JSON.stringify(input.source ?? {}),
          input.notes ?? null,
          input.idempotencyKey ?? null,
        ],
        client,
      );
      for (const [index, line] of input.lines.entries()) {
        await query(
          `insert into appointment_lines (appointment_id, position, service_id, duration_min, price_from_agorot)
           values ($1, $2, $3, $4, $5)`,
          [row!.id, index + 1, line.serviceId, line.durationMin, line.priceFromAgorot],
          client,
        );
      }
      return row!;
    }, db);
    return { ok: true, appointment };
  } catch (error) {
    // The same form sent twice at once: the other request won, return its
    // booking. Either constraint can fire first, so check the key for both.
    if ((isDuplicateKey(error) || isOverlap(error)) && input.idempotencyKey) {
      const existing = await getByIdempotencyKey(input.idempotencyKey, db);
      if (existing) return { ok: true, appointment: existing };
    }
    if (isOverlap(error)) return { ok: false, reason: "SlotTaken" };
    throw error;
  }
}

/** Takes the slot for `holdMin` minutes while the customer enters the code. */
export async function createHold(input: NewAppointment, holdMin: number, db?: Db): Promise<SlotResult> {
  return insert(input, "held", holdMin, db);
}

/** Owner and imported bookings skip the hold, under the same no-overlap rule. */
export async function createConfirmed(input: NewAppointment, db?: Db): Promise<SlotResult> {
  return insert(input, "confirmed", null, db);
}

/** Confirms a hold that has not expired. Returns null when the hold is gone. */
export async function confirm(id: number, db?: Db): Promise<Appointment | null> {
  const [row] = await query<Appointment>(
    `update appointments set status = 'confirmed', hold_expires_at = null, updated_at = now()
     where id = $1 and status = 'held' and hold_expires_at > now()
     returning ${COLUMNS}`,
    [id],
    db,
  );
  return row ?? null;
}

/**
 * Moves a live booking in place: the old slot is freed and the new one taken together, or neither.
 * Its live private links now last until the new end, so the link the customer already has keeps working.
 */
export async function move(id: number, start: Date, end: Date, db?: Db): Promise<SlotResult | null> {
  try {
    const [row] = await withTransaction(async (client) => {
      await lockSchedule(client);
      const rows = await query<Appointment>(
        `update appointments set starts_at = $2, ends_at = $3, updated_at = now()
         where id = $1 and status in ('held', 'confirmed')
         returning ${COLUMNS}`,
        [id, start, end],
        client,
      );
      if (rows.length > 0) {
        await query(
          "update manage_tokens set expires_at = $2 where appointment_id = $1 and revoked_at is null",
          [id, end],
          client,
        );
      }
      return rows;
    }, db);
    return row ? { ok: true, appointment: row } : null;
  } catch (error) {
    if (isOverlap(error)) return { ok: false, reason: "SlotTaken" };
    throw error;
  }
}

async function setStatus(id: number, to: AppointmentStatus, from: AppointmentStatus[], db?: Db) {
  const [row] = await query<Appointment>(
    `update appointments set status = $2, hold_expires_at = null, updated_at = now()
     where id = $1 and status = any($3)
     returning ${COLUMNS}`,
    [id, to, from],
    db,
  );
  return row ?? null;
}

/** Cancels a booking and revokes its private links. */
export async function cancel(id: number, db?: Db): Promise<Appointment | null> {
  return withTransaction(async (client) => {
    const row = await setStatus(id, "cancelled", ["held", "confirmed"], client);
    if (row) {
      await query(
        "update manage_tokens set revoked_at = now() where appointment_id = $1 and revoked_at is null",
        [id],
        client,
      );
    }
    return row;
  }, db);
}

export async function markCompleted(id: number, db?: Db): Promise<Appointment | null> {
  return setStatus(id, "completed", ["confirmed", "no_show"], db);
}

export async function markNoShow(id: number, db?: Db): Promise<Appointment | null> {
  return withTransaction(async (client) => {
    const row = await setStatus(id, "no_show", ["confirmed", "completed"], client);
    if (row) {
      await query("update customers set no_show_count = no_show_count + 1 where id = $1", [row.customerId], client);
    }
    return row;
  }, db);
}

/** Frees slots whose code was not entered in time. Returns how many were released. */
export async function releaseExpiredHolds(now: Date = new Date(), db?: Db): Promise<number> {
  const rows = await query(
    `update appointments set status = 'released', updated_at = now()
     where status = 'held' and hold_expires_at <= $1
     returning id`,
    [now],
    db,
  );
  return rows.length;
}

/** Live bookings (held or confirmed) that overlap [start, end), for free-time checks and the calendar. */
export async function listForRange(
  start: Date,
  end: Date,
  opts: { includeInactive?: boolean } = {},
  db?: Db,
): Promise<Appointment[]> {
  return query<Appointment>(
    `select ${COLUMNS} from appointments
     where starts_at < $2 and ends_at > $1
       ${opts.includeInactive ? "" : "and status in ('held', 'confirmed') and (status <> 'held' or hold_expires_at > now())"}
     order by starts_at`,
    [start, end],
    db,
  );
}

export async function issueManageToken(appointmentId: number, token: string, expiresAt: Date, db?: Db): Promise<void> {
  await query(
    "insert into manage_tokens (appointment_id, token_hash, expires_at) values ($1, $2, $3)",
    [appointmentId, hashToken(token), expiresAt],
    db,
  );
}

/** The booking behind a private link, or null if the link is unknown, expired or revoked. */
export async function getByToken(token: string, db?: Db): Promise<Appointment | null> {
  const [row] = await query<Appointment>(
    `select ${COLUMNS} from appointments
     where id = (select appointment_id from manage_tokens
                 where token_hash = $1 and revoked_at is null and expires_at > now())`,
    [hashToken(token)],
    db,
  );
  return row ?? null;
}
