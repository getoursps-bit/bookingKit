import { type ActionResult, defineExtension, type Form } from "@/extension/types";
import { listServices } from "@/server/repos/catalog";
import ar from "./languages/ar.json" with { type: "json" };
import en from "./languages/en.json" with { type: "json" };
import he from "./languages/he.json" with { type: "json" };
import rules from "./seed.json" with { type: "json" };
import { describeLines, petLines, petServiceTags, previewService } from "./server/lines";
import { listPets } from "./server/pets";
import { PET_SETTINGS, petAi } from "./server/photo-ai";
import { deleteExpiredPhotos } from "./server/photos";
import { type AgeGroup, type PetRequest, setServiceRule, type Species, type WeightGroup } from "./server/rules";

// Pets: the customisation of a grooming salon. A booking is for one or more
// pets; the pet's kind and size choose the service; the owner sees the pet
// on the calendar and the customer page. Its pages are in views.tsx.

/** The owner changes which service one kind of pet gets (her content screen, the "rule" form). */
async function saveRule(form: Form, { staffId }: { staffId: number }): Promise<ActionResult> {
  const species = form.species as Species;
  const request = form.request as PetRequest;
  const ageGroup = (form.ageGroup || null) as AgeGroup | null;
  const weightGroup = (form.weightGroup || null) as WeightGroup | null;
  const serviceId = Number(form.serviceId);
  const services = await listServices();
  if (
    !["dog", "cat"].includes(species) ||
    !["groom", "nails"].includes(request) ||
    (ageGroup !== null && !["young", "adult"].includes(ageGroup)) ||
    (weightGroup !== null && !["small", "large", "unknown"].includes(weightGroup)) ||
    !services.some((service) => service.id === serviceId)
  )
    return { section: "rules", error: "invalid" };
  await setServiceRule({ species, request, ageGroup, weightGroup, serviceId }, { staffId });
  return { section: "rules", ok: "saved" };
}

export default defineExtension({
  id: "pets",
  messages: { he, en, ar },
  bookingLines: petLines,
  serviceTags: petServiceTags,
  previewService,
  describeLines,
  customerData: {
    tables: ["pets"],
    export: async (customerId, db) => ({ pets: await listPets(customerId, db) }),
  },
  catalogActions: { rule: saveRule },
  settings: PET_SETTINGS,
  /** With the ai extension on: a look at a pet's photo, and the pet's facts for the pre-visit note. */
  provides: { ai: petAi },
  /** Pet photos are deleted 90 days after their visit. */
  cleanup: async (db, now) => ({ photos: await deleteExpiredPhotos(now, db) }),
  /** Which service each kind and size of pet gets by default. */
  async seed(db, { serviceIds }) {
    for (const rule of rules.service_rules) {
      const serviceId = serviceIds.get(rule.service);
      if (!serviceId) throw new Error(`Pets rule points to unknown service "${rule.service}"`);
      await db.query(
        `insert into service_rules (species, age_group, weight_group, request, service_id)
         values ($1, $2, $3, $4, $5)
         on conflict (species, age_group, weight_group, request) do nothing`,
        [rule.species, rule.age_group, rule.weight_group, rule.request, serviceId],
      );
    }
  },
});
