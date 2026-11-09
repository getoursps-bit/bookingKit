import { Icon } from "@/components/ui/Icon";
import { getI18n } from "@/i18n/server";
import type { DraftPet } from "@/server/booking/draft";
import { FormSecrets } from "./parts";
import { SubmitButton } from "./SubmitButton";

export type PetFields = {
  /** The service chosen for this pet, as shown to the customer. */
  serviceName: string;
  /** Dog or cat, asked only when the service is for both. */
  speciesOptions: ("dog" | "cat")[];
  typed: DraftPet;
};

/** One pet's details: name, dog or cat when the service does not say, breed, vet, and whether it has a vaccination certificate. */
async function PetFieldset({ pet, index, count }: { pet: PetFields; index: number; count: number }) {
  const { t } = await getI18n();
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

/**
 * Step 3, the last before the code: each pet's details, then name and mobile
 * number (required) and email (optional, only for the fallback; required when
 * WhatsApp is not set up, since the code goes by email). Sending the form
 * takes the slot and sends the code.
 */
export async function ContactStep({
  csrf,
  renderedAt,
  summary,
  pets,
  errorField,
  emailRequired = false,
}: {
  csrf: string;
  renderedAt: string;
  summary: string;
  pets: PetFields[];
  errorField?: "name" | "phone" | "email";
  /** True when WhatsApp is off: the code can only go by email. */
  emailRequired?: boolean;
}) {
  const { t } = await getI18n();
  const invalid = (field: string) =>
    errorField === field ? { "aria-invalid": true as const, "aria-describedby": "contact-error" } : {};
  return (
    <form method="post" action="/api/booking/hold" className="card flex flex-col gap-5 p-5">
      <FormSecrets csrf={csrf} renderedAt={renderedAt} />
      <p className="chip w-fit">
        <Icon name="calendar" size={16} />
        {summary}
      </p>
      {pets.map((pet, index) => (
        <PetFieldset key={index} pet={pet} index={index} count={pets.length} />
      ))}
      <h3 className="text-lg font-bold">{t("details.contactTitle")}</h3>
      <div className="field">
        <label htmlFor="name" className="field-label">
          {t("contact.name")}
        </label>
        <input
          id="name"
          name="name"
          className="input"
          required
          maxLength={80}
          autoComplete="name"
          enterKeyHint="next"
          {...invalid("name")}
        />
      </div>
      <div className="field">
        <label htmlFor="phone" className="field-label">
          {t("contact.phone")}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          className="input text-end"
          required
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="next"
          pattern="[\d\s\-+().]{9,20}"
          aria-describedby={errorField === "phone" ? "contact-error phone-help" : "phone-help"}
          aria-invalid={errorField === "phone" || undefined}
        />
        <p id="phone-help" className="field-help">
          {t("contact.phoneHelp")}
        </p>
      </div>
      <div className="field">
        <label htmlFor="email" className="field-label">
          {t(emailRequired ? "contact.emailRequired" : "contact.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          className="input text-end"
          maxLength={200}
          required={emailRequired}
          autoComplete="email"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          aria-describedby={errorField === "email" ? "contact-error email-help" : "email-help"}
          aria-invalid={errorField === "email" || undefined}
        />
        <p id="email-help" className="field-help">
          {t(emailRequired ? "contact.emailRequiredHelp" : "contact.emailHelp")}
        </p>
      </div>
      <SubmitButton className="btn btn-primary min-h-12 self-stretch sm:self-start sm:px-8">
        <Icon name="chat" />
        {t("contact.submit")}
      </SubmitButton>
    </form>
  );
}
