import nodemailer, { type Transporter } from "nodemailer";
import { getConfig } from "../../config";
import type { Driver, OutgoingMessage, SendResult } from "../types";
import { emailHtml, emailSubject } from "./email-body";

// SMTP answers that will not get better by trying again: the address or the
// message itself was refused (5xx), as opposed to a busy server (4xx).
function permanent(error: unknown): boolean {
  const code = (error as { responseCode?: number }).responseCode ?? 0;
  return code >= 500 && code < 600;
}

/** Sends through a transport: the same for a client's own SMTP server and for Gmail. */
export function smtpDriver(transport: Transporter, from: string): Driver {
  return {
    async send(message: OutgoingMessage): Promise<SendResult> {
      try {
        const sent = (await transport.sendMail({
          from,
          to: message.to,
          subject: emailSubject(message),
          html: emailHtml(message.body, message.locale),
          text: message.body,
        })) as { messageId?: string };
        return { ok: true, providerRef: sent.messageId ?? null, costAgorot: 0 };
      } catch (error) {
        const code = (error as { responseCode?: number; code?: string }).responseCode ?? (error as { code?: string }).code ?? "network";
        return { ok: false, error: `smtp ${code}`, retry: !permanent(error) };
      }
    },
  };
}

const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 10_000 };

/** Any SMTP server: SMTP_HOST, SMTP_PORT (465 is TLS from the start; other ports upgrade), SMTP_USER and SMTP_PASSWORD. */
export function createSmtp(): Driver {
  const config = getConfig();
  const port = Number(config.SMTP_PORT);
  return smtpDriver(
    nodemailer.createTransport({
      host: config.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
      ...TIMEOUTS,
    }),
    config.EMAIL_FROM!,
  );
}

/** A Gmail or Google Workspace mailbox. GMAIL_APP_PASSWORD is an app password, not the account's password. */
export function createGmail(): Driver {
  const config = getConfig();
  return smtpDriver(
    nodemailer.createTransport({
      service: "gmail",
      auth: { user: config.GMAIL_USER, pass: config.GMAIL_APP_PASSWORD },
      ...TIMEOUTS,
    }),
    config.EMAIL_FROM!,
  );
}
