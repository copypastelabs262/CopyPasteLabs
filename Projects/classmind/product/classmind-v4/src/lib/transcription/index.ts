import "server-only";
import { createSarvamProvider } from "@/lib/transcription/sarvam";
import {
  createFixtureProvider, fixtureSlugOfJobId, isKnownFixtureSlug, listFixtureSlugs,
} from "@/lib/transcription/fixture";
import { replayIsAllowedIn, type TranscriptionProvider } from "@/lib/transcription/types";

// The only place a concrete provider is named. Swapping providers is a change
// here and nowhere else -- that is the entire purpose of ./types.ts.
//
// WHAT CHANGED, AND WHY
//
// The fixture provider replays a transcript that some OTHER recording produced.
// On 2026-08-22 that reached a deployed product: a lecture uploaded as
// "Cloud computing.mp3" was stored correctly, byte-for-byte, and then shown a
// thermodynamics transcript captured from a Lab v0 run the previous day. The
// provenance said so and the UI displayed it, but a faculty member should never
// have to read a provenance panel to find out the transcript is not theirs.
//
// Two mechanisms conspired: the fixture was chosen by the uploaded FILENAME,
// and the provider was chosen by an AMBIENT ENVIRONMENT VARIABLE. The previous
// fix -- refuse `TRANSCRIPTION_PROVIDER=fixture` when process.env.VERCEL is set
// -- had the right diagnosis and the wrong cure: it was one signal on one
// platform, and it did nothing at all about the filename.
//
// Both mechanisms are now gone. `TRANSCRIPTION_PROVIDER` is not read anywhere
// in this codebase, and `pickFixture` no longer exists. Replay is a property of
// a single lecture, named explicitly when that lecture is created, refused on
// any deployment, and visible in the row as `replay_fixture_slug`. A lecture
// created without naming a fixture cannot be replayed under any environment,
// any env var, or any filename.
//
// The Vercel refusal is kept and widened rather than dropped: it is now a
// refusal at the point of REQUEST, which appears in logs, instead of a refusal
// against an ambient setting that may have been changed since.

// Anything a provider decision can legitimately depend on. It is deliberately
// this narrow: a course, a language, a lecturer, a filename and a file size are
// all absent, because none of them may ever influence which engine runs.
export interface ProviderSelection {
  replay_fixture_slug?: string | null;
}

// The rule itself is `replayIsAllowedIn` in ./types.ts -- a pure function of two
// environment signals, kept there so a test running under plain node can
// EXECUTE it against a simulated deployment rather than merely read it. All
// this does is bind it to the real environment.
export function replayIsAllowedHere(): boolean {
  return replayIsAllowedIn(process.env);
}

export function replayRefusalReason(): string {
  return (
    "Fixture replay is refused here. Replay attaches a transcript from a different " +
    "recording to a lecture, so it is confined to a developer's own machine: it is not " +
    "available on any deployment or in any production build. Nothing has been created."
  );
}

export function assertReplayAllowed(): void {
  if (!replayIsAllowedHere()) throw new Error(replayRefusalReason());
}

// ---------------------------------------------------------------------------
// The other half: accidental SPENDING
// ---------------------------------------------------------------------------
//
// Removing TRANSCRIPTION_PROVIDER closed the accidental-replay hole and opened
// an accidental-spend one, in the same move and in the opposite direction. A
// script that still exports TRANSCRIPTION_PROVIDER=fixture is no longer in
// fixture mode -- the variable is read nowhere -- so it falls through to the
// live provider and pays for a transcription while its author believes it is
// replaying. The old failure was silent replay; this would be silent billing,
// and "silent" is the word both have in common.
//
// So on a developer machine a lecture that names no fixture is REFUSED rather
// than transcribed for real. A live call there is almost always an unmigrated
// caller; when it genuinely is not, it is opted into per shell, deliberately,
// with ALLOW_LIVE_SARVAM=1.
//
// THE ASYMMETRY IS THE POINT, and it must survive every future edit:
//
//   ALLOW_LIVE_SARVAM can only ever permit SPENDING MONEY on a developer
//   machine. It cannot permit replay, anywhere. replayIsAllowedHere() does not
//   consult it, does not consult any other environment variable, and still
//   refuses outright on Vercel and in any production build.
//
// On a deployment the guard does not apply at all, because there a live call is
// not a mistake -- it is the product.
export function liveCallIsAllowedHere(): boolean {
  if (!replayIsAllowedHere()) return true;
  return process.env.ALLOW_LIVE_SARVAM === "1";
}

export function liveCallRefusalReason(): string {
  return (
    "This lecture named no replay fixture, so transcribing it would make a live, billable " +
    "call to Sarvam. On a developer machine that is almost always a mistake -- usually a " +
    "script that has not been migrated off the old TRANSCRIPTION_PROVIDER=fixture " +
    "environment variable, which is no longer read anywhere. Pass " +
    "replayFixture: \"<slug>\" when creating the lecture, or set ALLOW_LIVE_SARVAM=1 to " +
    "spend money deliberately. ALLOW_LIVE_SARVAM does not enable replay and has no effect " +
    "on any deployment."
  );
}

export function knownFixtureSlugs(): string[] {
  return listFixtureSlugs();
}

export function fixtureSlugExists(slug: string): boolean {
  return isKnownFixtureSlug(slug);
}

// See the note on fixtureSlugOfJobId in ./fixture.ts. It reports which fixture
// a job id THIS SERVER wrote belongs to; it can never start a replay.
export function replaySlugOfJobId(providerJobId: string): string | null {
  return fixtureSlugOfJobId(providerJobId);
}

// ---------------------------------------------------------------------------
// A bridge, and only a bridge, for the unapplied migration
// ---------------------------------------------------------------------------
//
// `lectures.replay_fixture_slug` arrives in 20260830150000_audio_identity.sql,
// which is WRITTEN BUT NOT APPLIED. Until it is applied there is nowhere on the
// row to record which fixture a lecture asked for, and without that the
// end-to-end suites would silently make paid live calls instead of replaying.
//
// So a replay request is remembered in this process, and ONLY in this process.
// The rules that make that safe:
//
//   * It is written only by the lecture-create route, only after
//     assertReplayAllowed() has passed, so nothing here can be reached on a
//     deployment.
//   * It is keyed by lecture id, so it can only ever confirm a replay that this
//     server was itself asked for. It cannot be forged from outside.
//   * It is consulted only when the column is absent. The moment the migration
//     is applied the row wins and this map is dead code.
//   * Losing it (a restart) must FAIL rather than fall through to a paid live
//     call -- see `expectReplay` in the transcribe route.
const replayRequests = new Map<string, string>();

export function rememberReplayRequest(lectureId: string, slug: string): void {
  replayRequests.set(lectureId, slug);
}

export function recallReplayRequest(lectureId: string): string | null {
  return replayRequests.get(lectureId) ?? null;
}

// The provider for ONE lecture. There is no branch other than the one below,
// and the argument is a row, not an environment.
export function getTranscriptionProvider(lecture: ProviderSelection): TranscriptionProvider {
  const slug = lecture.replay_fixture_slug;
  if (slug) {
    assertReplayAllowed();
    return createFixtureProvider(slug);
  }
  return createSarvamProvider();
}

// For the UI and for scripts, so a page or a test can state plainly which
// provider produced what it is showing rather than leaving a replayed
// transcript looking like a real one.
export function activeProviderId(lecture: ProviderSelection): "sarvam" | "fixture" {
  return lecture.replay_fixture_slug && replayIsAllowedHere() ? "fixture" : "sarvam";
}
