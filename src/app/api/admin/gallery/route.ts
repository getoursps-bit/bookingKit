import type { NextRequest } from "next/server";
import { translator } from "@/i18n/translator";
import { getFeatures } from "@/server/features";
import { savePublicPhoto } from "@/server/photos";
import { addGalleryImage, listGallery } from "@/server/repos/catalog";
import { adminRequest, backTo } from "@/server/staff/http";
import { DEFAULT_LOCALE, OTHER_LOCALES } from "@/i18n/locales";
import { TRANSLATABLE, translationsFrom } from "@/server/translation/content";

export const dynamic = "force-dynamic";

/**
 * Uploads gallery photos; text is optional and, when ticked, shared by the
 * upload. A photo with no description gets a general one, so it still has alt
 * text for screen readers. The page sends photos one per request, so a large batch stays within body limits and one bad file does
 * not lose the rest; without JavaScript they all arrive here together.
 */
export async function POST(request: NextRequest) {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  const { form, files, staff } = req;
  const back = "/admin/catalog#gallery";
  if (!getFeatures().photoUploads) return backTo(request, back, { error: "storageOff" });

  const photos = files.file ?? [];
  if (photos.length === 0) return backTo(request, back, { error: "invalid" });

  const optional = (name: string) => (form.withText === "on" && form[name]?.trim().slice(0, 200)) || null;
  const alt = optional("alt");
  const caption = optional("caption");
  const texts = form.withText === "on" ? translationsFrom(form, TRANSLATABLE.gallery_image) : {};
  // A photo with no description gets the standard one, in every language.
  const translations = Object.fromEntries(
    OTHER_LOCALES.map((locale) => {
      const given = texts[locale] ?? {};
      return [locale, { ...given, alt: given.alt || (alt ? "" : translator(locale)("gallery.defaultAlt")) }];
    }),
  );
  let sortOrder = (await listGallery()).length;
  let failed = 0;
  for (const photo of photos) {
    const storageKey = await savePublicPhoto(photo, "gallery");
    if (!storageKey) {
      failed += 1;
      continue;
    }
    await addGalleryImage(
      {
        storageKey,
        alt: alt ?? translator(DEFAULT_LOCALE)("gallery.defaultAlt"),
        caption,
        translations,
        sortOrder: sortOrder++,
      },
      { staffId: staff.id },
    );
  }
  return backTo(request, back, failed > 0 ? { error: "photo" } : { ok: "saved" });
}
