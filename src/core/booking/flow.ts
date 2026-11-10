// The customer's booking steps after choosing a time: hold the slot, prove the
// phone (by code, or by a trusted device), confirm. Also what the private-link
// page reads and the consent switch it offers.
import type { Locale } from "../../i18n/locales";
import { z } from "zod";
import { type Db, getPool, query, withTransaction } from "../platform/db";
import { checkCode, type CodeChannel, issueCode, type IssueResult } from "../platform/identity/codes";
import { hit, LIMITS } from "../platform/identity/rateLimit";
import { issueTrustedDevice, resolveManageToken, resolveTrustedDevice } from "./manageTokens";
import * as appointments from "./appointments";
import type { Appointment } from "./appointments";
import * as customers from "./customers";
import { Notify } from "../platform/notify";
import { getSettings } from "../platform/settings";
import { type BookingError, type Confirmed, confirmBooking, type Context, requestHold } from "./service";
import { describeLines } from "./lines";
import { translatedSql } from "../platform/translation";

type HoldInput = Parameters<typeof requestHold>[0];

export type StartResult =
  /** The device was trusted, so the booking is already confirmed. */
  | { ok: true; confirmed: Confirmed }
  | {
      ok: true;
      held: { appointmentId: number; holdExpiresAt: Date };
      code: IssueResult;
      /** The verified email on file that the typed one would replace, or null. */
      emailOnFile: string | null;
    }
  | { ok: false; reason: BookingError };

/**
 * Where an emailed code goes. One email per phone: when the phone's customer
 * already has a verified email and another was typed, the code goes to the
 * one on file, so only its owner can replace it. Otherwise to the typed one.
 */
async function codeEmail(
  customerId: number,
  typed: string | null,
  db: Db,
): Promise<{ to: string | null; onFile: string | null }> {
  const onFile = await customers.getEmail(customerId, db);
  if (typed && onFile?.verified && onFile.value !== typed.trim().toLowerCase()) {
    return { to: onFile.value, onFile: onFile.value };
  }
  return { to: typed, onFile: null };
}

/**
 * Takes the slot and either confirms it at once (a trusted device of the same
 * phone's customer) or sends a code. A code that cannot be sent still leaves
 * the hold, so the page can offer email or "call the salon".
 */
export async function startBooking(
  input: HoldInput,
  deviceToken: string | undefined,
  ctx: Context = {},
): Promise<StartResult> {
  const db = ctx.db ?? getPool();
  const held = await requestHold(input, ctx);
  if (!held.ok) return held;
  const trustedCustomer = await resolveTrustedDevice(deviceToken, db);
  if (trustedCustomer !== null && trustedCustomer === held.hold.customerId) {
    // This browser already proved the customer, so the email they typed becomes theirs.
    if (input.email) await customers.setEmail(held.hold.customerId, input.email, { verify: true, takeOver: false }, db);
    const confirmed = await confirmBooking(held.hold.appointmentId, ctx);
    if (!confirmed.ok) return confirmed;
    return { ok: true, confirmed: confirmed.booking };
  }
  const email = await codeEmail(held.hold.customerId, input.email ?? null, db);
  const code = await issueCode(
    {
      appointmentId: held.hold.appointmentId,
      customerId: held.hold.customerId,
      address: input.address,
      email: email.to,
      locale: ctx.locale,
    },
    db,
  );
  return {
    ok: true,
    held: { appointmentId: held.hold.appointmentId, holdExpiresAt: held.hold.holdExpiresAt },
    code,
    emailOnFile: email.onFile,
  };
}

/** Sends the code again, by WhatsApp or by email, under the same limits, in the page's language. */
export async function resendCode(
  appointmentId: number,
  channel: CodeChannel,
  address: string,
  db: Db = getPool(),
  locale?: Locale,
  email: string | null = null,
): Promise<(IssueResult & { onFile?: string | null }) | { ok: false; reason: "HoldExpired" }> {
  const hold = await liveHold(appointmentId, db);
  if (!hold) return { ok: false, reason: "HoldExpired" };
  const { to, onFile } = await codeEmail(hold.customerId, email, db);
  const result = await issueCode({ appointmentId, customerId: hold.customerId, address, prefer: channel, locale, email: to }, db);
  return result.ok ? { ...result, onFile } : result;
}

async function liveHold(appointmentId: number, db: Db): Promise<{ customerId: number } | null> {
  const [row] = await query<{ customerId: number }>(
    `select customer_id::int as "customerId" from appointments
     where id = $1 and status = 'held' and hold_expires_at > now()`,
    [appointmentId],
    db,
  );
  return row ?? null;
}

export type VerifyResult =
  | { ok: true; confirmed: Confirmed; device: { raw: string; expiresAt: Date } }
  | { ok: false; reason: "Wrong" | "Expired" | "TooManyAttempts" | "RateLimited" | BookingError };

/**
 * Checks the code, marks the contact verified, confirms the booking and trusts
 * this device. `keepEmail` is the email typed for this booking when the
 * customer keeps it: once the code proves who they are, it becomes their one
 * email (replacing the one on file, if they chose to).
 */
export async function verifyAndConfirm(
  appointmentId: number,
  code: string,
  address: string,
  ctx: Context = {},
  keepEmail: string | null = null,
): Promise<VerifyResult> {
  const db = ctx.db ?? getPool();
  const limit = LIMITS.verifyPerAddressPerHour;
  if (!(await hit(`verify:address:${address}`, limit.windowMin, limit.max, db))) {
    return { ok: false, reason: "RateLimited" };
  }
  const hold = await liveHold(appointmentId, db);
  if (!hold) return { ok: false, reason: "HoldExpired" };
  const checked = await checkCode(appointmentId, code, db);
  if (!checked.ok) return checked;
  await customers.markVerified(checked.channel === "email" ? "email" : "phone", checked.contact, db);
  if (keepEmail) {
    // The address itself is proven only when the code went to it; then it may move from another record.
    const provenItself = checked.channel === "email" && checked.contact === keepEmail.trim().toLowerCase();
    await customers.setEmail(hold.customerId, keepEmail, { verify: true, takeOver: provenItself }, db);
  }
  const confirmed = await confirmBooking(appointmentId, ctx);
  if (!confirmed.ok) return confirmed;
  const device = await issueTrustedDevice(confirmed.booking.appointment.customerId, db);
  return { ok: true, confirmed: confirmed.booking, device };
}

export type BookingView = {
  appointment: Appointment;
  customerName: string;
  lines: {
    /** A name an extension gives the line, such as a pet's name. */
    label: string | null;
    /** The service name in the page's language. */
    serviceName: string;
    durationMin: number;
    priceFromAgorot: number;
  }[];
  /** Before the cutoff the customer may move or cancel online; after it, only call. */
  canChange: boolean;
  messagesOn: boolean;
  /** Where this booking's messages go now, masked, as the worker will choose; null when nowhere. */
  messagesTo: { channel: "messaging" | "email"; to: string } | null;
};

/** The channel and masked address the worker will use for this customer's booking messages. */
async function messagesTarget(customerId: number, db: Db): Promise<BookingView["messagesTo"]> {
  const to = await Notify.recipient(customerId, db);
  const [first] = await Notify.plan("confirmation", to, db);
  if (first === "messaging" && to.phone) return { channel: "messaging", to: customers.maskPhone(to.phone) };
  if (first === "email" && to.email) return { channel: "email", to: customers.maskEmail(to.email) };
  return null;
}

/** What the private-link page shows, in `ctx.locale`. Null for an unknown, expired or revoked link. */
export async function bookingView(token: string, ctx: Context = {}): Promise<BookingView | null> {
  const db = ctx.db ?? getPool();
  const now = ctx.now ?? new Date();
  const appointment = await resolveManageToken(token, db);
  if (!appointment) return null;
  const settings = await getSettings(db);
  const customer = await customers.getCustomer(appointment.customerId, db);
  const rows = await query<BookingView["lines"][number] & { position: number }>(
    `select ap.position, null as label,
       ${translatedSql("service", "name", "s.id", "s.name_he", ctx.locale)} as "serviceName", ap.duration_min as "durationMin",
       ap.price_from_agorot as "priceFromAgorot"
     from appointment_lines ap
     join services s on s.id = ap.service_id
     where ap.appointment_id = $1 order by ap.position`,
    [appointment.id],
    db,
  );
  const described = await describeLines([appointment.id], ctx.locale, db);
  const lines = rows.map(({ position, ...line }) => ({ ...line, label: described(appointment.id, position).label }));
  const [consent] = await query<{ on: boolean }>(
    `select coalesce((select revoked_at is null from consents
       where customer_id = $1 and purpose = 'appointment_messages'
       order by greatest(granted_at, coalesce(revoked_at, granted_at)) desc, id desc limit 1), true) as on`,
    [appointment.customerId],
    db,
  );
  const cutoff = appointment.start.getTime() - settings["booking.cutoffHours"] * 60 * 60_000;
  return {
    appointment,
    customerName: customer?.displayName ?? "",
    lines,
    canChange: appointments.changeable(appointment) && now.getTime() < cutoff,
    messagesOn: consent?.on ?? true,
    messagesTo: await messagesTarget(appointment.customerId, db),
  };
}

const ConsentInput = z.object({ token: z.string(), on: z.boolean() });

/** Turns appointment messages off or back on from the private link. */
export async function setMessageConsent(input: z.input<typeof ConsentInput>, db: Db = getPool()): Promise<boolean> {
  const { token, on } = ConsentInput.parse(input);
  return withTransaction(async (client) => {
    const appointment = await resolveManageToken(token, client);
    if (!appointment) return false;
    if (on) {
      await query(
        `insert into consents (customer_id, purpose, source) values ($1, 'appointment_messages', 'private_link')`,
        [appointment.customerId],
        client,
      );
    } else {
      // Revokes the live grant, or records the refusal when there was none.
      await query(
        `with revoked as (
           update consents set revoked_at = now()
           where customer_id = $1 and purpose = 'appointment_messages' and revoked_at is null
           returning id)
         insert into consents (customer_id, purpose, source, revoked_at)
         select $1, 'appointment_messages', 'private_link', now() where not exists (select 1 from revoked)`,
        [appointment.customerId],
        client,
      );
    }
    return true;
  }, db);
}
