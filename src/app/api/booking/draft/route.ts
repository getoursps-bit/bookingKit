import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { EMPTY_DRAFT, MULTI_LINE_BOOKING } from "@/core/booking/draft";
import { csrfOk, getDraft, next, readForm, setDraft, stepPath } from "@/core/booking/http";
import { listServices } from "@/core/booking/catalog";
import { getSettings } from "@/core/platform/settings";

export const dynamic = "force-dynamic";

/**
 * The first two steps: choosing a service (one for each line when several
 * lines are on), then a time. Each press saves the draft cookie and returns
 * to the right step.
 */
export async function POST(request: NextRequest) {
  const form = await readForm(request);
  if (!csrfOk(request, form)) return next(request, stepPath("service", { error: "expired" }), {}, 403);
  const draft = getDraft(request);
  const resetLater = { start: null, holdId: null, holdExpiresAt: null, codeChannel: null, codeSentAt: null };

  switch (form.action) {
    case "addService": {
      const { "booking.maxLines": maxLines } = await getSettings();
      if (MULTI_LINE_BOOKING && draft.serviceIds.length >= maxLines) {
        return next(request, stepPath("service", { error: "tooManyLines" }), {}, 400);
      }
      const services = await listServices({ activeOnly: true });
      const service = services.find((candidate) => String(candidate.id) === form.serviceId && candidate.bookableOnline);
      if (!service) return next(request, stepPath("service", { error: "chooseService" }), {}, 400);
      if (!MULTI_LINE_BOOKING) {
        // One line per booking: the chosen service replaces any earlier one, and on to the time.
        const response = next(request, stepPath("time"), { services: 1 });
        setDraft(request, response, { ...draft, ...resetLater, serviceIds: [service.id], details: [] });
        return response;
      }
      const response = next(request, stepPath("service"), { services: draft.serviceIds.length + 1 });
      setDraft(request, response, { ...draft, ...resetLater, serviceIds: [...draft.serviceIds, service.id] });
      return response;
    }
    case "removeService": {
      const index = Number(form.index);
      const response = next(request, stepPath("service"));
      setDraft(request, response, {
        ...draft,
        ...resetLater,
        serviceIds: draft.serviceIds.filter((_, i) => i !== index),
        details: draft.details.filter((_, i) => i !== index),
      });
      return response;
    }
    case "toTime":
      if (draft.serviceIds.length === 0) return next(request, stepPath("service", { error: "noServices" }), {}, 400);
      return next(request, stepPath("time"));
    case "chooseTime": {
      const start = new Date(form.start ?? "");
      if (draft.serviceIds.length === 0) return next(request, stepPath("service", { error: "noServices" }), {}, 400);
      if (Number.isNaN(start.getTime())) return next(request, stepPath("time", { error: "chooseTime" }), {}, 400);
      const response = next(request, stepPath("contact"));
      setDraft(request, response, {
        ...draft,
        ...resetLater,
        start: start.toISOString(),
        wantedStart: null,
        idempotencyKey: randomUUID(),
      });
      return response;
    }
    case "restart": {
      const response = next(request, stepPath("service"));
      setDraft(request, response, EMPTY_DRAFT);
      return response;
    }
    default:
      return next(request, stepPath("service"), {}, 400);
  }
}
