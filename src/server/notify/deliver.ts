import type { Locale } from "../../i18n/locales";
import { type Db, getPool } from "../db";
import { getFeatures } from "../features";
import { log } from "../log";
import { addOwnerEvent } from "../repos/events";
import { markFailed, markSent, monthlyCount, type OutboxRow } from "../repos/outbox";
import { getSettings } from "../repos/settings";
import { channelFor } from "./channels";
import { route, type Recipient } from "./routing";
import { getTemplate, render, type Template } from "./templates";
import type { Channel } from "./types";

/** Template variables, or a function that gives them in the language the message is sent in. */
export type Vars = Record<string, string> | ((locale: Locale) => Record<string, string>);

/** English when the customer booked in English and this template has English text; Hebrew otherwise. */
export function messageLocale(template: Template, to: Recipient): Locale {
  return to.locale === "en" && template.bodyEn?.trim() ? "en" : "he";
}

export type Delivery = { ok: true; channel: Channel } | { ok: false; reason: "NoChannel" | "Failed" | "Retrying" };

/** Minutes to wait before try number `attempt` + 1: 1, 4, 9, 16. */
function backoffMin(attempt: number): number {
  return attempt * attempt;
}

function addressFor(channel: Channel, to: Recipient): string | null {
  if (channel === "whatsapp") return to.phone;
  if (channel === "email") return to.email;
  return null;
}

/**
 * Sends one claimed outbox row. `route()` gives the channels; a channel that
 * cannot reach the person (bad number, no template) moves on to the next one,
 * and a passing fault (timeout, 5xx) puts the row back in the queue with a
 * back-off. `vars` fill the template and are never stored, so codes and
 * private links stay out of the outbox. The text follows the recipient's
 * language when the template has it in that language.
 */
export async function deliver(
  row: OutboxRow,
  to: Recipient,
  vars: Vars,
  opts: { buttonParam?: string | null; db?: Db } = {},
): Promise<Delivery> {
  const db = opts.db ?? getPool();
  const settings = await getSettings(db);
  const channels = route(row.kind, to, {
    settings,
    features: getFeatures(),
    monthlyCount: await monthlyCount(new Date(), db),
  }).filter((channel) => !row.triedChannels.includes(channel));

  let lastError = "no channel";
  for (const channel of channels) {
    const address = addressFor(channel, to);
    const template = await getTemplate(row.templateKey, channel, db);
    if (!address || !template) continue;
    const locale = messageLocale(template, to);
    const filled = typeof vars === "function" ? vars(locale) : vars;
    const { text, params } = render(locale === "en" ? template.bodyEn! : template.bodyHe, filled);
    const result = await channelFor(channel, opts.db).send({
      kind: row.kind,
      templateKey: row.templateKey,
      to: address,
      body: text,
      subject: locale === "en" ? template.subjectEn?.trim() || template.subjectHe : template.subjectHe,
      providerTemplate: template.providerTemplate,
      params,
      buttonParam: opts.buttonParam ?? null,
      locale,
    });
    if (result.ok) {
      await markSent(row.id, { channel, providerRef: result.providerRef, costAgorot: result.costAgorot }, db);
      log.info({ outboxId: row.id, kind: row.kind, channel }, "message sent");
      return { ok: true, channel };
    }
    log.warn({ outboxId: row.id, kind: row.kind, channel, error: result.error }, "message not sent");
    lastError = result.error;
    if (result.retry && row.kind !== "code") {
      const status = await markFailed(
        row.id,
        { channel: null, error: result.error, retryAt: new Date(Date.now() + backoffMin(row.attempts) * 60_000) },
        db,
      );
      if (status === "queued") return { ok: false, reason: "Retrying" };
      break;
    }
    row = { ...row, triedChannels: [...row.triedChannels, channel] };
  }

  await markFailed(row.id, { channel: null, error: lastError }, db);
  if (row.kind !== "code" && row.kind !== "staff_code" && row.kind !== "owner_alert" && row.kind !== "owner_check") {
    await addOwnerEvent("message_failed", row.appointmentId, { outboxId: row.id, kind: row.kind }, {}, db);
  }
  return { ok: false, reason: channels.length === 0 ? "NoChannel" : "Failed" };
}
