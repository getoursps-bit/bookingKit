import type { NextRequest } from "next/server";
import { z } from "zod";
import { readAttribution, ATTRIBUTION_COOKIE } from "@/server/attribution";
import { type DraftPet } from "@/server/booking/draft";
import { startBooking } from "@/server/booking/flow";
import { speciesFor } from "@/server/booking/serviceRules";
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
} from "@/server/booking/http";
import { getConfig } from "@/server/config";
import { getFeatures } from "@/server/features";
import { TRUSTED_DEVICE_COOKIE } from "@/server/identity/tokens";
import { normalizePhone } from "@/server/links";
import { listServiceRules } from "@/server/repos/catalog";
import { log } from "@/server/log";
import { maskEmail, maskPhone } from "@/server/repos/customers";

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

/** The details typed for each chosen service's pet: `pets.<i>.name`, `.species`, `.breed`, `.vet`, `.vaccines`. */
function typedPets(form: Record<string, string | undefined>, count: number): DraftPet[] {
  return Array.from({ length: count }, (_, i) => {
    const field = (name: string) => (form[`pets.${i}.${name}`] ?? "").trim();
    const species = field("species");
    return {
      species: species === "dog" || species === "cat" ? species : null,
      name: field("name").slice(0, 40),
      breed: field("breed").slice(0, 60),
      vetName: field("vet").slice(0, 80),
      vaccinesConfirmed: field("vaccines") === "yes",
    };
  });
}

/** The first missing pet detail, as an error key, or null when every pet is complete. */
function missingPetDetail(pets: DraftPet[]): string | null {
  for (const pet of pets) {
    if (!pet.name) return "petNameRequired";
    if (!pet.species) return "speciesRequired";
    if (!pet.vetName) return "vetRequired";
  }
  return null;
}

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
  // A service for one species decides it; "nails only" asks.
  const rules = await listServiceRules();
  const pets = typedPets(form, saved.serviceIds.length).map((pet, i) => {
    const allowed = speciesFor(saved.serviceIds[i]!, rules);
    return allowed.length === 1 ? { ...pet, species: allowed[0]! } : pet;
  });
  // What was typed stays in the draft, so an error does not empty the form.
  const draft = { ...saved, pets };
  const fail = (error: string) => {
    const response = next(request, stepPath("contact", { error }), {}, 400);
    setDraft(request, response, draft);
    return response;
  };
  const missing = missingPetDetail(pets);
  if (missing) return fail(missing);
  const contact = Contact.safeParse({ name: form.name ?? "", phone: form.phone ?? "", email: form.email ?? "" });
  if (!contact.success) return fail(`${String(contact.error.issues[0]?.path[0] ?? "name")}Invalid`);
  // Without WhatsApp the code can only go by email.
  if (!getFeatures().whatsappMessages && contact.data.email === null) return fail("emailRequired");

  const result = await startBooking(
    {
      start: new Date(start),
      pets: pets.map((pet, i) => ({
        serviceId: draft.serviceIds[i]!,
        species: pet.species!,
        name: pet.name,
        breed: pet.breed || null,
        vetName: pet.vetName,
        vaccinesConfirmed: pet.vaccinesConfirmed,
      })),
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
