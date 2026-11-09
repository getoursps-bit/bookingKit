import { randomUUID } from "node:crypto";
import { log } from "./log";
import { getStorage } from "./storage";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
/** Gallery and product photos: the formats a browser can show after re-encoding. */
const PUBLIC_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PUBLIC_PHOTO_WIDTH = 1600;

/**
 * Re-encodes an uploaded image to WebP at most `width` px wide. sharp drops all
 * metadata (camera, location) unless asked to keep it; rotate() applies the
 * camera orientation first so the picture stays upright. Null when the image
 * cannot be read.
 */
export async function toWebp(bytes: Uint8Array, width: number): Promise<Uint8Array | null> {
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(bytes, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    log.info({ err: (error as Error).message }, "photo could not be read");
    return null;
  }
}

/**
 * Stores one public photo (gallery, product, cover) as WebP with no metadata, so no camera
 * location reaches the public site. Returns its storage key, or null when the
 * file is the wrong type, too large or not a readable image.
 */
export async function savePublicPhoto(file: File, folder: "gallery" | "products" | "site"): Promise<string | null> {
  if (!PUBLIC_PHOTO_TYPES.includes(file.type) || file.size === 0 || file.size > PHOTO_MAX_BYTES) return null;
  const webp = await toWebp(new Uint8Array(await file.arrayBuffer()), PUBLIC_PHOTO_WIDTH);
  if (!webp) return null;
  const key = `${folder}/${randomUUID()}.webp`;
  await getStorage().put(key, webp, "image/webp");
  return key;
}
