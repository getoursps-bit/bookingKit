import { defineViews } from "@/extension/views";
import { aiOn } from "./server/api";

// The extension's part of the owner's settings screen: the switch of the
// pre-visit note and the monthly AI cap.

export default defineViews({
  id: "ai",
  settings: {
    features: ["ai.summary"],
    caps: ["cap.aiMonthlyAgorot"],
    off: () => (aiOn() ? null : "settings.aiOff"),
  },
});
