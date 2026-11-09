import type { NextRequest } from "next/server";
import { query } from "@/server/db";
import { enqueue } from "@/server/repos/outbox";
import { adminRequest, backTo } from "@/server/staff/http";

export const dynamic = "force-dynamic";

/** Sends a test alert to every owner device, or removes one device. */
export async function POST(request: NextRequest) {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  if (req.form.action === "test") {
    await enqueue([{ kind: "owner_alert", templateKey: "owner_alert", staffId: req.staff.id, data: { type: "test" } }]);
    return backTo(request, "/admin", { ok: "today.testSent" });
  }
  if (req.form.action === "remove" && /^\d+$/.test(req.form.id ?? "")) {
    await query("delete from push_subscriptions where id = $1 and staff_id is not null", [Number(req.form.id)]);
  }
  return backTo(request, "/admin", { ok: "saved" });
}
