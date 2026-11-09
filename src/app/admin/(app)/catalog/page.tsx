import type { ReactNode } from "react";
import { GalleryUploadForm } from "@/components/admin/GalleryUploadForm";
import { ActionForm, AdminNotice, Panel } from "@/components/admin/parts";
import type { Locale } from "@/i18n/locales";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { translator, type MessageKey, type Translate } from "@/i18n/t";
import { getFeatures } from "@/server/features";
import { listTemplates } from "@/server/notify/templates";
import {
  getBusinessProfile,
  listGallery,
  listProducts,
  listServiceRules,
  listServices,
  type Product,
  type Service,
} from "@/server/repos/catalog";
import { displayPhone } from "@/server/links";
import { requireStaffPage } from "@/server/staff/session";
import { getStorage } from "@/server/storage";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.nav.catalog") };
}

/** The page's words: the translator, the language, and a label marked as the English field. */
type Words = { t: Translate; locale: Locale; en: (key: MessageKey) => string };

const shekels = (agorot: number) => (agorot / 100).toFixed(agorot % 100 === 0 ? 0 : 2);

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? "sm:col-span-2" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-5 accent-brand" />
      {label}
    </label>
  );
}

function ServiceForm({ csrf, service, words: { t, en } }: { csrf: string; service?: Service; words: Words }) {
  return (
    <ActionForm
      action="/api/admin/catalog"
      csrf={csrf}
      name="service"
      hidden={service ? { id: service.id } : {}}
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field label={t("catalog.name")}>
        <input name="nameHe" required maxLength={80} defaultValue={service?.nameHe} className="input" />
      </Field>
      <Field label={en("catalog.name")}>
        <input name="nameEn" maxLength={80} defaultValue={service?.nameEn ?? ""} dir="ltr" lang="en" className="input" />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label={t("catalog.duration")}>
          <input name="durationMin" type="number" inputMode="numeric" min={5} max={480} step={5} required defaultValue={service?.durationMin} dir="ltr" className="input" />
        </Field>
        <Field label={t("catalog.price")}>
          <input name="price" inputMode="decimal" required defaultValue={service ? shekels(service.priceFromAgorot) : ""} dir="ltr" className="input" />
        </Field>
        <Field label={t("catalog.order")}>
          <input name="sortOrder" type="number" inputMode="numeric" min={0} max={999} defaultValue={service?.sortOrder ?? 0} dir="ltr" className="input" />
        </Field>
      </div>
      <Field label={t("catalog.includes")} wide>
        <textarea name="includesHe" maxLength={500} defaultValue={service?.includesHe ?? ""} className="input min-h-16" />
      </Field>
      <Field label={en("catalog.includes")} wide>
        <textarea
          name="includesEn"
          maxLength={500}
          defaultValue={service?.includesEn ?? ""}
          dir="ltr"
          lang="en"
          className="input min-h-16"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <Check name="bookableOnline" label={t("catalog.online")} checked={service?.bookableOnline ?? true} />
        <Check name="active" label={t("catalog.active")} checked={service?.active ?? true} />
        <button type="submit" className="btn btn-primary ms-auto">
          {service ? t("admin.save") : t("admin.add")}
        </button>
      </div>
    </ActionForm>
  );
}

const PHOTO_TYPES = "image/jpeg,image/png,image/webp";

/** One photo in a form: the current one, a file field to add or replace it, and a box to remove it. */
function PhotoField({
  label,
  photoUrl,
  uploads,
  t,
}: {
  label: string;
  photoUrl?: string | null;
  uploads: boolean;
  t: Translate;
}) {
  if (!uploads) return <p className="text-sm text-ink-muted sm:col-span-2">{t("admin.error.storageOff")}</p>;
  return (
    <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
      {photoUrl ? (
        // Plain img: these photos come from object storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="size-20 rounded-xl bg-placeholder object-cover" />
      ) : null}
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
        <Field label={photoUrl ? t("catalog.replacePhoto") : label}>
          <input type="file" name="photo" accept={PHOTO_TYPES} className="input" />
        </Field>
        {photoUrl ? <Check name="removePhoto" label={t("catalog.removePhoto")} checked={false} /> : null}
      </div>
    </div>
  );
}

function ProductForm({
  csrf,
  product,
  photoUrl,
  uploads,
  words: { t, en },
}: {
  csrf: string;
  product?: Product;
  /** The product's current photo, when it has one. */
  photoUrl?: string | null;
  uploads: boolean;
  words: Words;
}) {
  return (
    <ActionForm
      action="/api/admin/catalog"
      csrf={csrf}
      name="product"
      multipart
      hidden={product ? { id: product.id } : {}}
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field label={t("catalog.name")}>
        <input name="nameHe" required maxLength={80} defaultValue={product?.nameHe} className="input" />
      </Field>
      <Field label={en("catalog.name")}>
        <input name="nameEn" maxLength={80} defaultValue={product?.nameEn ?? ""} dir="ltr" lang="en" className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("catalog.price")}>
          <input name="price" inputMode="decimal" required defaultValue={product ? shekels(product.priceAgorot) : ""} dir="ltr" className="input" />
        </Field>
        <Field label={t("catalog.order")}>
          <input name="sortOrder" type="number" inputMode="numeric" min={0} max={999} defaultValue={product?.sortOrder ?? 0} dir="ltr" className="input" />
        </Field>
      </div>
      <Field label={t("catalog.description")} wide>
        <input name="descriptionHe" maxLength={300} defaultValue={product?.descriptionHe ?? ""} className="input" />
      </Field>
      <Field label={en("catalog.description")} wide>
        <input
          name="descriptionEn"
          maxLength={300}
          defaultValue={product?.descriptionEn ?? ""}
          dir="ltr"
          lang="en"
          className="input"
        />
      </Field>
      <PhotoField label={t("catalog.photo")} photoUrl={photoUrl} uploads={uploads} t={t} />
      <div className="flex items-center gap-4 sm:col-span-2">
        <Check name="active" label={t("catalog.active")} checked={product?.active ?? true} />
        <button type="submit" className="btn btn-primary ms-auto">
          {product ? t("admin.save") : t("admin.add")}
        </button>
      </div>
    </ActionForm>
  );
}

function Item({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-2xl bg-paper p-3 open:pb-4">
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

const SPECIES = { dog: "pets.dog", cat: "pets.cat" } as const satisfies Record<string, MessageKey>;
const AGE = { young: "pets.young", adult: "pets.adult" } as const satisfies Record<string, MessageKey>;
const WEIGHT = { small: "pets.small", large: "pets.large", unknown: "pets.unknownWeight" } as const satisfies Record<
  string,
  MessageKey
>;
const REQUEST = { groom: "pets.groom", nails: "pets.nails" } as const satisfies Record<string, MessageKey>;

/** Everything the public site shows: services and prices, rules, products, gallery, profile, message wording. */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const search = await searchParams;
  const { csrf } = await requireStaffPage();
  const { t, locale } = await getI18n();
  const en = (key: MessageKey) => `${t(key)}${translator(locale)("catalog.englishSuffix")}`;
  const words: Words = { t, locale, en };
  const inactive = ` (${translator(locale)("catalog.inactive")})`;
  const channelName = (channel: "whatsapp" | "email" | "push") =>
    channel === "whatsapp" ? t("contact.whatsapp") : translator(locale)(`channel.${channel}`);
  const [services, rules, products, gallery, profile, templates] = await Promise.all([
    listServices(),
    listServiceRules(),
    listProducts(),
    listGallery(),
    getBusinessProfile(),
    listTemplates(),
  ]);
  const uploads = getFeatures().photoUploads;
  const storage = getStorage();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">{t("admin.nav.catalog")}</h1>
      <AdminNotice {...search} />

      <Panel id="services" title={t("catalog.services")}>
        <div className="flex flex-col gap-2">
          {services.map((service) => (
            <Item key={service.id} title={`${pick(locale, service.nameHe, service.nameEn)}${service.active ? "" : inactive}`}>
              <ServiceForm csrf={csrf} service={service} words={words} />
            </Item>
          ))}
          <Item title={`+ ${t("admin.add")}`}>
            <ServiceForm csrf={csrf} words={words} />
          </Item>
        </div>
      </Panel>

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
                    SPECIES[rule.species],
                    rule.ageGroup ? AGE[rule.ageGroup] : null,
                    rule.weightGroup ? WEIGHT[rule.weightGroup] : null,
                    REQUEST[rule.request],
                  ]
                    .filter((key) => key !== null)
                    .map((key) => t(key))
                    .join(" · ")}
                </span>
                <select name="serviceId" defaultValue={rule.serviceId} className="input w-auto" aria-label={t("catalog.services")}>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {pick(locale, service.nameHe, service.nameEn)}
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

      <Panel id="products" title={t("catalog.products")}>
        <div className="flex flex-col gap-2">
          {products.map((product) => (
            <Item key={product.id} title={`${pick(locale, product.nameHe, product.nameEn)}${product.active ? "" : inactive}`}>
              <ProductForm
                csrf={csrf}
                product={product}
                photoUrl={product.imageKey ? storage.publicUrl(product.imageKey) : null}
                uploads={uploads}
                words={words}
              />
            </Item>
          ))}
          <Item title={`+ ${t("admin.add")}`}>
            <ProductForm csrf={csrf} uploads={uploads} words={words} />
          </Item>
        </div>
      </Panel>

      <Panel id="gallery" title={t("catalog.gallery")}>
        {gallery.length > 0 ? (
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {gallery.map((image) => (
              <li key={image.id} className="flex flex-col gap-2 rounded-2xl bg-paper p-2">
                {uploads ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={storage.publicUrl(image.storageKey)} alt={pick(locale, image.altHe, image.altEn)} className="aspect-square w-full rounded-xl object-cover" />
                ) : (
                  <span className="text-sm">{pick(locale, image.altHe, image.altEn)}</span>
                )}
                <ActionForm action="/api/admin/catalog" csrf={csrf} name="removeImage" hidden={{ id: image.id }}>
                  <button type="submit" className="btn btn-secondary w-full">
                    {t("admin.delete")}
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        ) : null}
        {uploads ? (
          <GalleryUploadForm action="/api/admin/gallery" csrf={csrf} className="grid gap-3 sm:grid-cols-2">
            <Field label={t("catalog.upload")} wide>
              <input type="file" name="file" accept={PHOTO_TYPES} multiple required className="input" />
            </Field>
            {/* Optional text: shown by CSS alone, and the server ignores it unless this box is ticked. */}
            <div className="group flex flex-col gap-3 sm:col-span-2">
              <Check name="withText" label={t("catalog.addText")} checked={false} />
              <div className="hidden gap-3 group-has-checked:grid sm:grid-cols-2">
                <p className="text-sm text-ink-muted sm:col-span-2">{t("catalog.uploadHelp")}</p>
                <Field label={t("catalog.alt")}>
                  <input name="altHe" maxLength={200} className="input" />
                </Field>
                <Field label={t("catalog.caption")}>
                  <input name="captionHe" maxLength={200} className="input" />
                </Field>
                <Field label={en("catalog.alt")}>
                  <input name="altEn" maxLength={200} dir="ltr" lang="en" className="input" />
                </Field>
                <Field label={en("catalog.caption")}>
                  <input name="captionEn" maxLength={200} dir="ltr" lang="en" className="input" />
                </Field>
              </div>
            </div>
            <button type="submit" className="btn btn-primary sm:col-span-2 sm:justify-self-end">
              {t("catalog.upload")}
            </button>
          </GalleryUploadForm>
        ) : (
          <p className="text-ink-muted">{t("admin.error.storageOff")}</p>
        )}
      </Panel>

      <Panel id="profile" title={t("catalog.profile")}>
        <ActionForm action="/api/admin/catalog" csrf={csrf} name="profile" multipart className="grid gap-3 sm:grid-cols-2">
          <PhotoField
            label={t("catalog.cover")}
            photoUrl={profile?.coverKey ? storage.publicUrl(profile.coverKey) : null}
            uploads={uploads}
            t={t}
          />
          <Field label={t("catalog.name")}>
            <input name="name" required maxLength={80} defaultValue={profile?.name ?? ""} className="input" />
          </Field>
          <Field label={t("cal.phone")}>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              defaultValue={profile?.phoneE164 ? (displayPhone(profile.phoneE164) ?? profile.phoneE164) : ""}
              className="input text-end"
            />
          </Field>
          <Field label={t("catalog.tagline")} wide>
            <input name="tagline" maxLength={160} defaultValue={profile?.tagline ?? ""} className="input" />
          </Field>
          <Field label={en("catalog.tagline")} wide>
            <input name="taglineEn" maxLength={160} defaultValue={profile?.taglineEn ?? ""} dir="ltr" lang="en" className="input" />
          </Field>
          <Field label={t("catalog.city")}>
            <input name="city" maxLength={80} defaultValue={profile?.city ?? ""} className="input" />
          </Field>
          <Field label={t("catalog.address")}>
            <input name="address" maxLength={160} defaultValue={profile?.address ?? ""} className="input" />
          </Field>
          {(["instagram", "facebook", "tiktok"] as const).map((network) => (
            <Field key={network} label={network[0]!.toUpperCase() + network.slice(1)}>
              <input
                name={`social.${network}`}
                type="url"
                dir="ltr"
                placeholder="https://"
                defaultValue={profile?.social[network] ?? ""}
                className="input"
              />
            </Field>
          ))}
          <button type="submit" className="btn btn-primary self-end sm:col-span-2 sm:justify-self-start">
            {t("admin.save")}
          </button>
        </ActionForm>
      </Panel>

      <Panel id="templates" title={t("catalog.templates")}>
        <p className="mb-3 text-sm text-ink-muted">{t("catalog.templatesHelp")}</p>
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <Item key={`${template.key}:${template.channel}`} title={`${template.key} · ${channelName(template.channel)}`}>
              {template.channel === "whatsapp" ? (
                <>
                  <p className="rounded-xl bg-surface p-3 text-sm" lang="he" dir="rtl">
                    {template.bodyHe}
                  </p>
                  {template.bodyEn ? (
                    <p className="mt-2 rounded-xl bg-surface p-3 text-sm" lang="en" dir="ltr">
                      {template.bodyEn}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-ink-muted">{t("catalog.templateLocked")}</p>
                </>
              ) : (
                <ActionForm
                  action="/api/admin/catalog"
                  csrf={csrf}
                  name="template"
                  hidden={{ key: template.key, channel: template.channel }}
                  className="flex flex-col gap-3"
                >
                  {template.channel === "email" ? (
                    <Field label={translator(locale)("catalog.subject")}>
                      <input name="subjectHe" maxLength={160} defaultValue={template.subjectHe ?? ""} className="input" />
                    </Field>
                  ) : null}
                  <Field label={translator(locale)("catalog.body")}>
                    <textarea name="bodyHe" required maxLength={1000} defaultValue={template.bodyHe} className="input min-h-20" />
                  </Field>
                  {template.channel === "email" ? (
                    <Field label={`${translator(locale)("catalog.subject")}${translator(locale)("catalog.englishSuffix")}`}>
                      <input
                        name="subjectEn"
                        maxLength={160}
                        defaultValue={template.subjectEn ?? ""}
                        dir="ltr"
                        lang="en"
                        className="input"
                      />
                    </Field>
                  ) : null}
                  <Field label={`${translator(locale)("catalog.body")}${translator(locale)("catalog.englishSuffix")}`}>
                    <textarea
                      name="bodyEn"
                      maxLength={1000}
                      defaultValue={template.bodyEn ?? ""}
                      dir="ltr"
                      lang="en"
                      className="input min-h-20"
                    />
                  </Field>
                  <button type="submit" className="btn btn-primary self-start">
                    {t("admin.save")}
                  </button>
                </ActionForm>
              )}
            </Item>
          ))}
        </div>
      </Panel>
    </div>
  );
}
