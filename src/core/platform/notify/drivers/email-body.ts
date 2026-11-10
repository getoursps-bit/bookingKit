import { DEFAULT_LOCALE, type Locale, PACKS } from "../../../../i18n/locales";
import type { OutgoingMessage } from "../types";
import { brandName } from "@/brand";

// What every email driver sends: the same subject and the same HTML.

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** An email body in the message's language and direction, with links made clickable. */
export function emailHtml(text: string, locale: Locale = DEFAULT_LOCALE): string {
  const linked = escapeHtml(text).replace(/https?:\/\/[^\s<⁩]+/g, (url) => `<a href="${url}">${url}</a>`);
  const dir = PACKS[locale].dir;
  const align = dir === "rtl" ? "right" : "left";
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;direction:${dir};text-align:${align}">${linked.replace(/\n/g, "<br>")}</body></html>`;
}

/** The template's subject, or the business name when it has none. */
export function emailSubject(message: OutgoingMessage): string {
  return message.subject ?? brandName(message.locale ?? DEFAULT_LOCALE);
}
