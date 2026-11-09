import { describe, expect, it } from "vitest";
import seedData from "../../db/seed/data.he.json";
import { PetDescription, profileFor, resolveService, speciesFor } from "@/server/booking/serviceRules";
import type { Service, ServiceRule } from "@/server/repos/catalog";

// The seed's services and default rules, with ids as the database would give them.
const services: Service[] = seedData.services.map((service, index) => ({
  id: index + 1,
  name: service.name_he,
  includes: service.includes_he,
  translations: {},
  durationMin: service.duration_min,
  priceFromAgorot: service.price_from_agorot,
  bookableOnline: service.bookable_online,
  active: true,
  sortOrder: index,
}));
const idOf = (key: string) => seedData.services.findIndex((service) => service.key === key) + 1;
const rules = seedData.service_rules.map((rule, index) => ({
  id: index + 1,
  species: rule.species,
  ageGroup: rule.age_group,
  weightGroup: rule.weight_group,
  request: rule.request,
  serviceId: idOf(rule.service),
})) as ServiceRule[];

const resolve = (pet: Record<string, unknown>) => resolveService(PetDescription.parse(pet), rules, services);
const serviceKey = (pet: Record<string, unknown>) => {
  const result = resolve(pet);
  return result.ok ? seedData.services[result.service.id - 1]!.key : result.reason;
};

describe("resolveService", () => {
  it("gives a puppy over 10 kg puppy care: age is checked before weight", () => {
    expect(serviceKey({ species: "dog", ageGroup: "young", weightGroup: "large" })).toBe("puppy");
  });

  it("picks the dog service by weight for older dogs", () => {
    expect(serviceKey({ species: "dog", ageGroup: "adult", weightGroup: "small" })).toBe("dog_small");
    expect(serviceKey({ species: "dog", ageGroup: "adult", weightGroup: "large" })).toBe("dog_large");
  });

  it('gives "not sure" (or no answer) the large dog service', () => {
    expect(serviceKey({ species: "dog", ageGroup: "adult", weightGroup: "unknown" })).toBe("dog_large");
    expect(serviceKey({ species: "dog", ageGroup: "adult" })).toBe("dog_large");
  });

  it("gives a cat the cat service whatever its age", () => {
    expect(serviceKey({ species: "cat", ageGroup: "young" })).toBe("cat");
    expect(serviceKey({ species: "cat", ageGroup: "adult" })).toBe("cat");
  });

  it("offers nails only as a service of its own", () => {
    expect(serviceKey({ species: "dog", ageGroup: "adult", weightGroup: "large", request: "nails" })).toBe("nails");
    expect(serviceKey({ species: "cat", ageGroup: "adult", request: "nails" })).toBe("nails");
  });

  it("cannot add a nail trim to a groom", () => {
    expect(() => PetDescription.parse({ species: "dog", ageGroup: "adult", request: ["groom", "nails"] })).toThrow();
    expect(() => PetDescription.parse({ species: "dog", ageGroup: "adult", addNails: true })).toThrow();
  });

  it("refuses the sedation shave online", () => {
    const sedation = idOf("cat_sedation");
    const sedationRules = rules.map((rule) =>
      rule.species === "cat" && rule.request === "groom"
        ? { ...rule, ageGroup: "adult" as const, serviceId: sedation }
        : rule,
    );
    const result = resolveService(PetDescription.parse({ species: "cat", ageGroup: "adult" }), sedationRules, services);
    expect(result).toMatchObject({ ok: false, reason: "NotBookableOnline" });
  });

  it("reports a missing rule or an inactive service", () => {
    expect(resolveService(PetDescription.parse({ species: "cat", ageGroup: "adult" }), [], services)).toEqual({
      ok: false,
      reason: "NoRule",
    });
    const inactive = services.map((service) => ({ ...service, active: service.id !== idOf("cat") }));
    expect(resolveService(PetDescription.parse({ species: "cat", ageGroup: "adult" }), rules, inactive)).toEqual({
      ok: false,
      reason: "NoRule",
    });
  });
});

describe("a chosen service", () => {
  it("names the species it is for; nails only is for both", () => {
    expect(speciesFor(idOf("cat"), rules)).toEqual(["cat"]);
    expect(speciesFor(idOf("puppy"), rules)).toEqual(["dog"]);
    expect(speciesFor(idOf("nails"), rules)).toEqual(["dog", "cat"]);
  });

  it("gives the pet's age and weight where the service says them", () => {
    expect(profileFor(idOf("puppy"), "dog", rules)).toEqual({ ageGroup: "young", weightGroup: null });
    expect(profileFor(idOf("dog_small"), "dog", rules)).toEqual({ ageGroup: "adult", weightGroup: "small" });
    // "Over 10 kg" and "not sure" both lead to the large dog groom; the first rule wins the tie.
    expect(profileFor(idOf("dog_large"), "dog", rules).ageGroup).toBe("adult");
    expect(profileFor(idOf("cat"), "cat", rules)).toEqual({ ageGroup: null, weightGroup: null });
    expect(profileFor(idOf("nails"), "dog", rules)).toEqual({ ageGroup: null, weightGroup: null });
  });
});
