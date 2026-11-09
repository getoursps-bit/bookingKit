import type { Locale } from "../../i18n/locales";
import { getConfig } from "../config";
import type { EmailChannel, OutgoingMessage, SendResult } from "./types";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** An email body in the message's language and direction, with links made clickable. */
export function emailHtml(text: string, locale: Locale = "he"): string {
  const linked = escapeHtml(text).replace(/https?:\/\/[^\s<⁩]+/g, (url) => `<a href="${url}">${url}</a>`);
  const dir = locale === "he" ? "rtl" : "ltr";
  const align = locale === "he" ? "right" : "left";
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;direction:${dir};text-align:${align}">${linked.replace(/\n/g, "<br>")}</body></html>`;
}

/**
 * Posts to the HTTPS email API at EMAIL_API_URL with a bearer key and a JSON
 * body of from, to, subject, html and text (the shape most email APIs accept).
 */
export function createEmail(): EmailChannel {
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
            subject: message.subject ?? "Fluffy Fur",
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
