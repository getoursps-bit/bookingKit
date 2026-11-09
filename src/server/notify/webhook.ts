import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { type Db, getPool, query, withTransaction } from "../db";
import { log } from "../log";
import { hit } from "../repos/rateLimits";
import { addOwnerEvent } from "../repos/events";
import { applyStatusCallback, enqueue, requeueForNextChannel } from "../repos/outbox";

/** Checks Meta's X-Hub-Signature-256 header against the raw body. */
export function signatureOk(secret: string, rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const Payload = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z
                .object({
                  metadata: z.object({ display_phone_number: z.string().optional() }).optional(),
                  statuses: z
                    .array(
                      z.object({
                        id: z.string(),
                        status: z.enum(["sent", "delivered", "read", "failed"]).or(z.string()),
                        errors: z
                          .array(z.object({ code: z.number().optional(), title: z.string().optional() }))
                          .optional(),
                      }),
                    )
                    .optional(),
                  messages: z
                    .array(
                      z.object({
                        id: z.string(),
                        from: z.string(),
                        type: z.string().optional(),
                        text: z.object({ body: z.string() }).optional(),
                      }),
                    )
                    .optional(),
                })
                .passthrough(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

// Words that mean "stop sending me messages", in Hebrew and English.
const OPT_OUT = /^(הסר|הסרה|עצור|הפסק|stop|unsubscribe)$/i;

/**
 * Handles one webhook call: delivery statuses only update the outbox (a
 * failure sends the row back for the next channel), incoming messages are
 * stored, raise an owner event, may withdraw consent, and get one fixed
 * reply a day. Repeats of the same callback change nothing.
 */
export async function handleWebhook(
  body: unknown,
  db: Db = getPool(),
): Promise<{ statuses: number; messages: number }> {
  const parsed = Payload.safeParse(body);
  if (!parsed.success) return { statuses: 0, messages: 0 };
  let statuses = 0;
  let messages = 0;
  for (const change of parsed.data.entry.flatMap((entry) => entry.changes)) {
    for (const status of change.value.statuses ?? []) {
      if (!["sent", "delivered", "read", "failed"].includes(status.status)) continue;
      const error = status.errors?.[0]
        ? `whatsapp ${status.errors[0].code ?? ""} ${status.errors[0].title ?? ""}`.trim()
        : undefined;
      const row = await applyStatusCallback(
        status.id,
        status.status as "sent" | "delivered" | "read" | "failed",
        error,
        db,
      );
      if (row) {
        statuses += 1;
        if (row.status === "failed") await requeueForNextChannel(row.id, db);
      }
    }
    for (const message of change.value.messages ?? []) {
      const from = `+${message.from.replace(/^\+/, "")}`;
      const text = message.text?.body ?? null;
      const stored = await withTransaction(async (client) => {
        const [inbound] = await query<{ id: number; customerId: number | null }>(
          `insert into inbound_messages (to_number, from_number, body, provider_ref, customer_id)
           values ($1, $2, $3, $4, (select id from customers where phone_e164 = $2))
           on conflict (provider_ref) do nothing
           returning id::int, customer_id::int as "customerId"`,
          [change.value.metadata?.display_phone_number ?? "", from, text, message.id],
          client,
        );
        if (!inbound) return null;
        await addOwnerEvent("reply_received", null, { inboundId: inbound.id }, {}, client);
        if (inbound.customerId && text && OPT_OUT.test(text.trim())) {
          await query(
            `with revoked as (
               update consents set revoked_at = now()
               where customer_id = $1 and purpose = 'appointment_messages' and revoked_at is null returning id)
             insert into consents (customer_id, purpose, source, revoked_at)
             select $1, 'appointment_messages', 'whatsapp_reply', now() where not exists (select 1 from revoked)`,
            [inbound.customerId],
            client,
          );
        }
        return inbound;
      }, db);
      if (!stored) continue;
      messages += 1;
      if (await hit(`auto_reply:${from}`, 24 * 60, 1, db)) {
        await enqueue(
          [{ kind: "auto_reply", templateKey: "auto_reply", customerId: stored.customerId, data: { to: from } }],
          db,
        );
      }
    }
  }
  log.info({ statuses, messages }, "whatsapp webhook");
  return { statuses, messages };
}
