import { defineExtension } from "@/extension/types";
import ar from "./languages/ar.json" with { type: "json" };
import en from "./languages/en.json" with { type: "json" };
import he from "./languages/he.json" with { type: "json" };
import rules from "./seed.json" with { type: "json" };

// Pets: the customisation of a grooming salon. A booking is for one or more
// pets; the pet's kind and size choose the service; the owner sees the pet
// on the calendar and the customer page. Taken out of the core one point at a
// time; what is still in the core is listed in docs/designs/step2_modules_languages.md.
export default defineExtension({
  id: "pets",
  messages: { he, en, ar },
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
