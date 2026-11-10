import { getConfig } from "../../config";
import type { Driver, OutgoingMessage, SendResult } from "../types";

const API = "https://api.twilio.com/2010-04-01";
// Twilio error codes that mean this number cannot get the message, so the
// next channel should be tried instead of retrying: not a valid or mobile
// number, opted out, or not on WhatsApp.
const NOT_REACHABLE = new Set([21211, 21214, 21610, 21612, 21614, 63003, 63024]);

/**
 * The form Twilio's Messages endpoint takes. TWILIO_FROM decides the medium:
 * "whatsapp:+<number>" sends WhatsApp, a plain number or a messaging service
 * id ("MG...") sends SMS. On WhatsApp, a template (`providerTemplate`, the
 * content SID "HX...") goes with its values numbered from 1, and the button
 * value after them; plain text is for SMS and for a reply inside a chat the
 * customer opened.
 */
export function twilioForm(message: OutgoingMessage, from: string): URLSearchParams {
  const whatsapp = from.startsWith("whatsapp:");
  const form = new URLSearchParams({ To: whatsapp ? `whatsapp:${message.to}` : message.to });
  form.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);
  if (whatsapp && message.providerTemplate) {
    const values = [...(message.params ?? []), ...(message.buttonParam ? [message.buttonParam] : [])];
    form.set("ContentSid", message.providerTemplate);
    form.set("ContentVariables", JSON.stringify(Object.fromEntries(values.map((value, index) => [String(index + 1), value]))));
  } else {
    form.set("Body", message.body);
  }
  return form;
}

/** Sends WhatsApp or SMS through Twilio's REST API. */
export function createTwilio(): Driver {
  const config = getConfig();
  const from = config.TWILIO_FROM!;
  const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString("base64");
  return {
    async send(message: OutgoingMessage): Promise<SendResult> {
      if (from.startsWith("whatsapp:") && !message.providerTemplate && message.kind !== "auto_reply") {
        return { ok: false, error: "no approved template", retry: false };
      }
      let response: Response;
      try {
        response = await fetch(`${API}/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: twilioForm(message, from),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        return { ok: false, error: `twilio request failed: ${(error as Error).name}`, retry: true };
      }
      const body = (await response.json().catch(() => ({}))) as { sid?: string; code?: number };
      if (response.ok && body.sid) return { ok: true, providerRef: body.sid, costAgorot: 0 };
      const code = body.code ?? response.status;
      return {
        ok: false,
        error: `twilio ${response.status} code ${code}`,
        retry: !NOT_REACHABLE.has(code) && (response.status === 429 || response.status >= 500),
      };
    },
  };
}
