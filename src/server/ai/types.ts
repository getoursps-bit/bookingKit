import { z } from "zod";

export const COAT_CONDITIONS = ["normal", "tangled", "matted", "very_matted", "unclear"] as const;
export type CoatCondition = (typeof COAT_CONDITIONS)[number];

/** What photo analysis may say: these fields only, never anything about skin, injuries or health. */
export const PhotoResult = z.object({
  species: z.enum(["dog", "cat", "unclear"]),
  breed: z.string().trim().max(60).nullable(),
  coat: z.string().trim().max(60).nullable(),
  condition: z.enum(COAT_CONDITIONS),
});
export type PhotoResult = z.output<typeof PhotoResult>;

export type SummaryInput = {
  when: string;
  customerNotes: string | null;
  ownerNotes: string | null;
  noShowCount: number;
  pastVisits: number;
  pets: {
    name: string;
    species: string;
    breed: string | null;
    service: string;
    coatNotes: string | null;
    coatCondition: string | null;
    temperamentNote: string | null;
  }[];
};

export type Usage = { model: string; promptVersion: string; costAgorot: number };

export class AiError extends Error {
  constructor(
    message: string,
    /** What the call cost even though it failed (tokens were used). */
    readonly costAgorot = 0,
  ) {
    super(message);
  }
}

/**
 * The AI provider. Calls either return a checked result or throw AiError.
 * `estimateAgorot` is the most a call may cost, reserved against the cap first.
 */
export interface AiProvider {
  analysePhoto(image: Uint8Array, mediaType: string): Promise<PhotoResult & Usage>;
  summarise(input: SummaryInput): Promise<{ textHe: string } & Usage>;
  estimateAgorot(kind: "photo" | "summary"): number;
}
