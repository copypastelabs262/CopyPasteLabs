import "server-only";
import { createSarvamProvider } from "@/lib/transcription/sarvam";
import { createFixtureProvider } from "@/lib/transcription/fixture";
import type { TranscriptionProvider } from "@/lib/transcription/types";

// The only place a concrete provider is named. Swapping providers is a change
// here and nowhere else -- that is the entire purpose of ./types.ts.

// The fixture provider replays a transcript that some OTHER recording produced.
// On 2026-08-22 that reached a deployed product: a lecture uploaded as
// "Cloud computing.mp3" was stored correctly, byte-for-byte, and then shown a
// thermodynamics transcript captured from a Lab v0 run the previous day. The
// provenance said so and the UI displayed it, but a faculty member should never
// have to read a provenance panel to find out the transcript is not theirs.
//
// The env var alone was not enough protection, because an environment variable
// is exactly the kind of thing that gets set for a demo and then forgotten. So
// replay is now confined to a developer's own machine by something an env var
// cannot override: it refuses to run anywhere Vercel is executing it.
//
// Consequence, accepted deliberately: the end-to-end suites can no longer be
// pointed at a deployment without paying for real transcription. That is the
// correct trade -- a suite that passes against replayed data was never testing
// the thing it claimed to.
function assertFixtureIsAllowed(): void {
  // Vercel sets VERCEL=1 in build and runtime for every deployment, production
  // and preview alike. Preview is not exempt: preview URLs get shared, and a
  // shared URL serving another lecture's transcript is the same failure.
  if (process.env.VERCEL) {
    throw new Error(
      "TRANSCRIPTION_PROVIDER=fixture is set on a deployed environment. " +
        "Replay would attach a transcript from a different recording to this lecture, " +
        "so it is refused. Remove TRANSCRIPTION_PROVIDER from this deployment's " +
        "environment variables and redeploy; fixture mode is for local development only.",
    );
  }
}

export function getTranscriptionProvider(): TranscriptionProvider {
  if (process.env.TRANSCRIPTION_PROVIDER === "fixture") {
    assertFixtureIsAllowed();
    return createFixtureProvider();
  }
  return createSarvamProvider();
}

// For the UI and for scripts, so a page or a test can state plainly which
// provider produced what it is showing rather than leaving a replayed
// transcript looking like a real one.
export function activeProviderId(): "sarvam" | "fixture" {
  return process.env.TRANSCRIPTION_PROVIDER === "fixture" && !process.env.VERCEL
    ? "fixture"
    : "sarvam";
}
