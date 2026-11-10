import { type Db, query, withTransaction } from "./db";
import { enqueue, type OutboxRow } from "./outbox";

/**
 * The core's events, and any an extension adds. An extension's event has a
 * string "event.<type>" in its own language files, which is the title the
 * owner reads.
 */
export type OwnerEventType =
  | "booking_created"
  | "booking_moved"
  | "booking_cancelled"
  | "message_failed"
  | "reply_received"
  | "alerts_stopped"
  | "message_cap"
  | (string & {});

export type OwnerEvent = {
  id: number;
  type: OwnerEventType;
  appointmentId: number | null;
  data: Record<string, unknown>;
  createdAt: Date;
  readAt: Date | null;
};

const COLUMNS = `id::int, type, appointment_id::int as "appointmentId", data, created_at as "createdAt",
  read_at as "readAt"`;

/**
 * Records an owner event and, in the same transaction, the alert that tells
 * the owner about it. A silent event (for example the owner's own change) is
 * stored as already read and sends nothing.
 */
export async function addOwnerEvent(
  type: OwnerEventType,
  appointmentId: number | null,
  data: Record<string, unknown> = {},
  opts: { silent?: boolean } = {},
  db?: Db,
): Promise<OwnerEvent> {
  return withTransaction(async (client) => {
    const [event] = await query<OwnerEvent>(
      `insert into owner_events (type, appointment_id, data, read_at)
       values ($1, $2, $3, case when $4 then now() end)
       returning ${COLUMNS}`,
      [type, appointmentId, JSON.stringify(data), opts.silent === true],
      client,
    );
    if (!opts.silent) {
      // The alert carries only the event id and type; the text is built at send time.
      await enqueue(
        [
          {
            kind: "owner_alert",
            templateKey: "owner_alert",
            appointmentId,
            data: { eventId: event!.id, type },
            dedupeKey: `owner_alert:${event!.id}`,
          },
        ],
        client,
      );
    }
    return event!;
  }, db);
}

export async function listUnread(limit = 50, db?: Db): Promise<OwnerEvent[]> {
  return query<OwnerEvent>(
    `select ${COLUMNS} from owner_events where read_at is null order by created_at desc limit $1`,
    [limit],
    db,
  );
}

export async function markRead(ids: number[], db?: Db): Promise<void> {
  await query("update owner_events set read_at = now() where id = any($1) and read_at is null", [ids], db);
}

/** Customer messages that failed for good, newest first, for the admin's "needs a call" list. */
export async function listFailedMessages(limit = 50, db?: Db): Promise<OutboxRow[]> {
  return query<OutboxRow>(
    `select id::int, kind, template_key as "templateKey", appointment_id::int as "appointmentId",
       customer_id::int as "customerId", staff_id::int as "staffId", data, send_at as "sendAt", status, channel,
       tried_channels as "triedChannels", attempts, provider_ref as "providerRef", error
     from message_outbox
     where status = 'failed' and kind not in ('owner_alert', 'owner_check')
     order by updated_at desc limit $1`,
    [limit],
    db,
  );
}

/** Marks every owner event as read. */
export async function markAllRead(db?: Db): Promise<void> {
  await query("update owner_events set read_at = now() where read_at is null", [], db);
}
