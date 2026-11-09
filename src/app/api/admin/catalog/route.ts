import type { NextRequest } from "next/server";
import { updateTemplate } from "@/server/notify/templates";
import type { Channel } from "@/server/notify/types";
import {
  getBusinessProfile,
  listProducts,
  listServices,
  removeGalleryImage,
  setServiceRule,
  updateBusinessProfile,
  upsertProduct,
  upsertService,
  type AgeGroup,
  type PetRequest,
  type Species,
  type WeightGroup,
} from "@/server/repos/catalog";
import { getFeatures } from "@/server/features";
import { normalizePhone } from "@/server/links";
import { savePublicPhoto } from "@/server/photos";
import { getStorage } from "@/server/storage";
import { adminRequest, backTo } from "@/server/staff/http";

export const dynamic = "force-dynamic";

const text = (value: string | undefined, max: number) => value?.trim().slice(0, max) || null;
const int = (value: string | undefined, min: number, max: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
};
/** Shekels as typed ("120" or "120.50") to agorot. */
const agorot = (value: string | undefined) => {
  const number = Number((value ?? "").replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number < 100_000 ? Math.round(number * 100) : null;
};

/**
 * The photo a form leaves in place: a new upload, none when "remove" is ticked,
 * or the current one. Null key means no photo; `error` means nothing was saved.
 */
async function choosePhoto(
  file: File | undefined,
  remove: boolean,
  current: string | null,
  folder: "products" | "site",
): Promise<{ key: string | null; error?: undefined } | { error: "storageOff" | "photo" }> {
  if (!file) return { key: remove ? null : current };
  if (!getFeatures().photoUploads) return { error: "storageOff" };
  const key = await savePublicPhoto(file, folder);
  return key ? { key } : { error: "photo" };
}

/** Deletes the file a saved form replaced or removed. */
async function dropOldPhoto(old: string | null, kept: string | null) {
  if (old && old !== kept)
    await getStorage()
      .delete(old)
      .catch(() => undefined);
}

/** Services, rules, products, gallery captions, the salon profile and message wording. */
export async function POST(request: NextRequest) {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  const { form, files, staff } = req;
  const writer = { staffId: staff.id };
  const back = (section: string, notice: { ok?: string; error?: string }) =>
    backTo(request, `/admin/catalog#${section}`, notice);

  switch (form.action) {
    case "service": {
      const id = form.id ? Number(form.id) : undefined;
      const existing = id ? (await listServices()).find((service) => service.id === id) : undefined;
      const nameHe = text(form.nameHe, 80);
      const durationMin = int(form.durationMin, 5, 480);
      const price = agorot(form.price);
      if ((id && !existing) || !nameHe || durationMin === null || price === null)
        return back("services", { error: "invalid" });
      await upsertService(
        {
          id,
          nameHe,
          includesHe: text(form.includesHe, 500),
          nameEn: text(form.nameEn, 80),
          includesEn: text(form.includesEn, 500),
          durationMin,
          priceFromAgorot: price,
          bookableOnline: form.bookableOnline === "on",
          active: form.active === "on",
          sortOrder: int(form.sortOrder, 0, 999) ?? existing?.sortOrder ?? 0,
        },
        writer,
      );
      return back("services", { ok: "saved" });
    }
    case "rule": {
      const species = form.species as Species;
      const request_ = form.request as PetRequest;
      const ageGroup = (form.ageGroup || null) as AgeGroup | null;
      const weightGroup = (form.weightGroup || null) as WeightGroup | null;
      const serviceId = Number(form.serviceId);
      const services = await listServices();
      if (
        !["dog", "cat"].includes(species) ||
        !["groom", "nails"].includes(request_) ||
        (ageGroup !== null && !["young", "adult"].includes(ageGroup)) ||
        (weightGroup !== null && !["small", "large", "unknown"].includes(weightGroup)) ||
        !services.some((service) => service.id === serviceId)
      ) {
        return back("rules", { error: "invalid" });
      }
      await setServiceRule({ species, request: request_, ageGroup, weightGroup, serviceId }, writer);
      return back("rules", { ok: "saved" });
    }
    case "product": {
      const id = form.id ? Number(form.id) : undefined;
      const existing = id ? (await listProducts()).find((product) => product.id === id) : undefined;
      const nameHe = text(form.nameHe, 80);
      const price = agorot(form.price);
      if ((id && !existing) || !nameHe || price === null) return back("products", { error: "invalid" });
      const oldKey = existing?.imageKey ?? null;
      const photo = await choosePhoto(files.photo?.[0], form.removePhoto === "on", oldKey, "products");
      if (photo.error) return back("products", { error: photo.error });
      await upsertProduct(
        {
          id,
          nameHe,
          descriptionHe: text(form.descriptionHe, 300),
          nameEn: text(form.nameEn, 80),
          descriptionEn: text(form.descriptionEn, 300),
          priceAgorot: price,
          imageKey: photo.key,
          active: form.active === "on",
          sortOrder: int(form.sortOrder, 0, 999) ?? existing?.sortOrder ?? 0,
        },
        writer,
      );
      await dropOldPhoto(oldKey, photo.key);
      return back("products", { ok: "saved" });
    }
    case "removeImage": {
      const key = await removeGalleryImage(Number(form.id), writer);
      if (key)
        await getStorage()
          .delete(key)
          .catch(() => undefined);
      return back("gallery", { ok: "saved" });
    }
    case "profile": {
      const current = await getBusinessProfile();
      const name = text(form.name, 80);
      const phone = form.phone?.trim() ? normalizePhone(form.phone) : null;
      if (!name || (form.phone?.trim() && !phone)) return back("profile", { error: "invalid" });
      const social: Record<string, string> = {};
      for (const network of ["instagram", "facebook", "tiktok"]) {
        const url = text(form[`social.${network}`], 300);
        if (url && !/^https:\/\//.test(url)) return back("profile", { error: "invalid" });
        if (url) social[network] = url;
      }
      const oldCover = current?.coverKey ?? null;
      const cover = await choosePhoto(files.photo?.[0], form.removePhoto === "on", oldCover, "site");
      if (cover.error) return back("profile", { error: cover.error });
      await updateBusinessProfile(
        {
          name,
          tagline: text(form.tagline, 160),
          taglineEn: text(form.taglineEn, 160),
          city: text(form.city, 80),
          address: text(form.address, 160),
          phoneE164: phone,
          social,
          logoKey: current?.logoKey ?? null,
          coverKey: cover.key,
        },
        writer,
      );
      await dropOldPhoto(oldCover, cover.key);
      return back("profile", { ok: "saved" });
    }
    case "template": {
      const bodyHe = text(form.bodyHe, 1000);
      if (!bodyHe || !form.key) return back("templates", { error: "invalid" });
      const result = await updateTemplate(
        form.key,
        form.channel as Channel,
        {
          bodyHe,
          subjectHe: text(form.subjectHe, 160),
          bodyEn: text(form.bodyEn, 1000),
          subjectEn: text(form.subjectEn, 160),
        },
        staff.id,
      );
      return back(
        "templates",
        result === "ok" ? { ok: "saved" } : { error: result === "placeholders" ? "placeholders" : "invalid" },
      );
    }
    default:
      return back("services", { error: "invalid" });
  }
}
