import type { NextRequest } from "next/server";
import { z } from "zod";
import { bookingLinePoints } from "@/extension/registry";
import { readAttribution, ATTRIBUTION_COOKIE } from "@/core/website/attribution";
import { startBooking } from "@/core/booking/flow";
import {
  clientAddress,
  csrfOk,
  getDraft,
  humanOk,
  next,
  readForm,
  requestLocale,
  setDraft,
  stepPath,
} from "@/core/booking/http";
import { getConfig } from "@/core/platform/config";
import { getFeatures } from "@/core/platform/features";
import { TRUSTED_DEVICE_COOKIE } from "@/core/booking/manageTokens";
import { normalizePhone } from "@/core/platform/links";
import { log } from "@/core/platform/log";
import { maskEmail, maskPhone } from "@/core/booking/customers";

export const dynamic = "force-dynamic";

const Contact = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().transform((value, ctx) => normalizePhone(value) ?? (ctx.addIssue({ code: "custom" }), z.NEVER)),
  email: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.email().max(200).nullable()),
});

/**
 * Step 3: takes the slot for ten minutes and sends the code, or confirms at
 * once on a trusted device. Checks the CSRF token, the hidden field, the
 * minimum fill time and the rate limits; the idempotency key from the draft
 * makes a double press harmless.
 */
export async function POST(request: NextRequest) {
  if (!getFeatures().onlineBooking) return next(request, "/book", { error: "Off" }, 409);
  const form = await readForm(request);
  if (!csrfOk(request, form)) return next(request, stepPath("contact", { error: "expired" }), {}, 403);
  if (!humanOk(form)) return next(request, stepPath("contact", { error: "tooFast" }), {}, 400);
  const saved = getDraft(request);
  if (saved.serviceIds.length === 0 || !saved.start || !saved.idempotencyKey) {
    return next(request, stepPath("service", { error: "noServices" }), {}, 400);
  }
  const { start, idempotencyKey } = saved;
  // What each extension asks about the lines: read from the form, completed from the services, then checked.
  const points = bookingLinePoints();
  const details: Record<string, unknown>[] = saved.serviceIds.map(() => ({}));
  for (const { id, point } of points) {
    const typed = saved.serviceIds.map((serviceId, index) => ({
      position: index + 1,
      serviceId,
      details: point.read(form, index),
    }));
    const prepared = (await point.prepare?.(typed)) ?? typed.map((line) => line.details);
    for (const [index, value] of prepared.entries()) details[index]![id] = value;
  }
  // What was typed stays in the draft, so an error does not empty the form.
  const draft = { ...saved, details };
  const fail = (error: string) => {
    const response = next(request, stepPath("contact", { error }), {}, 400);
    setDraft(request, response, draft);
    return response;
  };
  for (const { id, point } of points) {
    for (const line of details) {
      const missing = point.missing(line[id]);
      if (missing) return fail(missing);
    }
  }
  const contact = Contact.safeParse({ name: form.name ?? "", phone: form.phone ?? "", email: form.email ?? "" });
  if (!contact.success) return fail(`${String(contact.error.issues[0]?.path[0] ?? "name")}Invalid`);
  // Without WhatsApp the code can only go by email.
  if (!getFeatures().messaging && contact.data.email === null) return fail("emailRequired");

  const result = await startBooking(
    {
      start: new Date(start),
      lines: draft.serviceIds.map((serviceId, index) => ({ serviceId, details: details[index]! })),
      name: contact.data.name,
      phone: contact.data.phone,
      email: contact.data.email,
      idempotencyKey,
      source: readAttribution(getConfig().SESSION_SECRET, request.cookies.get(ATTRIBUTION_COOKIE)?.value),
      address: clientAddress(request),
    },
    request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value,
    // The code goes out in the page's language, which a confirmed booking keeps for later messages.
    { locale: requestLocale(request) },
  );

  if (!result.ok) {
    const step = ["SlotTaken", "SlotUnavailable"].includes(result.reason)
      ? "time"
      : result.reason === "RateLimited"
        ? "contact"
        : "service";
    const response = next(request, stepPath(step, { error: result.reason }), { error: result.reason }, 409);
    setDraft(request, response, step === "time" ? { ...draft, start: null } : draft);
    return response;
  }
  if ("confirmed" in result) {
    const response = next(request, `/b/${result.confirmed.manageToken}?new=1`, { confirmed: true });
    setDraft(request, response, null);
    return response;
  }
  const { held, code, emailOnFile } = result;
  if (!code.ok) log.warn({ holdId: held.appointmentId, reason: code.reason }, "booking code not sent");
  const response = next(request, stepPath("code", code.ok ? {} : { error: `code${code.reason}` }), {
    holdId: held.appointmentId,
    holdExpiresAt: held.holdExpiresAt,
    codeSent: code.ok,
  });
  setDraft(request, response, {
    ...draft,
    holdId: held.appointmentId,
    holdExpiresAt: held.holdExpiresAt.toISOString(),
    codeChannel: code.ok ? code.channel : null,
    codeTo: code.ok ? (code.channel === "email" ? maskEmail(code.to) : maskPhone(code.to)) : null,
    emailOnFile: emailOnFile ? maskEmail(emailOnFile) : null,
    codeSentAt: code.ok ? Date.now() : null,
    hasEmail: contact.data.email !== null,
    email: contact.data.email,
  });
  return response;
}
