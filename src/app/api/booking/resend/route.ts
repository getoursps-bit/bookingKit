import type { NextRequest } from "next/server";
import { z } from "zod";
import { resendCode } from "@/server/booking/flow";
import { maskEmail, maskPhone } from "@/server/repos/customers";
import { clientAddress, csrfOk, getDraft, next, readForm, requestLocale, setDraft, stepPath } from "@/server/booking/http";

export const dynamic = "force-dynamic";

/** An email typed on the code step, for a customer who gave none and can't get WhatsApp. */
const TypedEmail = z.string().trim().pipe(z.email().max(200));

/**
 * Sends the code again, by WhatsApp or by email, under the same limits as the
 * first send. An email typed here is used as if it had been typed on the
 * contact step (the one-email-per-phone rule still decides where the code goes).
 */
export async function POST(request: NextRequest) {
  const form = await readForm(request);
  if (!csrfOk(request, form)) return next(request, stepPath("code", { error: "expired" }), {}, 403);
  const draft = getDraft(request);
  if (!draft.holdId) return next(request, stepPath("pets", { error: "HoldExpired" }), {}, 400);
  const channel = form.channel === "email" ? "email" : "whatsapp";
  let email = draft.email;
  if (channel === "email" && form.email !== undefined) {
    const typed = TypedEmail.safeParse(form.email);
    if (!typed.success) return next(request, stepPath("code", { error: "emailInvalid" }), {}, 400);
    email = typed.data;
  }
  const result = await resendCode(draft.holdId, channel, clientAddress(request), undefined, requestLocale(request), email);
  if (!result.ok) {
    if (result.reason === "HoldExpired") {
      const response = next(request, stepPath("time", { error: "HoldExpired" }), { error: "HoldExpired" }, 400);
      setDraft(request, response, { ...draft, start: null, holdId: null, holdExpiresAt: null });
      return response;
    }
    return next(request, stepPath("code", { error: `code${result.reason}` }), { error: result.reason }, 400);
  }
  const response = next(request, stepPath("code", { sent: result.channel }), { channel: result.channel });
  setDraft(request, response, {
    ...draft,
    email,
    hasEmail: draft.hasEmail || email !== null,
    emailOnFile: email !== draft.email ? (result.onFile ? maskEmail(result.onFile) : null) : draft.emailOnFile,
    codeChannel: result.channel,
    codeSentAt: Date.now(),
    codeTo: result.channel === "email" ? maskEmail(result.to) : maskPhone(result.to),
  });
  return response;
}
