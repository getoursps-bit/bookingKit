import type { NextRequest } from "next/server";
import { enqueue } from "@/core/platform/outbox";
import { removeOwnerDevice } from "@/core/platform/ownerDevices";
import { adminRequest, backTo } from "@/core/platform/staff/http";

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
    await removeOwnerDevice(Number(req.form.id));
  }
  return backTo(request, "/admin", { ok: "saved" });
}
