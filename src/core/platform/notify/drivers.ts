import { driverOf, type NotifyChannel, providerMode, type ProviderMode } from "../config";
import type { Db } from "../db";
import { createHttpEmail } from "./drivers/email-http";
import { createGmail, createSmtp } from "./drivers/email-smtp";
import { createFake, createOff } from "./drivers/fake";
import { createMeta } from "./drivers/messaging-meta";
import { createTwilio } from "./drivers/messaging-twilio";
import { createWebPush } from "./drivers/push-web";
import type { Channel, Driver } from "./types";

// The drivers of each channel. A channel uses one at a time: MESSAGING_DRIVER
// and EMAIL_DRIVER name it, and its keys (DRIVER_KEYS in config.ts) switch
// the channel on. A new provider is a file in drivers/, a line here and its
// keys in config.ts; nothing else in the app changes.
const DRIVERS: { [C in NotifyChannel]: Record<string, () => Driver> } = {
  messaging: { meta: createMeta, twilio: createTwilio },
  email: { http: createHttpEmail, smtp: createSmtp, gmail: createGmail },
  push: { webpush: createWebPush },
};

const cache = new Map<Channel, Driver>();

function build(channel: Channel): Driver {
  const mode = providerMode(channel);
  if (mode === "fake") return createFake(channel);
  if (mode === "off") return createOff(channel);
  return DRIVERS[channel][driverOf(channel)]!();
}

/**
 * The driver behind a channel: the chosen one, the fake or "off", from
 * PROVIDERS and the keys that are set. `db` lets the fake record into the
 * caller's database (tests).
 */
export function driverFor(channel: Channel, db?: Db): Driver {
  if (db && providerMode(channel) === "fake") return createFake(channel, db);
  let driver = cache.get(channel);
  if (!driver) {
    driver = build(channel);
    cache.set(channel, driver);
  }
  return driver;
}

/** Each channel's driver and whether it is on, for the log at start-up and for checks. No keys in it. */
export function channelStatus(): Record<Channel, { driver: string; mode: ProviderMode }> {
  const of = (channel: Channel) => ({ driver: driverOf(channel), mode: providerMode(channel) });
  return { messaging: of("messaging"), email: of("email"), push: of("push") };
}

/** Every driver a channel could use, by name. */
export function driverNames(channel: Channel): string[] {
  return Object.keys(DRIVERS[channel]);
}
