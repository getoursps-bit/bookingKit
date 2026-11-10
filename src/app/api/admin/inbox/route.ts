import type { NextRequest } from "next/server";
import { markAllRead, markRead } from "@/core/platform/events";
import { adminRequest, backTo } from "@/core/platform/staff/http";

export const dynamic = "force-dynamic";

/** Read marks for owner events. */
export async function POST(request: NextRequest) {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  const back = req.form.back === "/admin" ? "/admin" : "/admin/inbox";
  if (req.form.action === "readAll") {
    await markAllRead();
  } else if (req.form.action === "read" && /^\d+$/.test(req.form.id ?? "")) {
    await markRead([Number(req.form.id)]);
  }
  return backTo(request, back, { ok: "saved" });
}
