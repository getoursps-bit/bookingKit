import { type Db, getPool, query } from "../db";
import type { AppointmentStatus } from "../repos/appointments";
import type { Locale } from "@/i18n/locales";

/** The service name column in the owner's language: English when filled, Hebrew otherwise. */
function serviceName(locale: Locale | undefined): string {
  return locale === "en" ? "coalesce(nullif(s.name_en, ''), s.name_he)" : "s.name_he";
}

// Read-only queries behind the admin pages.

export type AdminBooking = {
  id: number;
  start: Date;
  end: Date;
  status: AppointmentStatus;
  customerId: number;
  customerName: string;
  phone: string | null;
  notes: string | null;
  createdBy: string;
  lines: {
    petName: string | null;
    serviceName: string;
    /** The vet or clinic named when booking online. */
    vetName: string | null;
    /** The customer said the pet has a vaccination certificate. */
    vaccinesConfirmed: boolean;
  }[];
  /** The AI pre-visit note, when one was written. */
  summary: string | null;
};

/** Bookings that touch [start, end), with their customer and pets, for the calendar and the day view. */
export async function bookingsBetween(
  start: Date,
  end: Date,
  opts: { statuses?: AppointmentStatus[]; locale?: Locale } = {},
  db: Db = getPool(),
): Promise<AdminBooking[]> {
  return query<AdminBooking>(
    `select a.id::int, a.starts_at as start, a.ends_at as "end", a.status, a.customer_id::int as "customerId",
       c.display_name as "customerName", c.phone_e164 as phone, a.notes, a.created_by as "createdBy",
       coalesce((select json_agg(json_build_object('petName', p.name, 'serviceName', ${serviceName(opts.locale)},
                   'vetName', p.vet_name, 'vaccinesConfirmed', p.vaccines_confirmed_at is not null) order by ap.position)
                 from appointment_pets ap join services s on s.id = ap.service_id
                 left join pets p on p.id = ap.pet_id
                 where ap.appointment_id = a.id), '[]') as lines,
       (select j.result->>'textHe' from ai_jobs j where j.kind = 'summary' and j.status = 'done'
          and j.appointment_id = a.id order by j.id desc limit 1) as summary
     from appointments a join customers c on c.id = a.customer_id
     where a.starts_at < $2 and a.ends_at > $1 and a.status = any($3)
     order by a.starts_at`,
    [start, end, opts.statuses ?? ["confirmed", "completed", "no_show"]],
    db,
  );
}

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

export type CustomerHit = { id: number; name: string; phone: string | null; bookings: number };

/** Customers whose name contains the words or whose phone contains the digits. */
export async function searchCustomers(text: string, db: Db = getPool()): Promise<CustomerHit[]> {
  const term = text.trim();
  if (!term) return [];
  const digits = term.replace(/\D/g, "").replace(/^0/, "");
  return query<CustomerHit>(
    `select c.id::int, c.display_name as name, c.phone_e164 as phone,
       (select count(*)::int from appointments a where a.customer_id = c.id) as bookings
     from customers c
     where c.erased_at is null
       and (c.display_name ilike '%' || $1 || '%' or ($2 <> '' and c.phone_e164 like '%' || $2 || '%'))
     order by c.display_name limit 50`,
    [term, digits.length >= 3 ? digits : ""],
    db,
  );
}

export type CustomerBooking = { id: number; start: Date; status: AppointmentStatus; services: string };

/** One customer's bookings, newest first, for the customer record. */
export async function customerBookings(
  customerId: number,
  locale: Locale = "he",
  db: Db = getPool(),
): Promise<CustomerBooking[]> {
  return query<CustomerBooking>(
    `select a.id::int, a.starts_at as start, a.status,
       coalesce((select string_agg(${serviceName(locale)}, ', ' order by ap.position)
                 from appointment_pets ap join services s on s.id = ap.service_id
                 where ap.appointment_id = a.id), '') as services
     from appointments a
     where a.customer_id = $1 and a.status in ('confirmed', 'completed', 'no_show', 'cancelled')
     order by a.starts_at desc limit 100`,
    [customerId],
    db,
  );
}

export type ConsentRow = { purpose: string; channel: string | null; grantedAt: Date; revokedAt: Date | null };

export async function customerConsents(customerId: number, db: Db = getPool()): Promise<ConsentRow[]> {
  return query<ConsentRow>(
    `select purpose, channel, granted_at as "grantedAt", revoked_at as "revokedAt"
     from consents where customer_id = $1 order by granted_at desc`,
    [customerId],
    db,
  );
}
