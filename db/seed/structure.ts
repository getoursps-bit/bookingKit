// Imported, not read from disk, so the bundled release script carries it.
import data from "./data.json" with { type: "json" };

/** The shape of data.json: the business's starting content without its text. */
export type SeedData = {
  services: { key: string; duration_min: number; price_from_agorot: number; bookable_online: boolean }[];
  products: { key: string; price_agorot: number }[];
  opening_hours: { weekday: number; opens: string | null; closes: string | null; closed: boolean }[];
  message_templates: { key: string; channel: string; provider_template?: string; category?: string }[];
};

/**
 * data.json with its type said out loud. Read it from here, never from the
 * file: a client with no products has an empty list there, and TypeScript
 * would otherwise take that list to hold nothing at all.
 */
export const SEED: SeedData = data;
