import { randomUUID } from "node:crypto";
import { aiOn, aiResults, closeAiJob, queueAiJob } from "@ext/ai/server/api";
import { type Db, getPool, query, withTransaction } from "@/core/platform/db";
import { getFeatures } from "@/core/platform/features";
import { resolveManageToken } from "@/core/booking/manageTokens";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, toWebp } from "@/core/platform/photos";
import type { Appointment } from "@/core/booking/appointments";
import { readSettings } from "@/core/platform/settings";
import { getStorage } from "@/core/platform/storage";
import { COAT_CONDITIONS, type CoatCondition, PET_SETTINGS, type PhotoResult } from "./photo-ai";

/** A pet photo is deleted this many days after its visit. */
export const PHOTO_KEEP_DAYS = 90;

export type PhotoError = "NotFound" | "Off" | "Invalid";

/** One pet of a booking, with its photo and what the analysis suggested. */
export type PetPhotoLine = {
  petId: number | null;
  name: string | null;
  hasPhoto: boolean;
  /** The photo analysis, until the customer accepts or corrects it. */
  suggestion: { breed: string | null; coat: string | null; condition: string } | null;
  breed: string | null;
  coatCondition: string | null;
};

/** Photos can be added: the booking is still ahead, and storage and photo analysis are both on. */
export async function photosOn(appointment: Appointment, now = new Date(), db: Db = getPool()): Promise<boolean> {
  return appointment.status === "confirmed" && appointment.end > now && (await analysisOn(db));
}

/** Photos are taken only to be analysed: that needs storage, the ai extension with a provider, and the owner's switch. */
async function analysisOn(db: Db): Promise<boolean> {
  return getFeatures().photoUploads && aiOn() && (await readSettings(PET_SETTINGS, db))["ai.photo"];
}

export async function petPhotoLines(appointmentId: number, db: Db = getPool()): Promise<PetPhotoLine[]> {
  const lines = await query<Omit<PetPhotoLine, "suggestion">>(
    `select ap.pet_id::int as "petId", p.name, p.breed, p.coat_condition as "coatCondition",
       exists (select 1 from pet_photos ph where ph.pet_id = ap.pet_id and ph.appointment_id = ap.appointment_id) as "hasPhoto"
     from appointment_lines ap
     left join pets p on p.id = ap.pet_id
     where ap.appointment_id = $1 order by ap.position`,
    [appointmentId],
    db,
  );
  const suggestions = aiOn() ? await aiResults<PhotoResult>("photo", appointmentId, db) : new Map<number | null, PhotoResult>();
  return lines.map((line) => ({ ...line, suggestion: (line.petId === null ? null : suggestions.get(line.petId)) ?? null }));
}

/**
 * Saves one photo for a pet in a booking, from the private link. The image is
 * re-encoded to WebP at most 1280 px wide with no metadata (so no location),
 * stored privately, the analysis consent is recorded, and an AI job queued.
 * The booking itself is never changed.
 */
export async function savePetPhoto(
  input: { token: string; petId: number; bytes: Uint8Array; type: string },
  db: Db = getPool(),
): Promise<{ ok: true } | { ok: false; reason: PhotoError }> {
  const appointment = await resolveManageToken(input.token, db);
  if (!appointment || appointment.status !== "confirmed") return { ok: false, reason: "NotFound" };
  if (!(await analysisOn(db))) return { ok: false, reason: "Off" };
  if (!PHOTO_TYPES.includes(input.type) || input.bytes.length === 0 || input.bytes.length > PHOTO_MAX_BYTES) {
    return { ok: false, reason: "Invalid" };
  }
  const [line] = await query(
    "select 1 from appointment_lines where appointment_id = $1 and pet_id = $2",
    [appointment.id, input.petId],
    db,
  );
  if (!line) return { ok: false, reason: "NotFound" };

  const webp = await toWebp(input.bytes, 1280);
  if (!webp) return { ok: false, reason: "Invalid" };

  const key = `pets/${randomUUID()}.webp`;
  await getStorage().put(key, webp, "image/webp");
  const old = await withTransaction(async (client) => {
    const [previous] = await query<{ key: string }>(
      "delete from pet_photos where pet_id = $1 and appointment_id = $2 returning storage_key as key",
      [input.petId, appointment.id],
      client,
    );
    await query("insert into pet_photos (pet_id, appointment_id, storage_key) values ($1, $2, $3)", [input.petId, appointment.id, key], client);
    await query(
      "insert into consents (customer_id, purpose, source) values ($1, 'photo_analysis', 'private_link')",
      [appointment.customerId],
      client,
    );
    await queueAiJob("photo", { appointmentId: appointment.id, subjectId: input.petId }, client);
    return previous?.key ?? null;
  }, db);
  if (old) await getStorage().delete(old).catch(() => undefined);
  return { ok: true };
}

/** Saves what the customer accepted or corrected from the photo suggestion onto the pet. */
export async function acceptSuggestion(
  input: { token: string; petId: number; breed: string; condition: string },
  db: Db = getPool(),
): Promise<boolean> {
  const appointment = await resolveManageToken(input.token, db);
  if (!appointment) return false;
  const condition = (COAT_CONDITIONS as readonly string[]).includes(input.condition) ? (input.condition as CoatCondition) : "unclear";
  if (!aiOn()) return false;
  const suggestion = (await aiResults<PhotoResult>("photo", appointment.id, db)).get(input.petId);
  if (!suggestion) return false;
  await query(
    `update pets set breed = $3, coat_type = $4, coat_condition = $5
     where id = $2 and customer_id = $1`,
    [appointment.customerId, input.petId, input.breed.trim().slice(0, 60) || null, suggestion.coat, condition],
    db,
  );
  // The suggestion is used up; the page then shows the saved values.
  await closeAiJob("photo", { appointmentId: appointment.id, subjectId: input.petId }, "accepted", db);
  return true;
}

/** Deletes photos 90 days after their visit. Run daily by the worker. */
export async function deleteExpiredPhotos(now: Date = new Date(), db: Db = getPool()): Promise<number> {
  const rows = await query<{ id: number; key: string }>(
    `select ph.id::int, ph.storage_key as key from pet_photos ph join appointments a on a.id = ph.appointment_id
     where a.ends_at < $1::timestamptz - make_interval(days => $2::int)`,
    [now, PHOTO_KEEP_DAYS],
    db,
  );
  for (const row of rows) {
    await getStorage().delete(row.key);
    await query("delete from pet_photos where id = $1", [row.id], db);
  }
  return rows.length;
}
