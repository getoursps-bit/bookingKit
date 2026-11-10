import Anthropic from "@anthropic-ai/sdk";
import { aiConfig } from "./config";
import { AiError, type AiProvider } from "./types";

const TIMEOUT_MS = 20_000;
// Room for the model's reasoning as well as the short answer.
const MAX_TOKENS = 2_000;
// Rough input sizes, used only to reserve spend before a call: a 1280 px photo
// is about 1,600 tokens; a text question's facts are well under 2,000.
const EXPECTED_INPUT = { image: 2_500, text: 2_000 };

/**
 * The Anthropic adapter. The model and its prices come from AI_MODEL and the
 * AI_PRICE_* variables, so the model is confirmed with the owner, not chosen
 * here. Retries are the job's (two attempts), not the SDK's. What is asked,
 * and how the answer is checked, belongs to the kind of job (api.ts).
 */
export function createAnthropicAi(): AiProvider {
  const { apiKey, model, inputPrice, outputPrice } = aiConfig();
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });

  const cost = (input: number, output: number) => Math.ceil((input * inputPrice + output * outputPrice) / 1_000_000);

  return {
    estimateAgorot: (input) => cost(EXPECTED_INPUT[input], MAX_TOKENS),

    async ask({ system, text: question, image }) {
      const content: Anthropic.ContentBlockParam[] = [];
      if (image) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: image.mediaType as "image/webp", data: Buffer.from(image.bytes).toString("base64") },
        });
      }
      content.push({ type: "text", text: question });
      let response: Anthropic.Message;
      try {
        response = await client.messages.create({ model, max_tokens: MAX_TOKENS, system, messages: [{ role: "user", content }] });
      } catch (error) {
        if (error instanceof Anthropic.APIError) throw new AiError(`AI API ${error.status ?? "connection"} error`);
        throw new AiError("AI call failed");
      }
      const spent = cost(response.usage.input_tokens, response.usage.output_tokens);
      if (response.stop_reason === "refusal") throw new AiError("refused", spent);
      if (response.stop_reason === "max_tokens") throw new AiError("answer cut off", spent);
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      if (!text) throw new AiError("empty answer", spent);
      return { text, model, costAgorot: spent };
    },
  };
}
