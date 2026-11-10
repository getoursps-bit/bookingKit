import webpush from "web-push";
import { getConfig } from "../../config";
import type { Driver, OutgoingMessage, SendResult } from "../types";

// An alert older than this is no longer worth showing.
const TTL_S = 60 * 60;

/**
 * Browser push with VAPID. `message.to` is the stored subscription as JSON and
 * `message.body` the payload (event type, time and a path only).
 */
export function createWebPush(): Driver {
  const config = getConfig();
  webpush.setVapidDetails(config.VAPID_SUBJECT!, config.VAPID_PUBLIC_KEY!, config.VAPID_PRIVATE_KEY!);
  return {
    async send(message: OutgoingMessage): Promise<SendResult> {
      try {
        const result = await webpush.sendNotification(JSON.parse(message.to), message.body, {
          TTL: TTL_S,
          urgency: "high",
          timeout: 10_000,
        });
        return { ok: true, providerRef: result.headers?.location ?? null, costAgorot: 0 };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 0;
        if (status === 404 || status === 410) return { ok: false, error: `push ${status}`, retry: false, gone: true };
        return {
          ok: false,
          error: `push ${status || "network"}`,
          retry: status === 0 || status === 429 || status >= 500,
        };
      }
    },
  };
}
