import type { NextRequest } from "next/server";
import { bookingsBetween } from "@/core/booking/owner-data";
import { ownerCancel } from "@/core/booking/owner";
import { addTimeOff, listTimeOff, removeTimeOff, setOpeningHours } from "@/core/booking/catalog";
import { adminRequest, backTo } from "@/core/platform/staff/http";
import { localDateTimeToUtc } from "@/core/platform/time";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Weekly hours, time off, and cancelling the bookings that fall in a time off. */
export async function POST(request: NextRequest) {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  const { form, staff } = req;
  const back = "/admin/hours";
  const writer = { staffId: staff.id };

  switch (form.action) {
    case "weekly": {
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const closed = form[`closed.${weekday}`] === "on";
        const opens = form[`opens.${weekday}`] ?? "";
        const closes = form[`closes.${weekday}`] ?? "";
        if (!closed && (!TIME.test(opens) || !TIME.test(closes) || opens >= closes)) {
          return backTo(request, back, { error: "invalid" });
        }
      }
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const closed = form[`closed.${weekday}`] === "on";
        await setOpeningHours(
          { weekday, closed, opens: closed ? null : form[`opens.${weekday}`]!, closes: closed ? null : form[`closes.${weekday}`]! },
          writer,
        );
      }
      return backTo(request, back, { ok: "saved" });
    }
    case "timeoff": {
      const { fromDate = "", toDate = "" } = form;
      const fromTime = form.fromTime || "00:00";
      const toTime = form.toTime || "23:59";
      if (!DATE.test(fromDate) || !DATE.test(toDate) || !TIME.test(fromTime) || !TIME.test(toTime)) {
        return backTo(request, back, { error: "invalid" });
      }
      const start = localDateTimeToUtc(fromDate, fromTime);
      const end = localDateTimeToUtc(toDate, toTime);
      if (end <= start) return backTo(request, back, { error: "invalid" });
      await addTimeOff({ start, end, reason: form.reason?.trim().slice(0, 200) || null }, writer);
      return backTo(request, back, { ok: "saved" });
    }
    case "remove":
      await removeTimeOff(Number(form.id), writer);
      return backTo(request, back, { ok: "saved" });
    case "cancelAffected": {
      const [entry] = (await listTimeOff(new Date(0), new Date("9999-01-01"))).filter((row) => row.id === Number(form.id));
      if (!entry) return backTo(request, back, { error: "NotFound" });
      const affected = await bookingsBetween(entry.start, entry.end, { statuses: ["confirmed"] });
      for (const booking of affected) await ownerCancel(booking.id, true, staff.id);
      return backTo(request, back, { ok: "saved" });
    }
    default:
      return backTo(request, back, { error: "invalid" });
  }
}
