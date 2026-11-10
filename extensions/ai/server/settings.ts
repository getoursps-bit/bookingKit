import { z } from "zod";

/** The extension's settings: the pre-visit note's switch and the monthly cap on all AI spend. */
export const AI_SETTINGS = {
  "ai.summary": z.boolean().default(false),
  // About 40 USD a month, in agorot.
  "cap.aiMonthlyAgorot": z.number().int().min(0).default(15000),
};
