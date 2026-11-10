import { AiError, type AiProvider } from "./types";

export type FakeAi = AiProvider & {
  /** "ok" answers at once; "fail" throws; "slow" waits longer than the timeout; "invalid" gives an answer no kind accepts. */
  mode: "ok" | "fail" | "slow" | "invalid";
  calls: number;
};

const COST = 5;

/** Fixed answers for local work and tests: each request says what the stand-in answers. */
export function createFakeAi(): FakeAi {
  const ai: FakeAi = {
    mode: "ok",
    calls: 0,
    estimateAgorot: () => COST,
    async ask(request) {
      ai.calls += 1;
      if (ai.mode === "fail") throw new AiError("fake failure", 1);
      if (ai.mode === "slow") await new Promise((resolve) => setTimeout(resolve, 60_000));
      return { text: ai.mode === "invalid" ? "" : request.fake, model: "fake", costAgorot: COST };
    },
  };
  return ai;
}
