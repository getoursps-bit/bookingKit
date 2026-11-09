import { z } from "zod";
import { bookingLines, type LineDescription, type LineOf } from "@/extension/types";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/translator";
import { type Db, getPool, query } from "@/server/db";
import type { Service } from "@/server/repos/catalog";
import { listPets, upsertPet } from "./pets";
import { listServiceRules, profileFor, resolveService, type ServiceRule, speciesFor } from "./rules";
import { type Say, say } from "./strings";

// How pets take part in a booking: each line is for one pet. The details step
// asks its name, kind, breed, vet and vaccination certificate; a confirmed
// booking saves the pet on the customer and ties it to the line.

/** What was typed for one pet on the details step, kept so an error does not empty the form. */
export const DraftPet = z.object({
  species: z.enum(["dog", "cat"]).nullable().default(null),
  name: z.string().max(40).default(""),
  breed: z.string().max(60).default(""),
  vetName: z.string().max(80).default(""),
  vaccinesConfirmed: z.boolean().default(false),
});
export type DraftPet = z.output<typeof DraftPet>;

/** One pet as a booking needs it: complete, and strict about its fields. */
const PetInput = z
  .object({
    species: z.enum(["dog", "cat"]),
    name: z.string().trim().min(1).max(40),
    breed: z
      .string()
      .trim()
      .max(60)
      .nullish()
      .transform((value) => value || null),
    /** The vet or clinic that treats the pet. */
    vetName: z.string().trim().min(1).max(80),
    /** Whether the pet has a vaccination certificate, yes or no. */
    vaccinesConfirmed: z.boolean(),
  })
  .strict();

export const petLines = bookingLines<DraftPet>({
  /** The details typed for line `index`: `pets.<i>.name`, `.species`, `.breed`, `.vet`, `.vaccines`. */
  read(form, index) {
    const field = (name: string) => (form[`pets.${index}.${name}`] ?? "").trim();
    const species = field("species");
    return {
      species: species === "dog" || species === "cat" ? species : null,
      name: field("name").slice(0, 40),
      breed: field("breed").slice(0, 60),
      vetName: field("vet").slice(0, 80),
      vaccinesConfirmed: field("vaccines") === "yes",
    };
  },

  /** A service for one species decides it; "nails only" asks. */
  async prepare(lines, db) {
    const rules = await listServiceRules(db);
    return lines.map(({ serviceId, details }) => {
      const allowed = speciesFor(serviceId, rules);
      return allowed.length === 1 ? { ...details, species: allowed[0]! } : details;
    });
  },

  missing(pet) {
    if (!pet.name) return "petNameRequired";
    if (!pet.species) return "speciesRequired";
    if (!pet.vetName) return "vetRequired";
    return null;
  },

  /** Every line needs a whole pet, of a species its service is for. */
  async check(lines, db) {
    const rules = await listServiceRules(db);
    for (const line of lines) {
      const pet = PetInput.safeParse(line.details);
      if (!pet.success) return "NoRule";
      const allowed = speciesFor(line.serviceId, rules);
      if (allowed.length > 0 && !allowed.includes(pet.data.species)) return "NoRule";
    }
    return null;
  },

  async confirm(db, appointment, lines, now) {
    const rules = await listServiceRules(db);
    const known = await listPets(appointment.customerId, db);
    for (const line of lines) {
      const parsed = PetInput.safeParse(line.details);
      if (!parsed.success) continue;
      const draft = parsed.data;
      // A pet booked before (same name and species) is updated, not added again.
      const same = known.find(
        (pet) => pet.species === draft.species && pet.name.trim().toLowerCase() === draft.name.toLowerCase(),
      );
      const profile = profileFor(line.serviceId, draft.species, rules);
      const pet = await upsertPet(
        {
          id: same?.id,
          customerId: appointment.customerId,
          name: draft.name,
          species: draft.species,
          breed: draft.breed ?? same?.breed ?? null,
          // What the service says, else what we knew, else an adult of unknown weight.
          ageGroup: profile.ageGroup ?? same?.ageGroup ?? "adult",
          weightGroup: draft.species === "dog" ? (profile.weightGroup ?? same?.weightGroup ?? "unknown") : null,
          coatNotes: same?.coatNotes ?? null,
          temperamentNote: same?.temperamentNote ?? null,
          vetName: draft.vetName,
          vaccinesConfirmedAt: draft.vaccinesConfirmed ? now : null,
        },
        db,
      );
      await query(
        "update appointment_pets set pet_id = $1 where appointment_id = $2 and position = $3",
        [pet.id, appointment.id, line.position],
        db,
      );
    }
  },
});

/** A line for one pet, as a booking takes it. For tests and for code that books on a customer's behalf. */
export function petLine(serviceId: number, pet: z.input<typeof PetInput>): LineOf<unknown> & { details: { pets: unknown } } {
  return { position: 0, serviceId, details: { pets: pet } };
}

export type PetTag = "dog" | "cat" | "puppy" | "both";

/** Who each service is for, from the pet-to-service rules: dog, cat, puppy, or both. */
export function petTags(rules: ServiceRule[]): Map<number, PetTag> {
  const seen = new Map<number, { dog: boolean; cat: boolean; youngOnly: boolean }>();
  for (const rule of rules) {
    const entry = seen.get(rule.serviceId) ?? { dog: false, cat: false, youngOnly: true };
    entry[rule.species] = true;
    if (rule.ageGroup !== "young") entry.youngOnly = false;
    seen.set(rule.serviceId, entry);
  }
  const tags = new Map<number, PetTag>();
  for (const [id, entry] of seen) {
    tags.set(id, entry.dog && entry.cat ? "both" : entry.youngOnly && entry.dog ? "puppy" : entry.cat ? "cat" : "dog");
  }
  return tags;
}

/** The tag on each service, and the dog or cat filter of the service list. */
export const petServiceTags = {
  param: { name: "species", values: ["dog", "cat"] },
  async load(locale: Locale, db?: Db) {
    const tags = petTags(await listServiceRules(db));
    const t: Say = say(translator(locale));
    return {
      label: (serviceId: number) => {
        const tag = tags.get(serviceId);
        return tag ? t(`tag.${tag}`) : undefined;
      },
      matches: (serviceId: number, species: string) => {
        const tag = tags.get(serviceId);
        if (!tag || tag === "both") return true;
        return species === "cat" ? tag === "cat" : tag !== "cat";
      },
    };
  },
} as const;

/** The home page's free times are worked out for a small adult dog, the most common booking. */
const PREVIEW_PET = { species: "dog", ageGroup: "adult", weightGroup: "small", request: "groom" } as const;

export async function previewService(services: Service[], db?: Db): Promise<Service | null> {
  const preview = resolveService(PREVIEW_PET, await listServiceRules(db), services);
  return preview.ok ? preview.service : null;
}

/** Each booked line's pet: its name, and the vet and vaccination certificate the customer gave. */
export async function describeLines(
  appointmentIds: number[],
  locale: Locale,
  db: Db = getPool(),
): Promise<Map<string, LineDescription>> {
  const t = say(translator(locale));
  const rows = await query<{ key: string; name: string | null; vetName: string | null; vaccines: boolean }>(
    `select ap.appointment_id || ':' || ap.position as key, p.name, p.vet_name as "vetName",
       p.vaccines_confirmed_at is not null as vaccines
     from appointment_pets ap join pets p on p.id = ap.pet_id
     where ap.appointment_id = any($1::bigint[])`,
    [appointmentIds],
    db,
  );
  return new Map(
    rows.map((row) => [
      row.key,
      {
        label: row.name,
        notes: row.vetName
          ? [t("cal.vet", { name: row.vetName }), row.vaccines ? t("cal.vaccinesYes") : t("cal.vaccinesNo")]
          : [],
      },
    ]),
  );
}
