import { SEED as content } from "../../db/seed/structure";

/**
 * A seeded service's id. Each test schema is new and the seed adds the
 * services in file order, so the ids count from 1 in that order.
 */
export function seededServiceId(key: string): number {
  const index = content.services.findIndex((service) => service.key === key);
  if (index < 0) throw new Error(`No seeded service "${key}"`);
  return index + 1;
}

/**
 * The service of a test booking: a small dog's care where the client has the
 * kit's grooming services, else the client's first service that books online.
 */
const USUAL_SERVICE = content.services.some((service) => service.key === "dog_small")
  ? seededServiceId("dog_small")
  : content.services.findIndex((service) => service.bookable_online) + 1;

const dog = { species: "dog", name: "בדיקה", vetName: "מרפאת בדיקה", vaccinesConfirmed: true } as const;

/** One booking line for a small adult dog, as the details step sends it. Made-up names only. */
export function dogWith(overrides: Record<string, unknown> = {}) {
  return { serviceId: USUAL_SERVICE, details: { pets: { ...dog, ...overrides } } };
}

/** The usual line of a test booking. A client without the pets extension ignores the pet details. */
export const testDog = dogWith();
