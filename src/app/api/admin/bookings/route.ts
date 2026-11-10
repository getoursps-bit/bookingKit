import { NextResponse, type NextRequest } from "next/server";
import { getLocale } from "@/i18n/server";
import { bookingsBetween } from "@/core/booking/owner-data";
import { ownerCancel, ownerExtend, ownerMove, ownerSetStatus } from "@/core/booking/owner";
import { ownerCreateBooking } from "@/core/booking/service";
import { normalizePhone } from "@/core/platform/links";
import { resolveSession, SESSION_COOKIE } from "@/core/platform/staff/auth";
import { adminRequest, backTo } from "@/core/platform/staff/http";

export const dynamic = "force-dynamic";

/** `GET ?start&end` (ISO): the calendar's bookings. */
export async function GET(request: NextRequest) {
  const staff = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!staff) return NextResponse.json({ error: "Login" }, { status: 401 });
  const start = new Date(request.nextUrl.searchParams.get("start") ?? "");
  const end = new Date(request.nextUrl.searchParams.get("end") ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() - start.getTime() > 45 * 86_400_000) {
    return NextResponse.json({ error: "BadRange" }, { status: 400 });
  }
  const bookings = await bookingsBetween(start, end, { locale: await getLocale() });
  return NextResponse.json(bookings, { headers: { "Cache-Control": "no-store" } });
}

/** Owner booking actions: create, move, extend, cancel, completed / no-show. */
export async function POST(request: NextRequest) {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  const { form, staff } = req;
  const id = Number(form.id);
  const back = "/admin/calendar";
  let result: { ok: true } | { ok: false; reason: string };

  switch (form.action) {
    case "create": {
      const phone = normalizePhone(form.phone ?? "");
      const start = new Date(form.start ?? "");
      const serviceIds = (form.services ?? "").split(",").filter((value) => /^\d+$/.test(value)).map(Number);
      if (!phone || !form.name?.trim() || Number.isNaN(start.getTime()) || serviceIds.length === 0) {
        return backTo(request, back, { error: "invalid" });
      }
      result = await ownerCreateBooking(
        {
          start,
          customer: { name: form.name.trim(), phone },
          lines: serviceIds.map((serviceId) => ({ serviceId })),
          notes: form.notes?.trim() || null,
          notifyCustomer: form.notify === "true" || form.notify === "on",
        },
        staff.id,
      );
      break;
    }
    case "move": {
      const start = new Date(form.start ?? "");
      if (Number.isNaN(start.getTime())) return backTo(request, back, { error: "invalid" });
      result = await ownerMove(id, start, staff.id);
      break;
    }
    case "extend":
      result = await ownerExtend(id, Math.max(-240, Math.min(240, Number(form.minutes) || 15)), staff.id);
      break;
    case "cancel":
      result = await ownerCancel(id, form.notify !== "false", staff.id);
      break;
    case "completed":
    case "no_show":
      result = await ownerSetStatus(id, form.action, staff.id);
      break;
    default:
      return backTo(request, back, { error: "invalid" });
  }
  if (!result.ok) return backTo(request, back, { error: result.reason }, 409);
  return backTo(request, back, { ok: "saved" });
}
