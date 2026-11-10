import { defineExtension } from "@/extension/types";
import { query } from "@/server/db";
import ar from "./languages/ar.json";
import en from "./languages/en.json";
import he from "./languages/he.json";
import { runAiJobs, spentIn } from "./server/jobs";
import { AI_SETTINGS } from "./server/settings";
import { queueSummaries, summaries } from "./server/summary";

// AI help for the owner: a short note about each of tomorrow's bookings, and
// AI calls that other extensions ask for (server/api.ts), all inside one
// monthly cap that she sets. It needs the AI_* variables; without them its
// switches are shown but cannot be turned on. AI never blocks or changes a
// booking.

export default defineExtension({
  id: "ai",
  messages: { he, en, ar },
  settings: AI_SETTINGS,
  /** At most a few jobs a minute, each with its own timeout, so nothing else waits for AI. */
  minute: async (db, now) => ({ aiJobs: await runAiJobs({ db, now, limit: 5 }) }),
  /** The notes are ready the evening before. */
  daily: [{ name: "ai_summaries", hour: 19, run: (now, db) => queueSummaries(now, db) }],
  bookingNotes: summaries,
  monthlyCost: async (month, db) => ({ label: "stats.aiCost", agorot: await spentIn(month, db) }),
  customerData: {
    tables: [],
    /** The notes and results hold what the customer wrote, so they go with an erase. */
    async erase(customerId, db) {
      await query("delete from ai_jobs where appointment_id in (select id from appointments where customer_id = $1)", [customerId], db);
    },
  },
});
