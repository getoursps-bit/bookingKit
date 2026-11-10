import { getConfig } from "../config";
import type { OutgoingMessage, SendResult, WhatsAppChannel } from "./types";
import { DEFAULT_LOCALE } from "@/i18n/locales";

const GRAPH = "https://graph.facebook.com/v21.0";
// Meta error codes that mean this number cannot get WhatsApp messages, so the
// next channel should be tried instead of retrying.
const NOT_REACHABLE = new Set([131026, 131047, 131051, 131021, 470]);

/** Sends approved template messages through Meta's WhatsApp Cloud API. */
export function createWhatsApp(): WhatsAppChannel {
  const config = getConfig();
  return {
    async send(message: OutgoingMessage): Promise<SendResult> {
      if (!message.providerTemplate && message.kind !== "auto_reply") {
        return { ok: false, error: "no approved template", retry: false };
      }
      const components: unknown[] = [];
      if (message.params?.length) {
        components.push({ type: "body", parameters: message.params.map((text) => ({ type: "text", text })) });
      }
      if (message.buttonParam) {
        components.push({
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: message.buttonParam }],
        });
      }
      let response: Response;
      try {
        response = await fetch(`${GRAPH}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.WHATSAPP_API_TOKEN}`, "Content-Type": "application/json" },
          // A template when one is approved; plain text only for the reply inside
          // a chat the customer opened (WhatsApp allows that for 24 hours).
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: message.to.replace(/^\+/, ""),
            ...(message.providerTemplate
              ? {
                  type: "template",
                  template: { name: message.providerTemplate, language: { code: message.locale ?? DEFAULT_LOCALE }, components },
                }
              : { type: "text", text: { body: message.body } }),
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        return { ok: false, error: `whatsapp request failed: ${(error as Error).name}`, retry: true };
      }
      const body = (await response.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { code?: number; message?: string };
      };
      if (response.ok && body.messages?.[0]) return { ok: true, providerRef: body.messages[0].id, costAgorot: 0 };
      const code = body.error?.code ?? response.status;
      return {
        ok: false,
        error: `whatsapp ${response.status} code ${code}`,
        retry: !NOT_REACHABLE.has(code) && (response.status === 429 || response.status >= 500),
      };
    },
  };
}
