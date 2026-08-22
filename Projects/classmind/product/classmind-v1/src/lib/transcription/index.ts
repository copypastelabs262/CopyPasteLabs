import "server-only";
import { createSarvamProvider } from "@/lib/transcription/sarvam";
import type { TranscriptionProvider } from "@/lib/transcription/types";

// The only place the concrete provider is named. Swapping providers is a
// one-line change here -- that is the entire purpose of ./types.ts.
export function getTranscriptionProvider(): TranscriptionProvider {
  return createSarvamProvider();
}
