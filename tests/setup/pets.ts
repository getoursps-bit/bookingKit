import content from "../../db/seed/data.json";

/**
 * A seeded service's id. Each test schema is new and the seed adds the
 * services in file order, so the ids count from 1 in that order.
 */
export function seededServiceId(key: string): number {
  const index = content.services.findIndex((service) => service.key === key);
  if (index < 0) throw new Error(`No seeded service "${key}"`);
  return index + 1;
}

const dog = { species: "dog", name: "בדיקה", vetName: "מרפאת בדיקה", vaccinesConfirmed: true } as const;

/** One booking line for a small adult dog, as the details step sends it. Made-up names only. */
export function dogWith(overrides: Record<string, unknown> = {}) {
  return { serviceId: seededServiceId("dog_small"), details: { pets: { ...dog, ...overrides } } };
}

/** The usual line of a test booking. A client without the pets extension ignores the pet details. */
export const testDog = dogWith();
