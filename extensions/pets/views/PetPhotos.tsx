import { SubmitButton } from "@/components/booking/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { getI18n } from "@/i18n/server";
import { COAT_CONDITIONS } from "@/server/ai/types";
import type { PetPhotoLine } from "../server/photos";
import { say } from "../server/strings";

/**
 * Optional pet photos on the private link. Each pet gets one; once analysed,
 * the suggestion is shown to accept or correct. Photos are never required and
 * nothing here changes the booking.
 */
export async function PetPhotos({ token, csrf, pets }: { token: string; csrf: string; pets: PetPhotoLine[] }) {
  const t = say((await getI18n()).t);
  const named = pets.filter((pet): pet is typeof pet & { petId: number } => pet.petId !== null);
  if (named.length === 0) return null;
  return (
    <section aria-labelledby="photos-title" className="card mt-8 flex flex-col gap-4 p-5">
      <div>
        <h2 id="photos-title" className="font-bold">
          {t("manage.photos")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("manage.photosHelp")}</p>
      </div>
      {named.map((pet) => (
        <div key={pet.petId} className="flex flex-col gap-3 rounded-2xl bg-paper p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="paw" className="text-brand" />
            {pet.name}
          </p>
          {pet.suggestion ? (
            <form method="post" action="/api/ext/pets/photo" encType="multipart/form-data" className="flex flex-col gap-3">
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="petId" value={pet.petId} />
              <input type="hidden" name="action" value="accept" />
              <p className="text-sm font-semibold">{t("manage.suggestion")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="field">
                  <span className="field-label">{t("manage.breed")}</span>
                  <input name="breed" maxLength={60} defaultValue={pet.suggestion.breed ?? ""} className="input" />
                </label>
                <label className="field">
                  <span className="field-label">{t("manage.condition")}</span>
                  <select name="condition" defaultValue={pet.suggestion.condition} className="input">
                    {COAT_CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {t(`coat.${condition}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {pet.suggestion.coat ? (
                <p className="text-sm">
                  {t("manage.coat")}: {pet.suggestion.coat}
                </p>
              ) : null}
              <p className="text-sm text-ink-muted">{t("manage.suggestionNote")}</p>
              <SubmitButton className="btn btn-primary w-fit">{t("manage.accept")}</SubmitButton>
            </form>
          ) : pet.coatCondition ? (
            <p className="text-sm">
              {[pet.breed, `${t("manage.savedCondition")}: ${t(`coat.${pet.coatCondition}`)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : pet.hasPhoto ? (
            <p className="text-sm text-ink-muted">{t("manage.photoWaiting")}</p>
          ) : (
            <form method="post" action="/api/ext/pets/photo" encType="multipart/form-data" className="flex flex-col gap-3">
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="petId" value={pet.petId} />
              <label className="field">
                <span className="field-label">{t("manage.photoPick")}</span>
                <input type="file" name="photo" required accept="image/jpeg,image/png,image/webp,image/heic" className="input" />
              </label>
              <SubmitButton className="btn btn-secondary w-fit">{t("manage.photoSend")}</SubmitButton>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
