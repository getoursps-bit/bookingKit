import { defineExtension } from "@/extension/types";

// Two more shortcuts in the contact row, for a client whose customers do not
// all use Waze: Google Maps and Apple Maps, each opening at the business's
// address. The buttons are in views.tsx; there is nothing on the server.

export default defineExtension({ id: "map-links" });
