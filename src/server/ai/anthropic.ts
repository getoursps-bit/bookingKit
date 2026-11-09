import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config";
import { PHOTO_PROMPT, PHOTO_PROMPT_VERSION, SUMMARY_PROMPT, SUMMARY_PROMPT_VERSION } from "./prompts";
import { AiError, type AiProvider, PhotoResult } from "./types";

const TIMEOUT_MS = 20_000;
// Room for the model's reasoning as well as the short answer.
const MAX_TOKENS = 2_000;
// Rough input sizes, used only to reserve spend before a call: a 1280 px photo
// is about 1,600 tokens; a summary's facts are well under 2,000.
const EXPECTED_INPUT = { photo: 2_500, summary: 2_000 };

/**
 * The Anthropic adapter. The model and its prices come from AI_MODEL and the
 * AI_PRICE_* variables, so the model is confirmed with the owner, not chosen
 * here. Retries are the job's (two attempts), not the SDK's.
 */
export function createAnthropicAi(): AiProvider {
  const config = getConfig();
  const model = config.AI_MODEL!;
  const inputPrice = Number(config.AI_PRICE_INPUT_AGOROT_PER_MTOK);
  const outputPrice = Number(config.AI_PRICE_OUTPUT_AGOROT_PER_MTOK);
  const client = new Anthropic({ apiKey: config.AI_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });

  const cost = (input: number, output: number) => Math.ceil((input * inputPrice + output * outputPrice) / 1_000_000);

  async function call(system: string, content: Anthropic.ContentBlockParam[]): Promise<{ text: string; costAgorot: number }> {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content }],
      });
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
    return { text, costAgorot: spent };
  }

  return {
    estimateAgorot: (kind) => cost(EXPECTED_INPUT[kind], MAX_TOKENS),

    async analysePhoto(image, mediaType) {
      const { text, costAgorot } = await call(PHOTO_PROMPT, [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/webp",
            data: Buffer.from(image).toString("base64"),
          },
        },
        { type: "text", text: "Return the JSON object for this pet." },
      ]);
      const json = /\{[\s\S]*\}/.exec(text)?.[0];
      let parsed: unknown;
      try {
        parsed = json ? JSON.parse(json) : null;
      } catch {
        parsed = null;
      }
      const result = PhotoResult.safeParse(parsed);
      if (!result.success) throw new AiError("invalid output", costAgorot);
      return { ...result.data, model, promptVersion: PHOTO_PROMPT_VERSION, costAgorot };
    },

    async summarise(input) {
      const { text, costAgorot } = await call(SUMMARY_PROMPT, [{ type: "text", text: JSON.stringify(input) }]);
      if (text.length > 800) throw new AiError("summary too long", costAgorot);
      return { textHe: text, model, promptVersion: SUMMARY_PROMPT_VERSION, costAgorot };
    },
  };
}
