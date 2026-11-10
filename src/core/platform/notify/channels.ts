import { providerMode } from "../config";
import type { Db } from "../db";
import { createEmail } from "./email";
import { createFakeChannel, createOffChannel } from "./fake";
import { createPush } from "./push";
import type { Channel, OutgoingMessage, SendResult } from "./types";
import { createWhatsApp } from "./whatsapp";

type Sender = { send(message: OutgoingMessage): Promise<SendResult> };

const cache = new Map<Channel, Sender>();

function build(channel: Channel): Sender {
  const mode = providerMode(channel);
  if (mode === "fake") return createFakeChannel(channel);
  if (mode === "off") return createOffChannel(channel);
  if (channel === "whatsapp") return createWhatsApp();
  if (channel === "email") return createEmail();
  return createPush();
}

/**
 * The adapter for a channel: real, fake or off, from PROVIDERS and the keys
 * that are set. `db` lets a fake record into the caller's database (tests).
 */
export function channelFor(channel: Channel, db?: Db): Sender {
  if (db && providerMode(channel) === "fake") return createFakeChannel(channel, db);
  let sender = cache.get(channel);
  if (!sender) {
    sender = build(channel);
    cache.set(channel, sender);
  }
  return sender;
}
