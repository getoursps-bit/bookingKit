import { AiError, type AiProvider, type PhotoResult } from "./types";

export type FakeAi = AiProvider & {
  /** "ok" answers at once; "fail" throws; "slow" waits longer than the timeout; "invalid" breaks the result check. */
  mode: "ok" | "fail" | "slow" | "invalid";
  calls: number;
};

const COST = 5;

/** Fixed answers for local work and tests. */
export function createFakeAi(): FakeAi {
  const ai: FakeAi = {
    mode: "ok",
    calls: 0,
    estimateAgorot: () => COST,
    async analysePhoto() {
      ai.calls += 1;
      await behave(ai.mode);
      const result: PhotoResult = { species: "dog", breed: "פודל מעורב", coat: "תלתלי", condition: "tangled" };
      return { ...result, model: "fake", promptVersion: "fake", costAgorot: COST };
    },
    async summarise(input) {
      ai.calls += 1;
      await behave(ai.mode);
      const names = input.pets.map((pet) => pet.name).join(", ");
      return { textHe: `מחר ${input.when}: ${names}.`, model: "fake", promptVersion: "fake", costAgorot: COST };
    },
  };
  return ai;
}

async function behave(mode: FakeAi["mode"]): Promise<void> {
  if (mode === "fail") throw new AiError("fake failure", 1);
  if (mode === "invalid") throw new AiError("invalid output", COST);
  if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 60_000));
}
