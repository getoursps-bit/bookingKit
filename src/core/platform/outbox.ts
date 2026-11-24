import { type Db, query } from "./db";

export type OutboxKind =
  | "code"
  | "confirmation"
  | "reminder"
  | "customer_change"
  | "owner_change"
  | "import_link"
  | "owner_alert"
  | "owner_check"
  | "auto_reply"
  | "staff_code"
  | "staff_reset"
  /** A customer message kind an extension brings (its manifest's `customerMessages`). */
  | (string & {});
export type Channel = "messaging" | "email" | "push";
export type OutboxStatus = "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "skipped";

export type NewOutboxRow = {
  kind: OutboxKind;
  templateKey: string;
  appointmentId?: number | null;
  customerId?: number | null;
  staffId?: number | null;
  data?: Record<string, unknown>;
  sendAt?: Date;
  /** Stops the same message being queued twice, for example `reminder:<id>:<start>`. */
  dedupeKey?: string | null;
};

export type OutboxRow = {
  id: number;
  kind: OutboxKind;
  templateKey: string;
  appointmentId: number | null;
  customerId: number | null;
  staffId: number | null;
  data: Record<string, unknown>;
  sendAt: Date;
  status: OutboxStatus;
  channel: Channel | null;
  triedChannels: Channel[];
  attempts: number;
  providerRef: string | null;
  error: string | null;
};

export const MAX_ATTEMPTS = 5;

const COLUMNS = `id::int, kind, template_key as "templateKey", appointment_id::int as "appointmentId",
  customer_id::int as "customerId", staff_id::int as "staffId", data, send_at as "sendAt", status, channel,
  tried_channels as "triedChannels", attempts, provider_ref as "providerRef", error`;

/** Queues messages. Rows whose dedupe key is already queued are skipped. Returns the new ids. */
export async function enqueue(rows: NewOutboxRow[], db?: Db): Promise<number[]> {
  const ids: number[] = [];
  for (const row of rows) {
    const inserted = await query<{ id: number }>(
      `insert into message_outbox (kind, template_key, appointment_id, customer_id, staff_id, data, send_at, dedupe_key)
       values ($1, $2, $3, $4, $5, $6, coalesce($7, now()), $8)
       on conflict (dedupe_key) do nothing
       returning id::int`,
      [
        row.kind,
        row.templateKey,
        row.appointmentId ?? null,
        row.customerId ?? null,
        row.staffId ?? null,
        JSON.stringify(row.data ?? {}),
        row.sendAt ?? null,
        row.dedupeKey ?? null,
      ],
      db,
    );
    if (inserted[0]) ids.push(inserted[0].id);
  }
  return ids;
}

/**
 * Takes up to `limit` due rows and marks them as sending. Rows already taken by
 * another worker are skipped, so two workers never send the same row.
 */
export async function claimDue(limit: number, now?: Date, db?: Db): Promise<OutboxRow[]> {
  return query<OutboxRow>(
    `update message_outbox set status = 'sending', attempts = attempts + 1, updated_at = now()
     where id in (
       select id from message_outbox
       -- Without a given time the database clock decides, so a host clock that
       -- runs behind it cannot hold back rows queued with now(). A given time
       -- has only milliseconds and send_at has microseconds, hence the 1 ms.
       where status = 'queued'
         and send_at < coalesce($2::timestamptz + interval '1 millisecond', clock_timestamp())
       order by send_at, id
       for update skip locked
       limit $1
     )
     returning ${COLUMNS}`,
    [limit, now ?? null],
    db,
  );
}

/** Takes one queued row for an immediate send (codes), unless a worker already took it. */
export async function claimOne(id: number, db?: Db): Promise<OutboxRow | null> {
  const [row] = await query<OutboxRow>(
    `update message_outbox set status = 'sending', attempts = attempts + 1, updated_at = now()
     where id = (select id from message_outbox where id = $1 and status = 'queued' for update skip locked)
     returning ${COLUMNS}`,
    [id],
    db,
  );
  return row ?? null;
}

export async function markSent(
  id: number,
  sent: { channel: Channel; providerRef: string | null; costAgorot?: number },
  db?: Db,
): Promise<void> {
  await query(
    `update message_outbox set status = 'sent', channel = $2, provider_ref = $3, cost_agorot = $4,
       tried_channels = array_append(tried_channels, $2), error = null, updated_at = now()
     where id = $1`,
    [id, sent.channel, sent.providerRef, sent.costAgorot ?? 0],
    db,
  );
}

/**
 * Records a failed try. With `retryAt` and attempts left, the row goes back to
 * the queue; otherwise it is marked failed for good.
 */
export async function markFailed(
  id: number,
  failure: { channel: Channel | null; error: string; retryAt?: Date },
  db?: Db,
): Promise<OutboxStatus> {
  const [row] = await query<{ status: OutboxStatus }>(
    `update message_outbox set
       status = case when $4::timestamptz is not null and attempts < $5 then 'queued' else 'failed' end,
       send_at = coalesce($4, send_at),
       tried_channels = case when $2::text is null then tried_channels else array_append(tried_channels, $2) end,
       error = left($3, 500), updated_at = now()
     where id = $1
     returning status`,
    [id, failure.channel, failure.error, failure.retryAt ?? null, MAX_ATTEMPTS],
    db,
  );
  return row?.status ?? "failed";
}

export async function markSkipped(id: number, reason: string, db?: Db): Promise<void> {
  await query(
    "update message_outbox set status = 'skipped', error = $2, updated_at = now() where id = $1",
    [id, reason],
    db,
  );
}

const STATUS_ORDER: Record<string, number> = { sending: 0, sent: 1, delivered: 2, read: 3 };

/**
 * Applies a provider delivery callback. Status only moves forward, so a repeated
 * or late callback changes nothing. Returns the row when it changed.
 */
export async function applyStatusCallback(
  providerRef: string,
  status: "sent" | "delivered" | "read" | "failed",
  error?: string,
  db?: Db,
): Promise<OutboxRow | null> {
  const [current] = await query<OutboxRow>(
    `select ${COLUMNS} from message_outbox where provider_ref = $1`,
    [providerRef],
    db,
  );
  if (!current) return null;
  if (current.status === "failed" || current.status === "skipped") return null;
  if (status !== "failed" && (STATUS_ORDER[status] ?? 0) <= (STATUS_ORDER[current.status] ?? 0)) return null;
  const [row] = await query<OutboxRow>(
    `update message_outbox set status = $2, error = coalesce($3, error), updated_at = now()
     where id = $1 returning ${COLUMNS}`,
    [current.id, status, error ?? null],
    db,
  );
  return row ?? null;
}

/**
 * After WhatsApp reports a message failed, puts the row back in the queue so
 * the worker asks `route()` for the next channel. WhatsApp is already in
 * `tried_channels`, so this happens once.
 */
export async function requeueForNextChannel(id: number, db?: Db): Promise<void> {
  await query(
    `update message_outbox set status = 'queued', send_at = now(), provider_ref = null, updated_at = now()
     where id = $1 and status = 'failed' and kind <> 'code'`,
    [id],
    db,
  );
}

/** Customer messages sent this calendar month (UTC), for the monthly cap. Owner alerts do not count. */
export async function monthlyCount(now: Date = new Date(), db?: Db): Promise<number> {
  const [row] = await query<{ count: number }>(
    `select count(*)::int as count from message_outbox
     where channel in ('messaging', 'email') and kind not in ('owner_alert', 'owner_check', 'staff_code', 'staff_reset')
       and status in ('sent', 'delivered', 'read')
       and created_at >= date_trunc('month', $1::timestamptz)`,
    [now],
    db,
  );
  return row?.count ?? 0;
}

/** Skips queued messages for a booking, for example the old reminder when a booking moves or is cancelled. */
export async function skipQueued(appointmentId: number, kinds: OutboxKind[], reason: string, db?: Db): Promise<number> {
  const rows = await query(
    `update message_outbox set status = 'skipped', error = $3, updated_at = now()
     where appointment_id = $1 and kind = any($2) and status = 'queued'
     returning id`,
    [appointmentId, kinds, reason],
    db,
  );
  return rows.length;
}
