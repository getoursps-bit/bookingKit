import { defineExtension } from "@/extension/types";
import { forgetReference } from "./server/dibs";

// The move from Dibs, the booking system one client used before: a script
// (script.ts, `pnpm import:dibs`) that stages a Dibs export, checks it,
// imports customers and bookings without sending anything, and can write the
// future bookings back out. It has no pages. Keep it on for as long as its
// data is there: only then is a customer's Dibs reference removed on an erase.

export default defineExtension({
  id: "dibs-import",
  customerData: {
    tables: [],
    erase: forgetReference,
  },
});
