import { type ProviderMode, serviceMode } from "@/server/config";

// The model and its prices are set with the key, so no model is ever picked by default.
const KEYS = ["AI_API_KEY", "AI_MODEL", "AI_PRICE_INPUT_AGOROT_PER_MTOK", "AI_PRICE_OUTPUT_AGOROT_PER_MTOK"] as const;

/** fake locally and in CI; real when every AI_* variable is set; off when none is. */
export function aiMode(): ProviderMode {
  return serviceMode(KEYS);
}

/** The AI_* variables, checked. Only called when the mode is "real". */
export function aiConfig(env: Record<string, string | undefined> = process.env) {
  const price = (name: (typeof KEYS)[number]) => {
    const value = Number(env[name]);
    // Agorot per million tokens, from the provider's price list for AI_MODEL.
    if (!/^\d+(\.\d+)?$/.test(env[name]?.trim() ?? "")) throw new Error(`Invalid environment configuration:\n  ${name}: a number`);
    return value;
  };
  return {
    apiKey: env.AI_API_KEY!.trim(),
    model: env.AI_MODEL!.trim(),
    inputPrice: price("AI_PRICE_INPUT_AGOROT_PER_MTOK"),
    outputPrice: price("AI_PRICE_OUTPUT_AGOROT_PER_MTOK"),
  };
}
