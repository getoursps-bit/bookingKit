import { extensions } from "@/extension/registry";
import { type Db, query, withTransaction } from "../db";
import type { Locale } from "@/i18n/locales";

export type Customer = {
  id: number;
  displayName: string;
  phoneE164: string | null;
  notes: string | null;
  noShowCount: number;
  source: "online" | "owner" | "import";
  erasedAt: Date | null;
};

const CUSTOMER_COLUMNS = `id::int, display_name as "displayName", phone_e164 as "phoneE164", notes,
  no_show_count as "noShowCount", source, erased_at as "erasedAt"`;

export async function getCustomer(id: number, db?: Db): Promise<Customer | null> {
  const [row] = await query<Customer>(`select ${CUSTOMER_COLUMNS} from customers where id = $1`, [id], db);
  return row ?? null;
}

/**
 * Finds the customer with this phone or creates one. An existing customer's
 * name is kept: a booking form must not rename someone else's record.
 */
export async function findOrCreateByPhone(
  phoneE164: string,
  displayName: string,
  source: Customer["source"],
  db?: Db,
): Promise<Customer> {
  const [row] = await query<Customer>(
    `with inserted as (
       insert into customers (display_name, phone_e164, source) values ($1, $2, $3)
       on conflict (phone_e164) do nothing
       returning ${CUSTOMER_COLUMNS}
     )
     select * from inserted
     union all
     select ${CUSTOMER_COLUMNS} from customers where phone_e164 = $2 and not exists (select 1 from inserted)`,
    [displayName, phoneE164, source],
    db,
  );
  // A parallel insert of the same phone can hide the row from this statement's
  // snapshot; a second read sees it.
  const customer =
    row ??
    (await query<Customer>(`select ${CUSTOMER_COLUMNS} from customers where phone_e164 = $1`, [phoneE164], db))[0];
  if (!customer) throw new Error("Customer insert lost");
  await addContact(customer.id, "phone", phoneE164, db);
  return customer;
}

/** The language the customer last booked in; their messages follow it. */
export async function setLocale(customerId: number, locale: Locale, db?: Db): Promise<void> {
  await query("update customers set locale = $2 where id = $1 and locale <> $2", [customerId, locale], db);
}

export async function addContact(customerId: number, kind: "phone" | "email", value: string, db?: Db): Promise<void> {
  await query(
    `insert into customer_contacts (customer_id, kind, value) values ($1, $2, $3)
     on conflict (kind, value) do nothing`,
    [customerId, kind, kind === "email" ? value.trim().toLowerCase() : value],
    db,
  );
}

/** The customer's email: the verified one first, then the newest. */
export async function getEmail(customerId: number, db?: Db): Promise<{ value: string; verified: boolean } | null> {
  const [row] = await query<{ value: string; verified: boolean }>(
    `select value, verified_at is not null as verified from customer_contacts
     where customer_id = $1 and kind = 'email' order by verified_at desc nulls last, id desc limit 1`,
    [customerId],
    db,
  );
  return row ?? null;
}

/**
 * Makes `email` the customer's one email and removes any other. `verify`
 * marks it confirmed: the customer proved who they are and chose it. An
 * address another record holds moves here only when nobody verified it
 * there, or when `takeOver` says this customer proved the address itself.
 * Returns false, changing nothing, when the address stays with the other record.
 */
export async function setEmail(
  customerId: number,
  email: string,
  opts: { verify: boolean; takeOver: boolean },
  db?: Db,
): Promise<boolean> {
  const value = email.trim().toLowerCase();
  const [row] = await query<{ customerId: number }>(
    `insert into customer_contacts (customer_id, kind, value, verified_at)
     values ($1, 'email', $2, case when $3::boolean then now() end)
     on conflict (kind, value) do update set
       customer_id = excluded.customer_id,
       verified_at = case
         when customer_contacts.customer_id = excluded.customer_id
           then coalesce(customer_contacts.verified_at, excluded.verified_at)
         else excluded.verified_at end
     where customer_contacts.customer_id = excluded.customer_id or customer_contacts.verified_at is null or $4::boolean
     returning customer_id::int as "customerId"`,
    [customerId, value, opts.verify, opts.takeOver],
    db,
  );
  if (row?.customerId !== customerId) return false;
  await query(`delete from customer_contacts where customer_id = $1 and kind = 'email' and value <> $2`, [customerId, value], db);
  return true;
}

/** "k***@proton.me": enough for the owner of the address to recognise it. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/** "***1234": the last four digits of a phone number. */
export function maskPhone(phone: string): string {
  return `***${phone.replace(/\D/g, "").slice(-4)}`;
}

export async function markVerified(kind: "phone" | "email", value: string, db?: Db): Promise<void> {
  await query(
    "update customer_contacts set verified_at = coalesce(verified_at, now()) where kind = $1 and value = $2",
    [kind, kind === "email" ? value.trim().toLowerCase() : value],
    db,
  );
}

/** Moves everything from `dropId` onto `keepId`, then deletes `dropId`. */
export async function merge(keepId: number, dropId: number, db?: Db): Promise<void> {
  if (keepId === dropId) return;
  await withTransaction(async (client) => {
    const tables = [
      // What the extensions hold about a customer moves with them.
      ...extensions().flatMap((extension) => extension.customerData?.tables ?? []),
      "appointments",
      "consents",
      "trusted_devices",
      "push_subscriptions",
      "message_outbox",
      "inbound_messages",
    ];
    for (const table of tables) {
      await query(`update ${table} set customer_id = $1 where customer_id = $2`, [keepId, dropId], client);
    }
    // Contacts already on the kept record would clash; drop those duplicates.
    await query(
      `delete from customer_contacts d using customer_contacts k
       where d.customer_id = $2 and k.customer_id = $1 and k.kind = d.kind and k.value = d.value`,
      [keepId, dropId],
      client,
    );
    await query("update customer_contacts set customer_id = $1 where customer_id = $2", [keepId, dropId], client);
    await query(
      `update customers k set
         no_show_count = k.no_show_count + d.no_show_count,
         notes = nullif(concat_ws(E'\\n', k.notes, d.notes), ''),
         phone_e164 = coalesce(k.phone_e164, d.phone_e164)
       from customers d where k.id = $1 and d.id = $2`,
      [keepId, dropId],
      client,
    );
    await query("update customers set phone_e164 = null where id = $1", [dropId], client);
    await query("delete from customers where id = $1", [dropId], client);
  }, db);
}

/** Everything held about one customer, for a data access request. */
export async function exportAll(id: number, db?: Db) {
  const customer = await getCustomer(id, db);
  if (!customer) return null;
  const contacts = await query(
    "select kind, value, verified_at from customer_contacts where customer_id = $1",
    [id],
    db,
  );
  // Each extension adds what it holds, under its own keys.
  const extra: Record<string, unknown> = {};
  for (const extension of extensions()) Object.assign(extra, await extension.customerData?.export?.(id, db));
  const appointments = await query(
    `select a.id::int, a.starts_at, a.ends_at, a.status, a.notes, a.created_at,
         coalesce(json_agg(json_build_object('service_id', p.service_id,
           'duration_min', p.duration_min, 'price_from_agorot', p.price_from_agorot)
           order by p.position) filter (where p.position is not null), '[]') as lines
       from appointments a left join appointment_lines p on p.appointment_id = a.id
       where a.customer_id = $1 group by a.id order by a.starts_at`,
    [id],
    db,
  );
  const consents = await query(
    "select purpose, channel, granted_at, revoked_at, source from consents where customer_id = $1",
    [id],
    db,
  );
  return { customer, contacts, ...extra, appointments, consents };
}

/**
 * Deletes personal data on request. Bookings stay, without notes, so the
 * salon's records and counts still add up.
 */
export async function erase(id: number, db?: Db): Promise<void> {
  await withTransaction(async (client) => {
    await query(
      `update customers set display_name = 'נמחק', phone_e164 = null, notes = null, dibs_ref = null,
         erased_at = now()
       where id = $1`,
      [id],
      client,
    );
    const extra = extensions().flatMap((extension) => extension.customerData?.tables ?? []);
    for (const table of ["customer_contacts", ...extra, "trusted_devices", "push_subscriptions", "consents"]) {
      await query(`delete from ${table} where customer_id = $1`, [id], client);
    }
    for (const extension of extensions()) await extension.customerData?.erase?.(id, client);
    await query("update appointments set notes = null, source = '{}'::jsonb where customer_id = $1", [id], client);
    await query("update message_outbox set data = '{}'::jsonb where customer_id = $1", [id], client);
    await query("update inbound_messages set body = null, from_number = 'erased' where customer_id = $1", [id], client);
  }, db);
}
