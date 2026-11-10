import { type Db, query } from "./db";

// The owner's devices that get push alerts. Reading them is in owner-data.ts.

/** Stores a device's push subscription for a staff member; the same device again replaces its row. */
export async function saveOwnerDevice(
  staffId: number,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  label: string | null,
  db?: Db,
): Promise<void> {
  await query(
    `insert into push_subscriptions (staff_id, endpoint, p256dh, auth, device_label)
     values ($1, $2, $3, $4, left($5, 200))
     on conflict (endpoint) do update set staff_id = excluded.staff_id, customer_id = null,
       p256dh = excluded.p256dh, auth = excluded.auth, device_label = excluded.device_label`,
    [staffId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, label],
    db,
  );
}

export async function removeOwnerDevice(id: number, db?: Db): Promise<void> {
  await query("delete from push_subscriptions where id = $1 and staff_id is not null", [id], db);
}

/** Notes that a push reached the device with this address. False when no device has it. */
export async function confirmPushReceipt(endpoint: string, db?: Db): Promise<boolean> {
  const rows = await query("update push_subscriptions set last_receipt_at = now() where endpoint = $1 returning id", [endpoint], db);
  return rows.length > 0;
}
