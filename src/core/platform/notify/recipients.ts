import { toLocale } from "../../../i18n/locales";
import { type Db, query } from "../db";
import type { Recipient } from "./routing";

/** A customer's phone, email, message consent and language, as routing needs them. */
export async function customerRecipient(customerId: number, db?: Db): Promise<Recipient> {
  const [row] = await query<{ phone: string | null; email: string | null; optedOut: boolean; locale: string }>(
    `select c.phone_e164 as phone, c.locale,
       (select value from customer_contacts
        where customer_id = c.id and kind = 'email'
        order by verified_at desc nulls last, id desc limit 1) as email,
       exists (select 1 from consents
               where customer_id = c.id and purpose = 'appointment_messages' and revoked_at is not null
                 and not exists (select 1 from consents later
                                 where later.customer_id = c.id and later.purpose = 'appointment_messages'
                                   and later.revoked_at is null and later.granted_at > consents.revoked_at)) as "optedOut"
     from customers c where c.id = $1 and c.erased_at is null`,
    [customerId],
    db,
  );
  return row ? { ...row, locale: toLocale(row.locale) } : { phone: null, email: null, optedOut: true };
}
