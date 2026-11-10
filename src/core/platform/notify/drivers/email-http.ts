import { getConfig } from "../../config";
import type { Driver, OutgoingMessage, SendResult } from "../types";
import { emailHtml, emailSubject } from "./email-body";

/**
 * Posts to the HTTPS email API at EMAIL_API_URL with a bearer key and a JSON
 * body of from, to, subject, html and text (the shape most email APIs accept).
 */
export function createHttpEmail(): Driver {
  const config = getConfig();
  return {
    async send(message: OutgoingMessage): Promise<SendResult> {
      let response: Response;
      try {
        response = await fetch(config.EMAIL_API_URL!, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.EMAIL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: config.EMAIL_FROM,
            to: [message.to],
            subject: emailSubject(message),
            html: emailHtml(message.body, message.locale),
            text: message.body,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        return { ok: false, error: `email request failed: ${(error as Error).name}`, retry: true };
      }
      const body = (await response.json().catch(() => ({}))) as { id?: string };
      if (response.ok) return { ok: true, providerRef: body.id ?? null, costAgorot: 0 };
      return {
        ok: false,
        error: `email ${response.status}`,
        retry: response.status === 429 || response.status >= 500,
      };
    },
  };
}
