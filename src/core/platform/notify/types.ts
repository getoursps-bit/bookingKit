import type { Locale } from "../../../i18n/locales";
import type { Channel, OutboxKind } from "../outbox";

export type MessageKind = OutboxKind;
export type { Channel };

/** A message ready to send: the text is already filled in from its template. */
export type OutgoingMessage = {
  kind: MessageKind;
  templateKey: string;
  /** Phone number in E.164 for WhatsApp, an address for email, a subscription for push. */
  to: string;
  body: string;
  subject?: string | null;
  /** Name of the Meta-approved template and its text parameters, in order. */
  providerTemplate?: string | null;
  params?: string[];
  /**
   * The value for the template's button: the code for a copy-code button, or
   * the end of the private link for a URL button.
   */
  buttonParam?: string | null;
  /** The language the text is written in; WhatsApp sends the template in it. Hebrew when absent. */
  locale?: Locale;
};

export type SendResult =
  | { ok: true; providerRef: string | null; costAgorot: number }
  /**
   * `retry` false means trying again on this channel will not help (bad
   * number, opted out). `gone`: a push subscription that no longer exists.
   */
  | { ok: false; error: string; retry: boolean; gone?: boolean };

export interface WhatsAppChannel {
  send(message: OutgoingMessage): Promise<SendResult>;
}

export interface EmailChannel {
  send(message: OutgoingMessage): Promise<SendResult>;
}

export interface PushChannel {
  send(message: OutgoingMessage): Promise<SendResult>;
}
