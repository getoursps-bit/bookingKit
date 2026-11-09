import { NextResponse, type NextRequest } from "next/server";
import { getDraft } from "@/server/booking/http";
import { getWeek, getWeekForMove } from "@/server/booking/service";
import { localDateOf } from "@/server/time";

export const dynamic = "force-dynamic";

/**
 * `GET ?date=YYYY-MM-DD` gives the day statuses for the week from `date`, the
 * free times on `date` and the first free time. The chosen services come from the booking
 * draft, or, with `token`, from the booking being moved.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const date = params.get("date") ?? localDateOf(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "BadDate" }, { status: 400 });
  const token = params.get("token");
  let result;
  if (token) {
    result = await getWeekForMove(token, date);
  } else {
    const draft = getDraft(request);
    if (draft.serviceIds.length === 0) return NextResponse.json({ error: "NoServices" }, { status: 400 });
    result = await getWeek({ date, serviceIds: draft.serviceIds });
  }
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
  const { week } = result;
  return NextResponse.json(
    {
      lengthMin: week.lengthMin,
      days: week.days,
      slots: week.slots.map((slot) => slot.toISOString()),
      firstAvailable: week.firstAvailable
        ? { date: week.firstAvailable.date, start: week.firstAvailable.start.toISOString() }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
