import type { Db } from "../db";
import { getFeatures } from "../features";
import { enqueue, monthlyCount, skipQueued } from "../outbox";
import { getSettings } from "../settings";
import { deliver } from "./deliver";
import { dispatch } from "./dispatch";
import { channelStatus, driverFor } from "./drivers";
import { customerRecipient } from "./recipients";
import { type Recipient, route } from "./routing";
import type { Channel, MessageKind } from "./types";

/** The channels a message to this person would try now, in order, with today's settings, services and monthly count. */
async function plan(kind: MessageKind, to: Recipient, db?: Db): Promise<Channel[]> {
  return route(kind, to, { settings: await getSettings(db), features: getFeatures(), monthlyCount: await monthlyCount(new Date(), db) });
}

// The notification layer, as the rest of the app sees it.
//
//   Notify            this facade: queue a message, send one, ask where it would go
//   channels          email, messaging, push (routing.ts picks the order)
//   drivers           one way of sending on a channel (drivers.ts, drivers/)
//
// A message is queued in the outbox, the worker hands it to `dispatch`, the
// routing table gives the channels to try, and each channel sends through the
// driver the environment chose. Code outside this folder uses `Notify` and
// never a channel or a driver directly, so changing a provider is a change
// of environment variables.

export const Notify = {
  /** Puts messages in the outbox; the worker sends them. Returns their ids. */
  queue: enqueue,
  /** Sends one outbox row now, trying its channels in order. For a code the customer is waiting for. */
  send: deliver,
  /** Sends a row the worker claimed: finds who it is for and what it says first. */
  dispatch,
  /** Drops a booking's queued messages of some kinds, with the reason, when the booking changed. */
  cancel: skipQueued,
  /** The channels a message to this person would try now, in order. */
  plan,
  /** The routing table itself: the same answer from given settings and services. The only place a channel is chosen. */
  route,
  /** A customer's phone, email, consent and language, as `route` needs them. */
  recipient: customerRecipient,
  /** Each channel's driver and whether it is on. */
  channels: channelStatus,
  /** The driver behind a channel. For the notification layer's own tests. */
  driver: driverFor,
};

export type { Delivery, Vars } from "./deliver";
export type { Recipient, RouteContext } from "./routing";
export type { Channel, Driver, MessageKind, OutgoingMessage, SendResult } from "./types";
