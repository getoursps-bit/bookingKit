import { providerMode } from "../config";
import { createAnthropicAi } from "./anthropic";
import { createFakeAi } from "./fake";
import type { AiProvider } from "./types";

let ai: AiProvider | null | undefined;

/** The AI provider, or null when AI is not set up (its features then stay off). */
export function getAi(): AiProvider | null {
  if (ai === undefined) {
    const mode = providerMode("ai");
    ai = mode === "real" ? createAnthropicAi() : mode === "fake" ? createFakeAi() : null;
  }
  return ai;
}

/** Test hook. */
export function setAiForTests(provider: AiProvider | null | undefined): void {
  ai = provider;
}
