import type { Db } from "../db";
import { hit as countHit } from "../rateLimits";

/** The limits from the design, in one place. */
export const LIMITS = {
  codeSendsPerPhonePerHour: { windowMin: 60, max: 3 },
  codeSendsPerAddressPerHour: { windowMin: 60, max: 10 },
  codeAttempts: 5,
  verifyPerAddressPerHour: { windowMin: 60, max: 30 },
} as const;

/** Counts one action against `key` and says whether it is allowed (true) or blocked (false). */
export function hit(key: string, windowMin: number, max: number, db?: Db): Promise<boolean> {
  return countHit(key, windowMin, max, db);
}
