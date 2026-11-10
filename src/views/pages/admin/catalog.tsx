import { Fragment, type ReactNode } from "react";
import { GalleryUploadForm } from "@/views/parts/admin/GalleryUploadForm";
import { ActionForm, AdminNotice, Panel } from "@/views/parts/admin/parts";
import { extensionViews } from "@/extension/views";
import { pick, type Translations } from "@/i18n/content";
import { DEFAULT_LOCALE, type Locale, OTHER_LOCALES, PACKS } from "@/i18n/locales";
import { getI18n } from "@/i18n/server";
import { type MessageKey, type Translate } from "@/i18n/t";
import { translator } from "@/i18n/translator";
import { getFeatures } from "@/core/platform/features";
import { listTemplates } from "@/core/platform/notify/templates";
import { listServices, type Service } from "@/core/booking/catalog";
import { getBusinessProfile, listGallery, listProducts, type Product } from "@/core/website/content";
import { displayPhone } from "@/core/platform/links";
import { requireStaffPage } from "@/core/platform/staff/session";
import { getStorage } from "@/core/platform/storage";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.nav.catalog") };
}

/** The page's words: the translator and the language. */
type Words = { t: Translate; locale: Locale };

const shekels = (agorot: number) => (agorot / 100).toFixed(agorot % 100 === 0 ? 0 : 2);

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? "sm:col-span-2" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/** The same field once for each other language of the site, written in that language. Nothing on a one-language site. */
function Translated({
  t,
  label,
  field,
  translations,
  max,
  area,
  wide,
  className,
}: {
  t: Translate;
  label: MessageKey;
  field: string;
  translations?: Translations;
  max: number;
  area?: boolean;
  wide?: boolean;
  className?: string;
}) {
  return OTHER_LOCALES.map((code) => {
    const input = {
      name: `${field}:${code}`,
      maxLength: max,
      defaultValue: translations?.[code]?.[field] ?? "",
      dir: PACKS[code].dir,
      lang: code,
    };
    return (
      <Field key={code} label={`${t(label)} (${PACKS[code].name})`} wide={wide}>
        {area ? <textarea {...input} className={className ?? "input min-h-16"} /> : <input {...input} className="input" />}
      </Field>
    );
  });
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-5 accent-brand" />
      {label}
    </label>
  );
}

function ServiceForm({ csrf, service, words: { t } }: { csrf: string; service?: Service; words: Words }) {
  return (
    <ActionForm
      action="/api/admin/catalog"
      csrf={csrf}
      name="service"
      hidden={service ? { id: service.id } : {}}
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field label={t("catalog.name")}>
        <input name="name" required maxLength={80} defaultValue={service?.name} className="input" />
      </Field>
      <Translated t={t} label="catalog.name" field="name" translations={service?.translations} max={80} />
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
        <textarea name="includes" maxLength={500} defaultValue={service?.includes ?? ""} className="input min-h-16" />
      </Field>
      <Translated t={t} label="catalog.includes" field="includes" translations={service?.translations} max={500} area wide />
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
  name = "photo",
  removeName = "removePhoto",
}: {
  label: string;
  photoUrl?: string | null;
  uploads: boolean;
  t: Translate;
  /** The form fields of the file and of the "remove" tick, when a form has a second photo. */
  name?: string;
  removeName?: string;
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
          <input type="file" name={name} accept={PHOTO_TYPES} className="input" />
        </Field>
        {photoUrl ? <Check name={removeName} label={t("catalog.removePhoto")} checked={false} /> : null}
      </div>
    </div>
  );
}

function ProductForm({
  csrf,
  product,
  photoUrl,
  uploads,
  words: { t },
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
        <input name="name" required maxLength={80} defaultValue={product?.name} className="input" />
      </Field>
      <Translated t={t} label="catalog.name" field="name" translations={product?.translations} max={80} />
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("catalog.price")}>
          <input name="price" inputMode="decimal" required defaultValue={product ? shekels(product.priceAgorot) : ""} dir="ltr" className="input" />
        </Field>
        <Field label={t("catalog.order")}>
          <input name="sortOrder" type="number" inputMode="numeric" min={0} max={999} defaultValue={product?.sortOrder ?? 0} dir="ltr" className="input" />
        </Field>
      </div>
      <Field label={t("catalog.description")} wide>
        <input name="description" maxLength={300} defaultValue={product?.description ?? ""} className="input" />
      </Field>
      <Translated t={t} label="catalog.description" field="description" translations={product?.translations} max={300} wide />
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

/** Everything the public site shows: services and prices, products, gallery, profile, message wording. */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const search = await searchParams;
  const { csrf } = await requireStaffPage();
  const { t, locale } = await getI18n();
  const words: Words = { t, locale };
  const inactive = ` (${translator(locale)("catalog.inactive")})`;
  const channelName = (channel: "messaging" | "email" | "push") =>
    channel === "messaging" ? t("contact.whatsapp") : translator(locale)(`channel.${channel}`);
  const [services, products, gallery, profile, templates] = await Promise.all([
    listServices(),
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
            <Item key={service.id} title={`${pick(locale, service, "name")}${service.active ? "" : inactive}`}>
              <ServiceForm csrf={csrf} service={service} words={words} />
            </Item>
          ))}
          <Item title={`+ ${t("admin.add")}`}>
            <ServiceForm csrf={csrf} words={words} />
          </Item>
        </div>
      </Panel>

      {/* What the extensions add to the content, such as which service each kind of pet gets. */}
      {extensionViews().map((views) => (views.catalog ? <Fragment key={views.id}>{views.catalog({ csrf })}</Fragment> : null))}

      <Panel id="products" title={t("catalog.products")}>
        <div className="flex flex-col gap-2">
          {products.map((product) => (
            <Item key={product.id} title={`${pick(locale, product, "name")}${product.active ? "" : inactive}`}>
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
                  <img src={storage.publicUrl(image.storageKey)} alt={pick(locale, image, "alt")} className="aspect-square w-full rounded-xl object-cover" />
                ) : (
                  <span className="text-sm">{pick(locale, image, "alt")}</span>
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
                  <input name="alt" maxLength={200} className="input" />
                </Field>
                <Field label={t("catalog.caption")}>
                  <input name="caption" maxLength={200} className="input" />
                </Field>
                <Translated t={t} label="catalog.alt" field="alt" max={200} />
                <Translated t={t} label="catalog.caption" field="caption" max={200} />
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
          {uploads ? (
            <PhotoField
              label={t("catalog.logo")}
              photoUrl={profile?.logoKey ? storage.publicUrl(profile.logoKey) : null}
              uploads={uploads}
              t={t}
              name="logo"
              removeName="removeLogo"
            />
          ) : null}
          <Field label={t("catalog.name")}>
            <input name="name" required maxLength={80} defaultValue={profile?.name ?? ""} className="input" />
          </Field>
          <Translated t={t} label="catalog.name" field="name" translations={profile?.translations} max={80} />
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
          <Translated t={t} label="catalog.tagline" field="tagline" translations={profile?.translations} max={160} wide />
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
              {template.channel === "messaging" ? (
                <>
                  <p className="rounded-xl bg-surface p-3 text-sm" lang={DEFAULT_LOCALE} dir={PACKS[DEFAULT_LOCALE].dir}>
                    {template.body}
                  </p>
                  {OTHER_LOCALES.map((code) =>
                    template.translations[code]?.body ? (
                      <p key={code} className="mt-2 rounded-xl bg-surface p-3 text-sm" lang={code} dir={PACKS[code].dir}>
                        {template.translations[code].body}
                      </p>
                    ) : null,
                  )}
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
                      <input name="subject" maxLength={160} defaultValue={template.subject ?? ""} className="input" />
                    </Field>
                  ) : null}
                  <Field label={translator(locale)("catalog.body")}>
                    <textarea name="body" required maxLength={1000} defaultValue={template.body} className="input min-h-20" />
                  </Field>
                  {template.channel === "email" ? (
                    <Translated t={t} label="catalog.subject" field="subject" translations={template.translations} max={160} />
                  ) : null}
                  <Translated
                    t={t}
                    label="catalog.body"
                    field="body"
                    translations={template.translations}
                    max={1000}
                    area
                    className="input min-h-20"
                  />
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
