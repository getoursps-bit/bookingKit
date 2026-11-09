import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, AdminNotice, Panel } from "@/components/admin/parts";
import { Phone, Time } from "@/components/site/values";
import { getI18n } from "@/i18n/server";
import { isolate, translator, type MessageKey } from "@/i18n/t";
import { customerBookings, customerConsents } from "@/server/admin/data";
import { getCustomer, listPets } from "@/server/repos/customers";
import { requireStaffPage } from "@/server/staff/session";
import { formatLocal } from "@/server/time";

export async function generateMetadata() {
  const { locale } = await getI18n();
  return { title: translator(locale)("customers.title") };
}

const STATUSES = new Set(["confirmed", "completed", "no_show", "cancelled"]);
const SPECIES: Record<string, MessageKey> = { dog: "pets.dog", cat: "pets.cat" };
const PURPOSES = new Set(["appointment_messages", "photo_analysis", "gallery_photo"]);

/** One customer: contact, pets, bookings, internal notes, consents, merge, export and erase. */
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id: raw } = await params;
  const notice = await searchParams;
  const { csrf } = await requireStaffPage();
  const { t, locale } = await getI18n();
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
  const customer = Number.isNaN(id) ? null : await getCustomer(id);
  if (!customer || customer.erasedAt) notFound();
  const [pets, bookings, consents] = await Promise.all([listPets(id), customerBookings(id, locale), customerConsents(id)]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/customers" className="text-sm underline">
          {t("admin.nav.customers")}
        </Link>
        <h1 className="text-2xl font-extrabold">{customer.displayName}</h1>
        <p className="text-ink-muted">
          {customer.phoneE164 ? <Phone e164={customer.phoneE164} /> : null}
          {customer.noShowCount > 0 ? ` · ${t("cal.noShow")}: ${customer.noShowCount}` : null}
        </p>
      </div>
      <AdminNotice {...notice} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="pets" title={t("customers.pets")}>
          {pets.length === 0 ? (
            <p className="text-ink-muted">{t("admin.none")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pets.map((pet) => (
                <li key={pet.id} className="rounded-2xl bg-paper p-3">
                  <span className="font-semibold">{pet.name}</span> · {SPECIES[pet.species] ? t(SPECIES[pet.species]!) : pet.species}
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

        <Panel id="notes" title={t("customers.notes")}>
          <ActionForm action="/api/admin/customers" csrf={csrf} name="notes" hidden={{ id }} className="flex flex-col gap-3">
            <label htmlFor="notes" className="visually-hidden">
              {t("customers.notes")}
            </label>
            <textarea id="notes" name="notes" maxLength={2000} defaultValue={customer.notes ?? ""} className="input min-h-28" />
            <button type="submit" className="btn btn-primary self-start">
              {t("admin.save")}
            </button>
          </ActionForm>
        </Panel>

        <Panel id="bookings" title={t("customers.bookings")}>
          {bookings.length === 0 ? (
            <p className="text-ink-muted">{t("admin.none")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {bookings.map((booking) => (
                <li key={booking.id} className="flex flex-wrap gap-2">
                  <a href={`/admin/calendar?appointment=${booking.id}`} className="font-semibold underline">
                    <Time value={booking.start} pattern="dd/MM/yyyy HH:mm" />
                  </a>
                  <span>{booking.services}</span>
                  <span className="text-ink-muted">{STATUSES.has(booking.status) ? t(`manage.status.${booking.status}` as MessageKey) : booking.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="consents" title={t("customers.consents")}>
          {consents.length === 0 ? (
            <p className="text-ink-muted">{t("admin.none")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {consents.map((consent, index) => (
                <li key={index}>
                  {PURPOSES.has(consent.purpose)
                    ? translator(locale)(`consent.${consent.purpose}` as MessageKey)
                    : consent.purpose} · <Time value={consent.grantedAt} pattern="dd/MM/yyyy" />
                  {consent.revokedAt ? (
                    <span className="text-danger">
                      {" "}
                      · {t("manage.status.cancelled")} <Time value={consent.revokedAt} pattern="dd/MM/yyyy" />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel id="manage" title={t("admin.nav.settings")}>
        <div className="flex flex-col gap-5">
          <ActionForm action="/api/admin/customers" csrf={csrf} name="merge" hidden={{ id }} className="flex flex-wrap items-end gap-2">
            <label className="field flex-1">
              <span className="field-label">{t("customers.mergeId")}</span>
              <input name="dropId" required inputMode="numeric" pattern="\d+" dir="ltr" className="input" />
            </label>
            <button type="submit" className="btn btn-secondary">
              {t("customers.merge")}
            </button>
          </ActionForm>
          <a href={`/api/admin/customers/export?id=${id}`} className="btn btn-secondary self-start" download>
            {t("customers.export")}
          </a>
          <ActionForm action="/api/admin/customers" csrf={csrf} name="erase" hidden={{ id }} className="flex flex-col gap-2 rounded-2xl bg-danger-soft p-3">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="confirm" required className="mt-1 size-5 accent-brand" />
              {t("customers.eraseAsk")}
            </label>
            <button type="submit" className="btn bg-danger text-white self-start">
              {t("customers.erase")}
            </button>
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}
