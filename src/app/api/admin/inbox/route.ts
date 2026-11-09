import type { NextRequest } from "next/server";
import { query } from "@/server/db";
import { markRead } from "@/server/repos/events";
import { adminRequest, backTo } from "@/server/staff/http";

export const dynamic = "force-dynamic";

/** Read marks for owner events. */
export async function POST(request: NextRequest) {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  const back = req.form.back === "/admin" ? "/admin" : "/admin/inbox";
  if (req.form.action === "readAll") {
    await query("update owner_events set read_at = now() where read_at is null");
  } else if (req.form.action === "read" && /^\d+$/.test(req.form.id ?? "")) {
    await markRead([Number(req.form.id)]);
  }
  return backTo(request, back, { ok: "saved" });
}
