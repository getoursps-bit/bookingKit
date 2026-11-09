import { z } from "zod";
import { signValue, verifySignedValue } from "../security";

// The booking steps keep their progress in one signed cookie, so every step is
// a plain server-rendered page and works without JavaScript.

export const DRAFT_COOKIE = "bk_book";

/**
 * Booking several pets at once, each with its own service. Off for now (owner,
 * 2026-10-30): choosing a service goes straight to the time step, one pet per
 * booking. The rest of the flow still handles several pets, so turning this on
 * brings back the "bringing another pet?" list.
 */
export const MULTI_PET_BOOKING = false;
export const DRAFT_MAX_AGE_S = 2 * 60 * 60;

/** What was typed for one pet on the details step, kept so an error does not empty the form. */
export const DraftPet = z.object({
  species: z.enum(["dog", "cat"]).nullable().default(null),
  name: z.string().max(40).default(""),
  breed: z.string().max(60).default(""),
  vetName: z.string().max(80).default(""),
  vaccinesConfirmed: z.boolean().default(false),
});
export type DraftPet = z.output<typeof DraftPet>;

const Draft = z.object({
  /** The chosen service for each pet, in order. */
  serviceIds: z.array(z.number().int().positive()).max(10).default([]),
  pets: z.array(DraftPet).max(10).default([]),
  /** The chosen start, as an ISO instant. */
  start: z.string().nullable().default(null),
  /** A start picked before the services (the home page's first free time), offered on the time step. */
  wantedStart: z.string().nullable().default(null),
  holdId: z.number().int().positive().nullable().default(null),
  holdExpiresAt: z.string().nullable().default(null),
  /** Where the code went, and when, for the "send by email" offer. */
  codeChannel: z.enum(["whatsapp", "email"]).nullable().default(null),
  codeSentAt: z.number().nullable().default(null),
  hasEmail: z.boolean().default(false),
  /** The email typed on the contact step; the code goes there even when another record holds it. */
  email: z.string().max(200).nullable().default(null),
  /** Where the code went, masked ("k***@proton.me", "***1234"). */
  codeTo: z.string().max(200).nullable().default(null),
  /** The verified email on file, masked, when a different one was typed. */
  emailOnFile: z.string().max(200).nullable().default(null),
  /** One key per contact form, so a double submit gets the same hold. */
  idempotencyKey: z.string().nullable().default(null),
});
export type Draft = z.output<typeof Draft>;

export const EMPTY_DRAFT: Draft = Draft.parse({});

export function encodeDraft(secret: string, draft: Draft): string {
  return signValue(secret, Buffer.from(JSON.stringify(draft)).toString("base64url"));
}

export function decodeDraft(secret: string, cookie: string | undefined): Draft {
  if (!cookie) return EMPTY_DRAFT;
  const value = verifySignedValue(secret, cookie);
  if (!value) return EMPTY_DRAFT;
  try {
    return Draft.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return EMPTY_DRAFT;
  }
}
