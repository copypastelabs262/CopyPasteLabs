import "server-only";
import { createSarvamProvider } from "./sarvam";
import type { TranscriptionProvider } from "./types";

// The only place the concrete provider is named. Swapping providers is a
// one-line change here -- that is the entire purpose of ./types.ts.
export function getTranscriptionProvider(): TranscriptionProvider {
  return createSarvamProvider();
}
