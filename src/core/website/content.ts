import type { Translations } from "@/i18n/content";
import { writeAudit } from "../platform/audit";
import { type Db, query, withTransaction } from "../platform/db";
import { dropTranslations, saveTranslations, translationsColumn } from "../platform/translation";

// What the website shows about the business: its profile, the products it
// sells and its gallery. Postgres returns bigint ids as strings; these hand
// out numbers.

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
type Writer = { staffId: number | null; db?: Db };


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
