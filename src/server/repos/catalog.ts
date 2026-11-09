import type { Translations } from "@/i18n/content";
import { type Db, query, withTransaction } from "../db";
import { dropTranslations, saveTranslations, translationsColumn } from "../translation/content";
import { writeAudit } from "./audit";

// Postgres returns bigint ids as strings; repositories hand out numbers.

export type Species = "dog" | "cat";
export type AgeGroup = "young" | "adult";
export type WeightGroup = "small" | "large" | "unknown";
export type PetRequest = "groom" | "nails";

export type Service = {
  id: number;
  /** In the site's default language; `translations` holds the others. */
  name: string;
  includes: string | null;
  translations: Translations;
  durationMin: number;
  priceFromAgorot: number;
  bookableOnline: boolean;
  active: boolean;
  sortOrder: number;
};

export type ServiceRule = {
  id: number;
  species: Species;
  ageGroup: AgeGroup | null;
  weightGroup: WeightGroup | null;
  request: PetRequest;
  serviceId: number;
};

export type Product = {
  id: number;
  name: string;
  description: string | null;
  translations: Translations;
  priceAgorot: number;
  imageKey: string | null;
  active: boolean;
  sortOrder: number;
};

export type GalleryImage = {
  id: number;
  storageKey: string;
  alt: string;
  caption: string | null;
  translations: Translations;
  sortOrder: number;
};

export type BusinessProfile = {
  name: string;
  tagline: string | null;
  translations: Translations;
  city: string | null;
  address: string | null;
  phoneE164: string | null;
  social: Record<string, string>;
  logoKey: string | null;
  coverKey: string | null;
};

/** Local wall-clock hours for one weekday (0 = Sunday). */
export type OpeningHours = { weekday: number; opens: string | null; closes: string | null; closed: boolean };

export type TimeOff = { id: number; start: Date; end: Date; reason: string | null };

type Writer = { staffId: number | null; db?: Db };

// The *_he columns hold the text in the site's default language, whatever that language is.
const SERVICE_COLUMNS = `services.id::int, name_he as name, includes_he as includes,
  ${translationsColumn("service", "services.id")}, duration_min as "durationMin",
  price_from_agorot as "priceFromAgorot", bookable_online as "bookableOnline", active, sort_order as "sortOrder"`;

export async function listServices(opts: { activeOnly?: boolean } = {}, db?: Db): Promise<Service[]> {
  return query<Service>(
    `select ${SERVICE_COLUMNS} from services ${opts.activeOnly ? "where active" : ""} order by sort_order, id`,
    [],
    db,
  );
}

export async function upsertService(service: Omit<Service, "id"> & { id?: number }, { staffId, db }: Writer) {
  return withTransaction(async (client) => {
    const before = service.id
      ? ((await query<Service>(`select ${SERVICE_COLUMNS} from services where id = $1`, [service.id], client))[0] ??
        null)
      : null;
    const params = [
      service.name,
      service.includes,
      service.durationMin,
      service.priceFromAgorot,
      service.bookableOnline,
      service.active,
      service.sortOrder,
    ];
    const [saved] = service.id
      ? await query<Service>(
          `update services set name_he = $1, includes_he = $2, duration_min = $3, price_from_agorot = $4,
             bookable_online = $5, active = $6, sort_order = $7
           where id = $8 returning ${SERVICE_COLUMNS}`,
          [...params, service.id],
          client,
        )
      : await query<Service>(
          `insert into services (name_he, includes_he, duration_min, price_from_agorot, bookable_online, active, sort_order)
           values ($1, $2, $3, $4, $5, $6, $7) returning ${SERVICE_COLUMNS}`,
          params,
          client,
        );
    if (!saved) throw new Error(`Service ${service.id} not found`);
    saved.translations = { ...saved.translations, ...(await saveTranslations("service", saved.id, service.translations, client)) };
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "services",
      entityId: saved.id,
      action: service.id ? "update" : "create",
      before,
      after: saved,
    });
    return saved;
  }, db);
}

export async function listServiceRules(db?: Db): Promise<ServiceRule[]> {
  return query<ServiceRule>(
    `select id::int, species, age_group as "ageGroup", weight_group as "weightGroup", request,
       service_id::int as "serviceId"
     from service_rules order by id`,
    [],
    db,
  );
}

export async function setServiceRule(rule: Omit<ServiceRule, "id">, { staffId, db }: Writer): Promise<void> {
  await withTransaction(async (client) => {
    await query(
      `insert into service_rules (species, age_group, weight_group, request, service_id)
       values ($1, $2, $3, $4, $5)
       on conflict (species, age_group, weight_group, request) do update set service_id = excluded.service_id`,
      [rule.species, rule.ageGroup, rule.weightGroup, rule.request, rule.serviceId],
      client,
    );
    await writeAudit(client, { staffId, actor: "staff", entity: "service_rules", action: "set", after: rule });
  }, db);
}

const PRODUCT_COLUMNS = `products.id::int, name_he as name, description_he as description,
  ${translationsColumn("product", "products.id")}, price_agorot as "priceAgorot",
  image_key as "imageKey", active, sort_order as "sortOrder"`;

export async function listProducts(opts: { activeOnly?: boolean } = {}, db?: Db): Promise<Product[]> {
  return query<Product>(
    `select ${PRODUCT_COLUMNS} from products ${opts.activeOnly ? "where active" : ""} order by sort_order, id`,
    [],
    db,
  );
}

export async function upsertProduct(product: Omit<Product, "id"> & { id?: number }, { staffId, db }: Writer) {
  return withTransaction(async (client) => {
    const params = [
      product.name,
      product.description,
      product.priceAgorot,
      product.imageKey,
      product.active,
      product.sortOrder,
    ];
    const [saved] = product.id
      ? await query<Product>(
          `update products set name_he = $1, description_he = $2, price_agorot = $3, image_key = $4, active = $5,
             sort_order = $6
           where id = $7 returning ${PRODUCT_COLUMNS}`,
          [...params, product.id],
          client,
        )
      : await query<Product>(
          `insert into products (name_he, description_he, price_agorot, image_key, active, sort_order)
           values ($1, $2, $3, $4, $5, $6) returning ${PRODUCT_COLUMNS}`,
          params,
          client,
        );
    if (!saved) throw new Error(`Product ${product.id} not found`);
    saved.translations = { ...saved.translations, ...(await saveTranslations("product", saved.id, product.translations, client)) };
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "products",
      entityId: saved.id,
      action: product.id ? "update" : "create",
      after: saved,
    });
    return saved;
  }, db);
}

const GALLERY_COLUMNS = `gallery_images.id::int, storage_key as "storageKey", alt_he as alt, caption_he as caption,
  ${translationsColumn("gallery_image", "gallery_images.id")}, sort_order as "sortOrder"`;

/** Every photo the owner uploaded shows on the site. */
export async function listGallery(db?: Db): Promise<GalleryImage[]> {
  return query<GalleryImage>(`select ${GALLERY_COLUMNS} from gallery_images order by sort_order, id`, [], db);
}

export async function addGalleryImage(image: Omit<GalleryImage, "id">, { staffId, db }: Writer) {
  return withTransaction(async (client) => {
    const [saved] = await query<GalleryImage>(
      // The consent column is no longer read; true keeps a rolled-back version showing these photos.
      `insert into gallery_images (storage_key, alt_he, caption_he, sort_order, consent)
       values ($1, $2, $3, $4, true) returning ${GALLERY_COLUMNS}`,
      [image.storageKey, image.alt, image.caption, image.sortOrder],
      client,
    );
    saved!.translations = await saveTranslations("gallery_image", saved!.id, image.translations, client);
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "gallery_images",
      entityId: saved!.id,
      action: "create",
      after: saved,
    });
    return saved!;
  }, db);
}

/** Returns the storage key so the caller can delete the file. */
export async function removeGalleryImage(id: number, { staffId, db }: Writer): Promise<string | null> {
  return withTransaction(async (client) => {
    const [removed] = await query<GalleryImage>(
      `delete from gallery_images where id = $1 returning ${GALLERY_COLUMNS}`,
      [id],
      client,
    );
    if (!removed) return null;
    await dropTranslations("gallery_image", id, client);
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "gallery_images",
      entityId: id,
      action: "delete",
      before: removed,
    });
    return removed.storageKey;
  }, db);
}

const PROFILE_COLUMNS = `name, tagline, ${translationsColumn("profile", "business_profile.id")}, city, address, phone_e164 as "phoneE164", social, logo_key as "logoKey",
  cover_key as "coverKey"`;

export async function getBusinessProfile(db?: Db): Promise<BusinessProfile | null> {
  const [profile] = await query<BusinessProfile>(
    `select ${PROFILE_COLUMNS} from business_profile where id = 1`,
    [],
    db,
  );
  return profile ?? null;
}

export async function updateBusinessProfile(profile: BusinessProfile, { staffId, db }: Writer): Promise<void> {
  await withTransaction(async (client) => {
    const before = await getBusinessProfile(client);
    await query(
      `insert into business_profile (id, name, tagline, city, address, phone_e164, social, logo_key, cover_key, updated_at)
       values (1, $1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, city = excluded.city,
         address = excluded.address, phone_e164 = excluded.phone_e164, social = excluded.social,
         logo_key = excluded.logo_key, cover_key = excluded.cover_key, updated_at = now()`,
      [
        profile.name,
        profile.tagline,
        profile.city,
        profile.address,
        profile.phoneE164,
        JSON.stringify(profile.social),
        profile.logoKey,
        profile.coverKey,
      ],
      client,
    );
    await saveTranslations("profile", 1, profile.translations, client);
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "business_profile",
      entityId: 1,
      action: "update",
      before,
      after: profile,
    });
  }, db);
}

export async function getOpeningHours(db?: Db): Promise<OpeningHours[]> {
  return query<OpeningHours>(
    `select weekday, to_char(opens, 'HH24:MI') as opens, to_char(closes, 'HH24:MI') as closes, closed
     from opening_hours order by weekday`,
    [],
    db,
  );
}

export async function setOpeningHours(day: OpeningHours, { staffId, db }: Writer): Promise<void> {
  await withTransaction(async (client) => {
    const before = (await getOpeningHours(client)).find((row) => row.weekday === day.weekday) ?? null;
    await query(
      `insert into opening_hours (weekday, opens, closes, closed) values ($1, $2, $3, $4)
       on conflict (weekday) do update set opens = excluded.opens, closes = excluded.closes, closed = excluded.closed`,
      [day.weekday, day.closed ? null : day.opens, day.closed ? null : day.closes, day.closed],
      client,
    );
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "opening_hours",
      entityId: day.weekday,
      action: "set",
      before,
      after: day,
    });
  }, db);
}

/** Time off that overlaps [start, end). */
export async function listTimeOff(start: Date, end: Date, db?: Db): Promise<TimeOff[]> {
  return query<TimeOff>(
    `select id::int, starts_at as start, ends_at as "end", reason from time_off
     where starts_at < $2 and ends_at > $1 order by starts_at`,
    [start, end],
    db,
  );
}

export async function addTimeOff(entry: Omit<TimeOff, "id">, { staffId, db }: Writer): Promise<TimeOff> {
  return withTransaction(async (client) => {
    const [saved] = await query<TimeOff>(
      `insert into time_off (starts_at, ends_at, reason) values ($1, $2, $3)
       returning id::int, starts_at as start, ends_at as "end", reason`,
      [entry.start, entry.end, entry.reason],
      client,
    );
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "time_off",
      entityId: saved!.id,
      action: "create",
      after: saved,
    });
    return saved!;
  }, db);
}

export async function removeTimeOff(id: number, { staffId, db }: Writer): Promise<void> {
  await withTransaction(async (client) => {
    const removed = await query("delete from time_off where id = $1 returning id", [id], client);
    if (removed.length) {
      await writeAudit(client, { staffId, actor: "staff", entity: "time_off", entityId: id, action: "delete" });
    }
  }, db);
}
