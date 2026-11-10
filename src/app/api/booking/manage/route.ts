import type { NextRequest } from "next/server";
import { setMessageConsent } from "@/core/booking/flow";
import { csrfOk, next, readForm } from "@/core/booking/http";
import { cancelBooking, moveBooking } from "@/core/booking/service";

export const dynamic = "force-dynamic";

/** The private link's actions: move, cancel, and appointment messages on or off. */
export async function POST(request: NextRequest) {
  const form = await readForm(request);
  const token = form.token ?? "";
  const page = `/b/${encodeURIComponent(token)}`;
  if (!csrfOk(request, form)) return next(request, `${page}?error=expired`, {}, 403);

  switch (form.action) {
    case "move": {
      const start = new Date(form.start ?? "");
      if (Number.isNaN(start.getTime())) return next(request, `${page}?move=1&error=chooseTime`, {}, 400);
      const result = await moveBooking(token, start);
      if (!result.ok) return next(request, `${page}?move=1&error=${result.reason}`, { error: result.reason }, 409);
      return next(request, `${page}?done=moved`);
    }
    case "cancel": {
      const result = await cancelBooking(token);
      if (!result.ok) return next(request, `${page}?error=${result.reason}`, { error: result.reason }, 409);
      // The link stops working once the booking is cancelled.
      return next(request, "/book?cancelled=1");
    }
    case "messagesOff":
    case "messagesOn": {
      const ok = await setMessageConsent({ token, on: form.action === "messagesOn" });
      return next(request, ok ? `${page}?done=${form.action}` : page, {}, ok ? 200 : 404);
    }
    default:
      return next(request, page, {}, 400);
  }
}
