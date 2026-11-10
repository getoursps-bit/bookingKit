/** One question to the model. */
export type AiRequest = {
  /** The instructions. */
  system: string;
  /** What is asked. */
  text: string;
  /** A picture to look at, when the question is about one. */
  image?: { bytes: Uint8Array; mediaType: string };
  /** What the built-in stand-in answers, locally and in tests. */
  fake: string;
};

export type AiAnswer = { text: string; model: string; costAgorot: number };

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
 * The AI provider. A call returns the model's text or throws AiError.
 * `estimateAgorot` is the most a call may cost, reserved against the cap first.
 */
export interface AiProvider {
  ask(request: AiRequest): Promise<AiAnswer>;
  estimateAgorot(input: "text" | "image"): number;
}
