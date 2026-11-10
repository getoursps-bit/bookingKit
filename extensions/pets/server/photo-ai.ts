import { z } from "zod";
import { type AiJobKind, offerAi } from "@ext/ai/server/api";
import { type Db, query } from "@/server/db";
import { readSettings } from "@/server/repos/settings";
import { getStorage } from "@/server/storage";

// What pets ask of the ai extension (its server/api.ts): a look at a pet's
// photo before the visit, and the pet's facts for the pre-visit note. With
// the ai extension off, none of this runs and photos are not offered.

/** The switch of photo analysis, on the owner's settings screen. */
export const PET_SETTINGS = { "ai.photo": z.boolean().default(false) };

export const COAT_CONDITIONS = ["normal", "tangled", "matted", "very_matted", "unclear"] as const;
export type CoatCondition = (typeof COAT_CONDITIONS)[number];

/** What photo analysis may say: these fields only, never anything about skin, injuries or health. */
export const PhotoResult = z.object({
  species: z.enum(["dog", "cat", "unclear"]),
  breed: z.string().trim().max(60).nullable(),
  coat: z.string().trim().max(60).nullable(),
  condition: z.enum(COAT_CONDITIONS),
});
export type PhotoResult = z.output<typeof PhotoResult>;

// Prompts are versioned: a change gets a new version, recorded with every call.
const PHOTO_PROMPT_VERSION = "photo-v1";

const PHOTO_PROMPT = `You help a pet grooming salon prepare for a visit. Look at the photo of the pet.
Answer with one JSON object and nothing else, with exactly these fields:
- "species": "dog", "cat" or "unclear"
- "breed": the likely breed or mix in Hebrew, or null if you cannot tell
- "coat": the coat type in Hebrew (for example "תלתלי", "ארוך וחלק", "קצר"), or null
- "condition": one of "normal", "tangled", "matted", "very_matted", "unclear"
Describe only the coat as grooming sees it. Never comment on skin, wounds, injuries, weight, health or behaviour.
If the photo does not show a pet clearly, use "unclear" and null.`;

const FAKE: PhotoResult = { species: "dog", breed: "פודל מעורב", coat: "תלתלי", condition: "tangled" };

/** The "photo" job: one pet's photo for one booking. The job's subject is the pet. */
const photo: AiJobKind = {
  on: async (db) => (await readSettings(PET_SETTINGS, db))["ai.photo"],
  input: "image",
  promptVersion: PHOTO_PROMPT_VERSION,
  async request(job, db) {
    const [row] = await query<{ key: string }>(
      "select storage_key as key from pet_photos where pet_id = $1 and appointment_id = $2",
      [job.subjectId, job.appointmentId],
      db,
    );
    const image = row ? await getStorage().get(row.key) : null;
    if (!image) return { skip: "photo gone" };
    return {
      system: PHOTO_PROMPT,
      text: "Return the JSON object for this pet.",
      image: { bytes: image, mediaType: "image/webp" },
      fake: JSON.stringify(FAKE),
    };
  },
  result(answer) {
    const json = /\{[\s\S]*\}/.exec(answer)?.[0];
    return PhotoResult.parse(json ? JSON.parse(json) : null);
  },
};

/** What the pre-visit note may know about each booked pet. */
async function lineFacts(appointmentIds: number[], db: Db): Promise<Map<string, Record<string, unknown>>> {
  const rows = await query<{ key: string } & Record<string, unknown>>(
    `select ap.appointment_id || ':' || ap.position as key, coalesce(p.species, '') as species, p.breed,
       p.coat_notes as "coatNotes", p.coat_condition as "coatCondition", p.temperament_note as "temperamentNote"
     from appointment_lines ap join pets p on p.id = ap.pet_id
     where ap.appointment_id = any($1::bigint[])`,
    [appointmentIds],
    db,
  );
  return new Map(rows.map(({ key, ...facts }) => [key, facts]));
}

export const petAi = offerAi({ jobs: { photo }, lineFacts });
