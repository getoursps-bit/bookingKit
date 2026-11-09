import { getAi } from "@/server/ai";
import { type Db, getPool, query } from "@/server/db";
import { getFeatures } from "@/server/features";
import type { Appointment } from "@/server/repos/appointments";
import { getSettings } from "@/server/repos/settings";

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
  const settings = await getSettings(db);
  return (
    appointment.status === "confirmed" &&
    appointment.end > now &&
    settings["ai.photo"] &&
    getFeatures().photoUploads &&
    getAi() !== null
  );
}

export async function petPhotoLines(appointmentId: number, db: Db = getPool()): Promise<PetPhotoLine[]> {
  return query<PetPhotoLine>(
    `select ap.pet_id::int as "petId", p.name, p.breed, p.coat_condition as "coatCondition",
       exists (select 1 from pet_photos ph where ph.pet_id = ap.pet_id and ph.appointment_id = ap.appointment_id) as "hasPhoto",
       (select j.result from ai_jobs j where j.kind = 'photo' and j.status = 'done'
          and j.appointment_id = ap.appointment_id and j.pet_id = ap.pet_id) as suggestion
     from appointment_pets ap
     left join pets p on p.id = ap.pet_id
     where ap.appointment_id = $1 order by ap.position`,
    [appointmentId],
    db,
  );
}
