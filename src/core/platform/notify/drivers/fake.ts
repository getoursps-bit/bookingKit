import { getPool, type Db } from "../../db";
import type { Channel, Driver, OutgoingMessage, SendResult } from "../types";

/** Every message the fakes "sent" in this process, newest last. */
export const fakeSent: (OutgoingMessage & { channel: Channel })[] = [];

/**
 * The stand-in driver of every channel for local runs and CI (PROVIDERS=fake). It sends nothing:
 * it keeps the message in memory and in the `fake_messages` table, where the
 * end-to-end tests read codes and confirmations.
 */
export function createFake(channel: Channel, db?: Db): Driver {
  return {
    async send(message: OutgoingMessage): Promise<SendResult> {
      fakeSent.push({ ...message, channel });
      const [row] = (
        await (db ?? getPool()).query<{ id: number }>(
          `insert into fake_messages (channel, recipient, template_key, body) values ($1, $2, $3, $4) returning id::int`,
          [channel, message.to, message.templateKey, message.body],
        )
      ).rows;
      return { ok: true, providerRef: `fake-${channel}-${row!.id}`, costAgorot: 0 };
    },
  };
}

/** A channel that is not set up. Routing never picks it; this guards against mistakes. */
export function createOff(channel: Channel): Driver {
  return {
    async send(): Promise<SendResult> {
      return { ok: false, error: `${channel} is not set up`, retry: false };
    },
  };
}
