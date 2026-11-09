import { ActionForm, Panel } from "@/components/admin/parts";
import { defineViews } from "@/extension/views";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { isolate } from "@/i18n/t";
import { listServices } from "@/server/repos/catalog";
import type { Appointment } from "@/server/repos/appointments";
import { formatLocal } from "@/server/time";
import { DraftPet } from "./server/lines";
import { listPets } from "./server/pets";
import { petPhotoLines, photosOn } from "./server/photos";
import { listServiceRules, speciesFor } from "./server/rules";
import { say } from "./server/strings";
import * as dogGrooming from "./views/dog-grooming";
import { PetFieldset } from "./views/PetFieldset";
import { PetPhotos } from "./views/PetPhotos";
import { photoAction } from "./views/photo-action";

// What pets show in the core's pages: the pet fields on the details step, the
// photos on the private link, the pets on the owner's customer record, the
// pet-to-service rules on her content screen, their lines in the privacy
// notice, and the dog-grooming campaign page.

/** One pet's fields on the details step. Dog or cat is asked only when the service is for both. */
async function PetLine({ index, count, serviceId, serviceName, typed }: { index: number; count: number; serviceId: number; serviceName: string; typed: unknown }) {
  const rules = await listServiceRules();
  const draft = DraftPet.safeParse(typed ?? {});
  return (
    <PetFieldset
      index={index}
      count={count}
      pet={{ serviceName, speciesOptions: speciesFor(serviceId, rules), typed: draft.success ? draft.data : DraftPet.parse({}) }}
    />
  );
}

/** Optional pet photos under the booking, while it is ahead and photo analysis is on. */
async function Photos({ token, csrf, appointment }: { token: string; csrf: string; appointment: Appointment }) {
  if (!(await photosOn(appointment))) return null;
  return <PetPhotos token={token} csrf={csrf} pets={await petPhotoLines(appointment.id)} />;
}

/** The customer's pets, with the vet and the vaccination certificate. */
async function CustomerPets({ customerId }: { customerId: number }) {
  const [{ t: core, locale }, pets] = await Promise.all([getI18n(), listPets(customerId)]);
  const t = say(core);
  return (
    <Panel id="pets" title={t("customers.pets")}>
      {pets.length === 0 ? (
        <p className="text-ink-muted">{t("admin.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pets.map((pet) => (
            <li key={pet.id} className="rounded-2xl bg-paper p-3">
              <span className="font-semibold">{pet.name}</span> · {t(`pets.${pet.species}`)}
              {pet.breed ? ` · ${pet.breed}` : ""}
              {pet.vetName ? (
                <p className="text-sm text-ink-muted">
                  {t("cal.vet", { name: pet.vetName })} ·{" "}
                  {pet.vaccinesConfirmedAt
                    ? t("customers.vaccinesConfirmed", { date: isolate(formatLocal(pet.vaccinesConfirmedAt, "dd/MM/yyyy", locale)) })
                    : t("cal.vaccinesNo")}
                </p>
              ) : null}
              {pet.temperamentNote ? <p className="text-sm text-ink-muted">{pet.temperamentNote}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const WEIGHT = { small: "pets.small", large: "pets.large", unknown: "pets.unknownWeight" } as const;

/** Which service each kind, age and size of pet gets. The owner changes the service; the list of kinds is fixed. */
async function Rules({ csrf }: { csrf: string }) {
  const [{ t: core, locale }, services, rules] = await Promise.all([getI18n(), listServices(), listServiceRules()]);
  const t = say(core);
  return (
    <Panel id="rules" title={t("catalog.rules")}>
      <ul className="flex flex-col gap-2">
        {rules.map((rule) => (
          <li key={rule.id}>
            <ActionForm
              action="/api/admin/catalog"
              csrf={csrf}
              name="rule"
              hidden={{ species: rule.species, request: rule.request, ageGroup: rule.ageGroup ?? "", weightGroup: rule.weightGroup ?? "" }}
              className="flex flex-wrap items-center gap-2 rounded-2xl bg-paper p-3"
            >
              <span className="flex-1 font-semibold">
                {[
                  `pets.${rule.species}`,
                  rule.ageGroup ? `pets.${rule.ageGroup}` : null,
                  rule.weightGroup ? WEIGHT[rule.weightGroup] : null,
                  `pets.${rule.request}`,
                ]
                  .filter((key) => key !== null)
                  .map((key) => t(key))
                  .join(" · ")}
              </span>
              <select name="serviceId" defaultValue={rule.serviceId} className="input w-auto" aria-label={t("catalog.services")}>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {pick(locale, service, "name")}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">
                {t("admin.save")}
              </button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The pet lines of the privacy notice. Written in Hebrew and English; any other language reads the Hebrew. */
function privacy({ part, language }: { part: "collected" | "shared" | "kept"; language: string }) {
  const english = language === "en";
  if (part === "collected")
    return english ? (
      <>
        <li>Your pet&apos;s details: name, species, breed, age, rough weight, and any notes you write.</li>
        <li>A photo of your pet, if you choose to upload one.</li>
      </>
    ) : (
      <>
        <li>פרטי חיית המחמד: שם, סוג, גזע, גיל ומשקל משוער, והערות שכתבתם.</li>
        <li>תמונה של חיית המחמד, אם בחרתם להעלות אחת.</li>
      </>
    );
  if (part === "shared")
    return english ? (
      <li>
        If the salon has turned on AI photo analysis, the photo and your pet&apos;s details (without your name or
        phone) are sent to the AI provider only to prepare the grooming. The salon can turn this off at any time.
      </li>
    ) : (
      <li>
        אם המספרה הפעילה ניתוח תמונות בבינה מלאכותית, התמונה ופרטי החיה (בלי שם ובלי טלפון) נשלחים לספק הבינה
        המלאכותית לצורך הכנת הטיפול בלבד. המספרה רשאית לכבות את השירות בכל עת.
      </li>
    );
  return english ? (
    <li>Customer, pet and appointment details are kept while you are a customer, or until you ask us to delete them.</li>
  ) : (
    <li>פרטי לקוח, חיות ותורים נשמרים כל עוד אתם לקוחות המספרה, או עד שתבקשו למחוק אותם.</li>
  );
}

export default defineViews({
  id: "pets",
  lineFields: (props) => <PetLine {...props} />,
  manage: (props) => <Photos {...props} />,
  manageNotices: { photoAdded: "manage.photoAdded", photoSaved: "manage.photoSaved" },
  customer: (props) => <CustomerPets {...props} />,
  catalog: (props) => <Rules {...props} />,
  actions: { photo: photoAction },
  privacy,
  landingPages: { "dog-grooming": dogGrooming },
});
