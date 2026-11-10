import type { NextRequest } from "next/server";
import { extensions } from "@/extension/registry";
import { updateTemplate } from "@/core/platform/notify/templates";
import type { Channel } from "@/core/platform/notify/types";
import { listServices, upsertService } from "@/core/booking/catalog";
import { getBusinessProfile, listProducts, removeGalleryImage, updateBusinessProfile, upsertProduct } from "@/core/website/content";
import { getFeatures } from "@/core/platform/features";
import { normalizePhone } from "@/core/platform/links";
import { savePublicPhoto } from "@/core/platform/photos";
import { getStorage } from "@/core/platform/storage";
import { adminRequest, backTo } from "@/core/platform/staff/http";
import { TRANSLATABLE, translationsFrom } from "@/core/platform/translation";

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

/** Services, products, gallery captions, the salon profile and message wording. */
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
      const name = text(form.name, 80);
      const durationMin = int(form.durationMin, 5, 480);
      const price = agorot(form.price);
      if ((id && !existing) || !name || durationMin === null || price === null)
        return back("services", { error: "invalid" });
      await upsertService(
        {
          id,
          name,
          includes: text(form.includes, 500),
          translations: translationsFrom(form, TRANSLATABLE.service),
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
    case "product": {
      const id = form.id ? Number(form.id) : undefined;
      const existing = id ? (await listProducts()).find((product) => product.id === id) : undefined;
      const name = text(form.name, 80);
      const price = agorot(form.price);
      if ((id && !existing) || !name || price === null) return back("products", { error: "invalid" });
      const oldKey = existing?.imageKey ?? null;
      const photo = await choosePhoto(files.photo?.[0], form.removePhoto === "on", oldKey, "products");
      if (photo.error) return back("products", { error: photo.error });
      await upsertProduct(
        {
          id,
          name,
          description: text(form.description, 300),
          translations: translationsFrom(form, TRANSLATABLE.product),
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
      const oldLogo = current?.logoKey ?? null;
      const logo = await choosePhoto(files.logo?.[0], form.removeLogo === "on", oldLogo, "site");
      if (logo.error) return back("profile", { error: logo.error });
      await updateBusinessProfile(
        {
          name,
          tagline: text(form.tagline, 160),
          translations: translationsFrom(form, TRANSLATABLE.profile),
          city: text(form.city, 80),
          address: text(form.address, 160),
          phoneE164: phone,
          social,
          logoKey: logo.key,
          coverKey: cover.key,
        },
        writer,
      );
      await dropOldPhoto(oldCover, cover.key);
      await dropOldPhoto(oldLogo, logo.key);
      return back("profile", { ok: "saved" });
    }
    case "template": {
      const body = text(form.body, 1000);
      if (!body || !form.key) return back("templates", { error: "invalid" });
      const result = await updateTemplate(
        form.key,
        form.channel as Channel,
        {
          body,
          subject: text(form.subject, 160),
          translations: translationsFrom(form, TRANSLATABLE.message_template),
        },
        staff.id,
      );
      return back(
        "templates",
        result === "ok" ? { ok: "saved" } : { error: result === "placeholders" ? "placeholders" : "invalid" },
      );
    }
    default: {
      // A form that belongs to an extension, such as a pet-to-service rule.
      const action = extensions()
        .map((extension) => extension.catalogActions)
        .find((actions) => actions && Object.hasOwn(actions, form.action ?? ""))?.[form.action ?? ""];
      if (!action) return back("services", { error: "invalid" });
      const { section, ...notice } = await action(form, writer);
      return back(section, notice);
    }
  }
}
