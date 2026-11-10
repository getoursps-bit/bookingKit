import type { NextRequest } from "next/server";
import { verifyAndConfirm } from "@/core/booking/flow";
import {
  clientAddress,
  csrfOk,
  getDraft,
  next,
  readForm,
  requestLocale,
  setCookie,
  setDraft,
  stepPath,
} from "@/core/booking/http";
import { TRUSTED_DEVICE_COOKIE } from "@/core/booking/manageTokens";

export const dynamic = "force-dynamic";

/**
 * Checks the code (5 tries, 10 minutes), confirms the booking, and remembers
 * this browser for 90 days. Then the customer lands on the private link.
 */
export async function POST(request: NextRequest) {
  const form = await readForm(request);
  if (!csrfOk(request, form)) return next(request, stepPath("code", { error: "expired" }), {}, 403);
  const draft = getDraft(request);
  if (!draft.holdId) return next(request, stepPath("contact", { error: "HoldExpired" }), {}, 400);
  const code = (form.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return next(request, stepPath("code", { error: "Wrong" }), { error: "Wrong" }, 400);

  // The typed email is kept unless it would replace the one on file and the customer unticked that.
  const keepEmail = draft.email && (draft.emailOnFile === null || form.replaceEmail === "on") ? draft.email : null;
  const result = await verifyAndConfirm(
    draft.holdId,
    code,
    clientAddress(request),
    { locale: requestLocale(request) },
    keepEmail,
  );
  if (!result.ok) {
    const lost = result.reason === "HoldExpired" || result.reason === "NotFound";
    const response = next(
      request,
      lost ? stepPath("time", { error: "HoldExpired" }) : stepPath("code", { error: result.reason }),
      { error: result.reason },
      400,
    );
    if (lost) setDraft(request, response, { ...draft, start: null, holdId: null, holdExpiresAt: null });
    return response;
  }
  const response = next(request, `/b/${result.confirmed.manageToken}?new=1`, { confirmed: true });
  setDraft(request, response, null);
  setCookie(request, response, TRUSTED_DEVICE_COOKIE, result.device.raw, result.device.expiresAt);
  return response;
}
