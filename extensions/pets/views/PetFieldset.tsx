import { getI18n } from "@/i18n/server";
import type { DraftPet } from "../server/lines";
import { say } from "../server/strings";

export type PetFields = {
  /** The service chosen for this pet, as shown to the customer. */
  serviceName: string;
  /** Dog or cat, asked only when the service is for both. */
  speciesOptions: ("dog" | "cat")[];
  typed: DraftPet;
};

/** One pet's details: name, dog or cat when the service does not say, breed, vet, and whether it has a vaccination certificate. */
export async function PetFieldset({ pet, index, count }: { pet: PetFields; index: number; count: number }) {
  const t = say((await getI18n()).t);
  const id = (name: string) => `pet-${index}-${name}`;
  const field = (name: string) => `pets.${index}.${name}`;
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl bg-paper p-4">
      <legend className="mb-1 flex flex-col">
        <span className="text-lg font-bold">{count > 1 ? t("service.petN", { n: index + 1 }) : t("details.petTitle")}</span>
        <span className="text-sm text-ink-muted">{pet.serviceName}</span>
      </legend>
      <div className="field">
        <label htmlFor={id("name")} className="field-label">
          {t("pets.name")}
        </label>
        <input
          id={id("name")}
          name={field("name")}
          className="input"
          required
          maxLength={40}
          autoComplete="off"
          defaultValue={pet.typed.name}
        />
      </div>
      {pet.speciesOptions.length > 1 ? (
        <fieldset className="field">
          <legend className="field-label mb-1.5">{t("pets.species")}</legend>
          <div className="choices">
            {pet.speciesOptions.map((species) => (
              <label key={species} className="choice">
                <input
                  type="radio"
                  name={field("species")}
                  value={species}
                  required
                  defaultChecked={pet.typed.species === species}
                />
                {t(`pets.${species}`)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="field">
        <label htmlFor={id("breed")} className="field-label">
          {t("pets.breed")}
        </label>
        <input
          id={id("breed")}
          name={field("breed")}
          className="input"
          maxLength={60}
          autoComplete="off"
          defaultValue={pet.typed.breed}
        />
      </div>
      <div className="field">
        <label htmlFor={id("vet")} className="field-label">
          {t("details.vet")}
        </label>
        <input
          id={id("vet")}
          name={field("vet")}
          className="input"
          required
          maxLength={80}
          autoComplete="off"
          defaultValue={pet.typed.vetName}
          aria-describedby={id("vet-help")}
        />
        <p id={id("vet-help")} className="field-help">
          {t("details.vetHelp")}
        </p>
      </div>
      <div className="field">
        <label htmlFor={id("vaccines")} className="choice">
          <input
            id={id("vaccines")}
            type="checkbox"
            name={field("vaccines")}
            value="yes"
            defaultChecked={pet.typed.vaccinesConfirmed}
          />
          {t("details.vaccines")}
        </label>
      </div>
    </fieldset>
  );
}

