import "server-only";
import { createSarvamReasoner } from "./sarvam.ts";
import { readEnv } from "../env.ts";
import type { ReasoningProvider } from "./types.ts";

// The only place a reasoning provider is named.
export function getReasoningProvider(): ReasoningProvider {
  return createSarvamReasoner();
}

// Reconstruction needs a model. Without one the pipeline still runs and still
// stores Layer-1 signals, but it stores no consolidated knowledge -- and it says
// so rather than passing sentence fragments off as understanding.
export function reasoningAvailable(): boolean {
  return readEnv("SARVAM_API_KEY") !== undefined;
}

export type { ReasoningProvider, ReasoningRequest, ReasoningResponse } from "./types.ts";
