import { type Db, query } from "../../src/server/db";
import { getFeatures } from "../../src/server/features";
import { addOwnerEvent } from "../../src/server/repos/events";
import { enqueue, monthlyCount } from "../../src/server/repos/outbox";
import { getSettings } from "../../src/server/repos/settings";
import { localDateOf } from "../../src/server/time";
import { claimMonthly } from "./schedule";

const RECEIPT_WINDOW_H = 6;

/**
 * The daily check push, queued like any other message (08:00). Each owner
 * device answers it with a receipt, which proves alerts still arrive.
 */
export async function queueDailyCheck(now: Date, db: Db): Promise<void> {
  if (!getFeatures().ownerPush) return;
  await enqueue(
    [{ kind: "owner_check", templateKey: "owner_check", dedupeKey: `owner_check:${localDateOf(now)}` }],
    db,
  );
}

/**
 * At 14:00: when owner devices exist but none answered in six hours, the owner
 * gets an email that alerts have stopped, and an event in the admin.
 */
export async function checkReceipts(now: Date, db: Db): Promise<boolean> {
  if (!getFeatures().ownerPush) return false;
  const [row] = await query<{ devices: number; recent: number }>(
    `select count(*)::int as devices,
       count(*) filter (where last_receipt_at > $1::timestamptz - make_interval(hours => $2::int))::int as recent
     from push_subscriptions where staff_id is not null`,
    [now, RECEIPT_WINDOW_H],
    db,
  );
  if (!row || row.devices === 0 || row.recent > 0) return false;
  await addOwnerEvent("alerts_stopped", null, { devices: row.devices }, { silent: true }, db);
  await enqueue(
    [
      {
        kind: "owner_check",
        templateKey: "owner_check",
        data: { via: "email" },
        dedupeKey: `owner_check_email:${localDateOf(now)}`,
      },
    ],
    db,
  );
  return true;
}

/** Tells the owner once a month at 80% and again at 100% of the message cap. */
export async function checkMessageCap(now: Date, db: Db): Promise<void> {
  const cap = (await getSettings(db))["cap.messagesMonthly"];
  if (cap <= 0) return;
  const percent = Math.floor(((await monthlyCount(now, db)) / cap) * 100);
  for (const level of [80, 100]) {
    if (percent >= level && (await claimMonthly(`message_cap_${level}`, now, db))) {
      await addOwnerEvent("message_cap", null, { percent: level }, {}, db);
    }
  }
}
