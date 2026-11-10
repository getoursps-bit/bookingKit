import { defineExtension } from "@/extension/types";
import ar from "./languages/ar.json";
import en from "./languages/en.json";
import he from "./languages/he.json";
import { loadRanges, readRanges, saveRanges } from "./server/ranges";

// A second opening range on a weekday, for a client who works a morning and a
// late afternoon with a break between. The core already treats a day as a
// list of ranges; this extension keeps the second one and asks the owner for
// it on the hours screen (views.tsx).

export default defineExtension({
  id: "split-hours",
  messages: { he, en, ar },
  openingRanges: { load: loadRanges, read: readRanges, save: saveRanges },
});
