import { describe, expect, it } from "vitest";
import { route, type RouteContext } from "@/core/platform/notify/routing";

const phone = "+972555000001";
const email = "test@example.com";

function ctx(
  over: { outage?: boolean; cap?: number; count?: number; wa?: boolean; mail?: boolean; push?: boolean } = {},
) {
  return {
    settings: { "messaging.whatsappOutage": over.outage ?? false, "cap.messagesMonthly": over.cap ?? 1000 },
    features: { whatsappMessages: over.wa ?? true, emailMessages: over.mail ?? true, ownerPush: over.push ?? true },
    monthlyCount: over.count ?? 0,
  } satisfies RouteContext;
}

describe("route", () => {
  it("sends codes by WhatsApp, then email when one is known", () => {
    expect(route("code", { phone, email }, ctx())).toEqual(["whatsapp", "email"]);
    expect(route("code", { phone, email: null }, ctx())).toEqual(["whatsapp"]);
  });

  it("sends a code by email only when the customer asks for it", () => {
    expect(route("code", { phone, email, prefer: "email" }, ctx())).toEqual(["email"]);
    expect(route("code", { phone, email: null, prefer: "email" }, ctx())).toEqual([]);
  });

  it("sends the owner's login code by email only, even at the monthly cap", () => {
    expect(route("staff_code", { phone: null, email, prefer: "email" }, ctx({ cap: 10, count: 10 }))).toEqual([
      "email",
    ]);
    expect(route("staff_code", { phone, email }, ctx())).toEqual(["email"]);
    expect(route("staff_code", { phone: null, email }, ctx({ mail: false }))).toEqual([]);
  });

  it("stops codes at the monthly cap, leaving the call button", () => {
    expect(route("code", { phone, email }, ctx({ cap: 10, count: 10 }))).toEqual([]);
  });

  it("moves everything to email while the WhatsApp outage switch is on", () => {
    expect(route("code", { phone, email }, ctx({ outage: true }))).toEqual(["email"]);
    expect(route("confirmation", { phone, email }, ctx({ outage: true }))).toEqual(["email"]);
    expect(route("reminder", { phone, email: null }, ctx({ outage: true }))).toEqual([]);
  });

  it("sends booking messages by WhatsApp with email as the fallback", () => {
    for (const kind of ["confirmation", "reminder", "customer_change", "owner_change", "import_link"] as const) {
      expect(route(kind, { phone, email }, ctx())).toEqual(["whatsapp", "email"]);
    }
  });

  it("leaves out WhatsApp at the cap but keeps email for booking messages", () => {
    expect(route("reminder", { phone, email }, ctx({ cap: 5, count: 5 }))).toEqual(["email"]);
  });

  it("sends nothing to a customer who turned messages off", () => {
    expect(route("reminder", { phone, email, optedOut: true }, ctx())).toEqual([]);
  });

  it("skips channels that are not set up", () => {
    expect(route("confirmation", { phone, email }, ctx({ wa: false }))).toEqual(["email"]);
    expect(route("code", { phone, email }, ctx({ wa: false, mail: false }))).toEqual([]);
  });

  it("sends owner alerts by push only", () => {
    expect(route("owner_alert", { phone: null, email: null }, ctx())).toEqual(["push"]);
    expect(route("owner_check", { phone: null, email: null }, ctx({ push: false }))).toEqual([]);
  });
});
