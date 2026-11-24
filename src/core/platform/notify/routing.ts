import { customerMessage } from "../../../extension/registry";
import type { Locale } from "../../../i18n/locales";
import type { Features } from "../features";
import type { Settings } from "../settings";
import type { Channel, MessageKind } from "./types";

/** What routing needs to know about the person a message is for. */
export type Recipient = {
  phone: string | null;
  email: string | null;
  /** True once the customer withdrew consent to appointment messages. */
  optedOut?: boolean;
  /** The channel the customer asked for ("send by email instead"). */
  prefer?: Channel;
  /** The language the customer booked in; messages follow it when an English text exists. */
  locale?: Locale;
};

export type RouteContext = {
  settings: Pick<Settings, "messaging.whatsappOutage" | "cap.messagesMonthly">;
  features: Pick<Features, "messaging" | "emailMessages" | "ownerPush">;
  /** WhatsApp messages sent so far this month. */
  monthlyCount: number;
};

const CUSTOMER_KINDS: MessageKind[] = ["confirmation", "reminder", "customer_change", "owner_change", "import_link"];

/**
 * The routing table: the ordered channels to try for a message. The caller
 * skips channels it already tried. An empty list means nothing can be sent;
 * for a code that means "call the salon", for a booking message it goes to the
 * owner's failed-messages list. Nothing else in the app picks a channel.
 */
export function route(kind: MessageKind, to: Recipient, ctx: RouteContext): Channel[] {
  const capReached = ctx.monthlyCount >= ctx.settings["cap.messagesMonthly"];
  const whatsapp =
    ctx.features.messaging && !ctx.settings["messaging.whatsappOutage"] && !capReached && to.phone !== null;
  const email = ctx.features.emailMessages && to.email !== null;

  // Owner alerts go to the owner's devices by push. The one exception is the
  // warning that pushes stopped arriving, which asks for email.
  if (kind === "owner_alert" || kind === "owner_check") {
    if (to.prefer === "email") return email ? ["email"] : [];
    return ctx.features.ownerPush ? ["push"] : [];
  }

  // The fixed answer to someone who wrote to the automated number: WhatsApp
  // only, inside the chat they opened, so no consent or template is needed.
  if (kind === "auto_reply") return whatsapp ? ["messaging"] : [];

  // The owner's login and password reset codes go to the staff email only,
  // and the monthly cap (for customer messages) never locks the owner out.
  if (kind === "staff_code" || kind === "staff_reset") return email ? ["email"] : [];

  if (kind === "code") {
    // The cap stops codes: the page then offers "call the salon".
    if (capReached) return [];
    if (to.prefer === "email") return email ? ["email"] : [];
    return [...(whatsapp ? (["messaging"] as const) : []), ...(email ? (["email"] as const) : [])];
  }

  // The core's booking messages, and the ones an extension brings.
  if (CUSTOMER_KINDS.includes(kind) || customerMessage(kind)) {
    if (to.optedOut) return [];
    return [...(whatsapp ? (["messaging"] as const) : []), ...(email ? (["email"] as const) : [])];
  }
  return [];
}
