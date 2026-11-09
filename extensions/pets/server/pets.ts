import { type Db, query } from "@/server/db";
import type { AgeGroup, Species, WeightGroup } from "./rules";

// The pets a customer has booked for. Saved once the customer's phone is
// proven, and updated when the same pet is booked again.

export type Pet = {
  id: number;
  customerId: number;
  name: string;
  species: Species;
  breed: string | null;
  ageGroup: AgeGroup;
  weightGroup: WeightGroup | null;
  coatNotes: string | null;
  temperamentNote: string | null;
  /** The vet or clinic the customer named when booking. */
  vetName: string | null;
  /** When the customer last said the pet has a vaccination certificate; null for no. */
  vaccinesConfirmedAt: Date | null;
};

const PET_COLUMNS = `id::int, customer_id::int as "customerId", name, species, breed, age_group as "ageGroup",
  weight_group as "weightGroup", coat_notes as "coatNotes", temperament_note as "temperamentNote",
  vet_name as "vetName", vaccines_confirmed_at as "vaccinesConfirmedAt"`;

export async function listPets(customerId: number, db?: Db): Promise<Pet[]> {
  return query<Pet>(`select ${PET_COLUMNS} from pets where customer_id = $1 order by id`, [customerId], db);
}

/** Creates a pet, or updates one that belongs to the same customer. */
export async function upsertPet(pet: Omit<Pet, "id"> & { id?: number }, db?: Db): Promise<Pet> {
  const params = [
    pet.customerId,
    pet.name,
    pet.species,
    pet.breed,
    pet.ageGroup,
    pet.weightGroup,
    pet.coatNotes,
    pet.temperamentNote,
    pet.vetName,
    pet.vaccinesConfirmedAt,
  ];
  const [saved] = pet.id
    ? await query<Pet>(
        `update pets set name = $2, species = $3, breed = $4, age_group = $5, weight_group = $6, coat_notes = $7,
           temperament_note = $8, vet_name = $9, vaccines_confirmed_at = $10
         where id = $11 and customer_id = $1 returning ${PET_COLUMNS}`,
        [...params, pet.id],
        db,
      )
    : await query<Pet>(
        `insert into pets (customer_id, name, species, breed, age_group, weight_group, coat_notes, temperament_note,
           vet_name, vaccines_confirmed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${PET_COLUMNS}`,
        params,
        db,
      );
  if (!saved) throw new Error(`Pet ${pet.id} not found for this customer`);
  return saved;
}

