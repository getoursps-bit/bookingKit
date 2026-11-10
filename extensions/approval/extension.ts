import { defineExtension } from "@/extension/types";
import ar from "./languages/ar.json";
import en from "./languages/en.json";
import he from "./languages/he.json";
import {
  APPROVAL_SETTINGS,
  approvalOn,
  expireRequests,
  forgetCustomer,
  outcomeOf,
  RECEIVED,
  refusalReason,
  REFUSED,
  requested,
  seedTemplates,
} from "./server/requests";

// Every online booking is a request the owner approves or refuses. The core
// keeps a request's time as a pending booking; this extension decides that a
// booking waits, tells the customer and the owner, and brings the requests
// screen (views.tsx). A request nobody answers before its time expires. The
// owner can switch approval off in her settings, and bookings are then
// confirmed at once.

export default defineExtension({
  id: "approval",
  messages: { he, en, ar },
  settings: APPROVAL_SETTINGS,
  seed: (db) => seedTemplates(db),
  approval: { needed: (db) => approvalOn(db), requested },
  customerMessages: {
    /** Only while the request still waits. */
    [RECEIVED]: { still: async (appointment) => appointment.status === "pending" },
    [REFUSED]: {
      still: async (appointment, db) => (await outcomeOf(appointment.id, db))?.outcome === "refused",
      vars: async (appointment, locale, db) => ({ reason: await refusalReason(appointment.id, locale, db) }),
    },
  },
  minute: async (db, now) => ({ expiredRequests: await expireRequests(db, now) }),
  customerData: { tables: [], erase: forgetCustomer },
});
