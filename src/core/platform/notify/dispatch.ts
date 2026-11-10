import { customerMessage } from "../../../extension/registry";
import { DEFAULT_LOCALE, type Locale, LOCALES, localePath } from "../../../i18n/locales";
import { isMessageKey } from "../../../i18n/keys";
import { type MessageKey } from "../../../i18n/t";
import { translator } from "../../../i18n/translator";
import { getConfig } from "../config";
import { type Db, getPool, query } from "../db";
import { getFeatures } from "../features";
import { issueManageToken } from "../../booking/manageTokens";
import { displayPhone } from "../links";
import { log } from "../log";
import { getAppointment } from "../../booking/appointments";
import { markFailed, markSent, markSkipped, monthlyCount, type OutboxRow } from "../outbox";
import { getSettings } from "../settings";
import { formatLocal } from "../time";
import { driverFor } from "./drivers";
import { deliver } from "./deliver";
import { customerRecipient } from "./recipients";
import { route } from "./routing";

const CHANGE_KEYS: Record<string, MessageKey> = {
  moved: "msg.change.moved",
  cancelled: "msg.change.cancelled",
};

/** Hebrew titles for the owner's email fallback; pushes carry only the type. */
export const OWNER_EVENT_TITLES: Record<string, string> = {
  booking_created: "תור חדש",
  booking_moved: "תור הועבר",
  booking_cancelled: "תור בוטל",
  message_failed: "הודעה ללקוח לא נשלחה",
  reply_received: "הודעה חדשה מלקוח",
  alerts_stopped: "ההתראות הפסיקו להגיע",
  message_cap: "מכסת ההודעות החודשית מתמלאת",
  owner_check: "בדיקה יומית",
};

/**
 * Sends one claimed outbox row. Booking messages get a fresh private link at
 * send time (the outbox never holds one) and are skipped when the booking
 * changed since they were queued. Owner alerts go to every owner device.
 */
export async function dispatch(row: OutboxRow, db: Db = getPool(), now: Date = new Date()): Promise<void> {
  switch (row.kind) {
    case "code":
    case "staff_code":
      // Codes are sent at once by the web app; one left in the queue is stale.
      await markSkipped(row.id, "stale code", db);
      return;
    case "owner_alert":
    case "owner_check":
      await sendToOwners(row, db, now);
      return;
    case "auto_reply":
      await sendAutoReply(row, db);
      return;
    default:
      await sendBookingMessage(row, db, now);
  }
}

async function sendBookingMessage(row: OutboxRow, db: Db, now: Date): Promise<void> {
  const appointment = row.appointmentId ? await getAppointment(row.appointmentId, db) : null;
  if (!appointment || row.customerId === null) {
    await markSkipped(row.id, "booking gone", db);
    return;
  }
  const change = typeof row.data.change === "string" ? row.data.change : null;
  // Confirmed and pending bookings are live: they keep a time and have a private link.
  const confirmed = appointment.status === "confirmed";
  const live = confirmed || appointment.status === "pending";
  if (row.kind === "reminder") {
    // A reminder belongs to one start time; a moved booking has its own.
    const due = appointment.start.getTime() - 24 * 60 * 60_000;
    if (!confirmed || Math.abs(due - row.sendAt.getTime()) > 60_000 || appointment.start <= now) {
      await markSkipped(row.id, "booking changed", db);
      return;
    }
  }
  if ((row.kind === "confirmation" || row.kind === "import_link") && !confirmed) {
    await markSkipped(row.id, "booking no longer confirmed", db);
    return;
  }

  // An extension's own message: it says whether the booking still calls for it, and adds its values.
  const own = customerMessage(row.kind);
  if (own?.still && !(await own.still(appointment, db))) {
    await markSkipped(row.id, "booking changed", db);
    return;
  }
  const more = new Map<Locale, Record<string, string>>();
  if (own?.vars) for (const locale of LOCALES) more.set(locale, await own.vars(appointment, locale, db));

  const base = getConfig().APP_BASE_URL.replace(/\/$/, "");
  let token: string | null = null;
  if (live && appointment.end > now) token = await issueManageToken(appointment.id, appointment.end, db);
  const to = await customerRecipient(row.customerId, db);
  // The private link opens the site in the customer's language; the time and
  // change follow the language the message itself goes out in.
  const linkLocale: Locale = to.locale ?? DEFAULT_LOCALE;
  const link = `${base}${localePath(linkLocale, token ? `/b/${token}` : "/book")}`;
  const vars = (locale: Locale): Record<string, string> => {
    const when = formatLocal(appointment.start, "EEEE dd/MM HH:mm", locale);
    return {
      when,
      link,
      change: change && CHANGE_KEYS[change] ? translator(locale)(CHANGE_KEYS[change], { when }) : "",
      ...more.get(locale),
    };
  };
  await deliver(row, to, vars, { buttonParam: token, db });
}

async function sendAutoReply(row: OutboxRow, db: Db): Promise<void> {
  const to = typeof row.data.to === "string" ? row.data.to : null;
  if (!to) {
    await markSkipped(row.id, "no recipient", db);
    return;
  }
  const settings = await getSettings(db);
  const chat = settings["whatsapp.chatNumber"];
  await deliver(row, { phone: to, email: null }, { chat: chat ? (displayPhone(chat) ?? chat) : "" }, { db });
}

type Subscription = { id: number; endpoint: string; p256dh: string; auth: string };

/** Push to every owner device; dead subscriptions are removed. The email warning goes to the staff addresses. */
async function sendToOwners(row: OutboxRow, db: Db, now: Date): Promise<void> {
  const settings = await getSettings(db);
  const viaEmail = row.data.via === "email";
  const staffEmails = viaEmail
    ? (await query<{ email: string }>("select email from staff order by id", [], db)).map((staff) => staff.email)
    : [];
  const channels = route(
    row.kind,
    { phone: null, email: staffEmails[0] ?? null, prefer: viaEmail ? "email" : undefined },
    { settings, features: getFeatures(), monthlyCount: await monthlyCount(now, db) },
  );
  if (channels.length === 0) {
    await markSkipped(row.id, "no owner channel", db);
    return;
  }

  if (channels[0] === "email") {
    for (const email of staffEmails) {
      await deliver({ ...row }, { phone: null, email, prefer: "email" }, { title: title(row) }, { db });
    }
    return;
  }

  const subscriptions = await query<Subscription>(
    "select id::int, endpoint, p256dh, auth from push_subscriptions where staff_id is not null",
    [],
    db,
  );
  if (subscriptions.length === 0) {
    await markSkipped(row.id, "no owner devices", db);
    return;
  }
  const payload = JSON.stringify({
    type: row.kind === "owner_check" ? "owner_check" : String(row.data.type ?? "owner_alert"),
    time: row.sendAt.toISOString(),
    path: row.appointmentId ? `/admin/calendar?appointment=${row.appointmentId}` : "/admin",
    check: row.kind === "owner_check" ? row.id : undefined,
  });
  let sent = 0;
  let retry = false;
  for (const subscription of subscriptions) {
    const result = await driverFor("push", db).send({
      kind: row.kind,
      templateKey: row.templateKey,
      to: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }),
      body: payload,
    });
    if (result.ok) sent += 1;
    else if (result.gone) await query("delete from push_subscriptions where id = $1", [subscription.id], db);
    else retry ||= result.retry;
  }
  if (sent > 0) {
    await markSent(row.id, { channel: "push", providerRef: null }, db);
    return;
  }
  log.warn({ outboxId: row.id, devices: subscriptions.length }, "owner push not delivered");
  await markFailed(
    row.id,
    {
      channel: retry ? null : "push",
      error: "no device accepted the push",
      retryAt: retry ? new Date(now.getTime() + row.attempts * row.attempts * 60_000) : undefined,
    },
    db,
  );
}

function title(row: OutboxRow): string {
  const type = row.kind === "owner_check" ? "alerts_stopped" : String(row.data.type ?? "");
  if (OWNER_EVENT_TITLES[type]) return OWNER_EVENT_TITLES[type];
  // An extension's event: its title is the string "event.<type>" in its own language files.
  const key = `event.${type}`;
  return isMessageKey(key) ? translator(DEFAULT_LOCALE)(key) : "התראה";
}
