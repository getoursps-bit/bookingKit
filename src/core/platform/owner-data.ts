import { type Db, getPool, query } from "./db";

// Read-only queries behind the owner's alerts, inbox and devices.

export type Device = { id: number; label: string | null; lastReceiptAt: Date | null; createdAt: Date };

export async function ownerDevices(db: Db = getPool()): Promise<Device[]> {
  return query<Device>(
    `select id::int, device_label as label, last_receipt_at as "lastReceiptAt", created_at as "createdAt"
     from push_subscriptions where staff_id is not null order by created_at`,
    [],
    db,
  );
}

export type Inbound = { id: number; fromNumber: string; body: string | null; receivedAt: Date; customerName: string | null };

export async function recentReplies(limit = 50, db: Db = getPool()): Promise<Inbound[]> {
  return query<Inbound>(
    `select i.id::int, i.from_number as "fromNumber", i.body, i.received_at as "receivedAt", c.display_name as "customerName"
     from inbound_messages i left join customers c on c.id = i.customer_id
     order by i.received_at desc limit $1`,
    [limit],
    db,
  );
}

export type EventRow = {
  id: number;
  type: string;
  appointmentId: number | null;
  createdAt: Date;
  readAt: Date | null;
};

export async function recentEvents(opts: { unreadOnly?: boolean; limit?: number } = {}, db: Db = getPool()) {
  return query<EventRow>(
    `select id::int, type, appointment_id::int as "appointmentId", created_at as "createdAt", read_at as "readAt"
     from owner_events ${opts.unreadOnly ? "where read_at is null" : ""}
     order by created_at desc limit $1`,
    [opts.limit ?? 50],
    db,
  );
}

export type FailedMessage = {
  id: number;
  kind: string;
  appointmentId: number | null;
  customerName: string | null;
  phone: string | null;
  error: string | null;
  updatedAt: Date;
};

/** Customer messages that could not be sent, so the owner can call instead. */
export async function failedMessages(limit = 50, db: Db = getPool()): Promise<FailedMessage[]> {
  return query<FailedMessage>(
    `select o.id::int, o.kind, o.appointment_id::int as "appointmentId", c.display_name as "customerName",
       c.phone_e164 as phone, o.error, o.updated_at as "updatedAt"
     from message_outbox o left join customers c on c.id = o.customer_id
     where o.status = 'failed' and o.kind not in ('code', 'owner_alert', 'owner_check', 'auto_reply')
       and o.updated_at > now() - interval '30 days'
     order by o.updated_at desc limit $1`,
    [limit],
    db,
  );
}
