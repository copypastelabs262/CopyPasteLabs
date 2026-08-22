import "server-only";
import { createSarvamProvider } from "@/lib/transcription/sarvam";
import { createFixtureProvider } from "@/lib/transcription/fixture";
import type { TranscriptionProvider } from "@/lib/transcription/types";

// The only place a concrete provider is named. Swapping providers is a change
// here and nowhere else -- that is the entire purpose of ./types.ts.
//
// Sarvam is the default. The fixture provider replays captured Lab v0 responses
// and must be asked for explicitly (TRANSCRIPTION_PROVIDER=fixture), because a
// transcript that was never transcribed is a serious claim to make about a
// lecture and it should never be reachable by a missing variable.
export function getTranscriptionProvider(): TranscriptionProvider {
  return process.env.TRANSCRIPTION_PROVIDER === "fixture"
    ? createFixtureProvider()
    : createSarvamProvider();
}

// For the UI, so a page can say plainly which one is in use rather than
// leaving a replayed transcript looking like a real one.
export function activeProviderId(): "sarvam" | "fixture" {
  return process.env.TRANSCRIPTION_PROVIDER === "fixture" ? "fixture" : "sarvam";
}
