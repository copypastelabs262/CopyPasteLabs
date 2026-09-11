// The boundary between this app and any transcription provider.
//
// Provider-specific job states collapse to the three values below. Nothing
// downstream of this module knows the word "Sarvam", so a second provider is
// a new file plus a one-line change in ./index.ts.

export type ProviderJobState = "in_progress" | "completed" | "failed";

// The language a run is transcribed as when the caller names nothing.
//
// Lab v0 hardcoded detection ("unknown") on the theory that Hinglish is
// code-switched by definition and the engine should decide. One real lecture
// disproved it: Sarvam reported language_probability 0.617 and returned
// romanized ARABIC for an English/Hinglish engineering class. The transcript
// was fluent, confident, and worthless, and nothing in the response said the
// detection had failed. The failure is silent and confidence-dependent,
// which means it will recur on exactly the recordings that are hardest to
// notice it on.
//
// A course knows what language it is taught in. That knowledge beats the
// engine's guess, so it is now supplied per call and this is only the
// fallback when a caller has nothing to say.
export const DEFAULT_LANGUAGE_CODE = "en-IN";

// Hand the decision back to the engine. Still permitted -- for a genuinely
// unknown recording it is the only honest option -- but it must be chosen
// deliberately rather than inherited from a default, and a run made this way
// carries a provenance limitation saying so.
export const LANGUAGE_DETECT = "unknown";

export interface AudioToTranscribe {
  bytes: ArrayBuffer;
  // The lecture these bytes belong to. Deliberately NOT a filename.
  //
  // This field used to be `filename` and carried lecture.original_filename --
  // a string the uploader chose. Two things went through it: the name Sarvam
  // was told to store the input and output under, and the value the fixture
  // provider keyed its choice of transcript off. On 2026-08-22 a lecture named
  // "Cloud computing.mp3" hashed to a fixture of an engineering thermodynamics
  // course outline and was served that transcript.
  //
  // Removing the field rather than sanitising it is the point: there is now no
  // way for a caller to hand a provider a user-controlled string, and the
  // compiler says so at every call site. What the provider is told instead is
  // OUR identifier, which makes the job's input and output files provably the
  // files we named.
  lectureId: string;
  // Container extension, taken from the storage path the server generated --
  // never from the uploaded name. Used only to build the provider-side
  // filename; providers must not branch on it.
  fileExtension: string;
  contentType: string;
}

// The name a provider stores this audio under, on its side. One definition so
// the two providers cannot disagree, and so a future provider cannot quietly
// reintroduce a user-supplied name.
//
// Sarvam has completed jobs from an 89-character basename containing double
// spaces and commas, so it is not fussy and a UUID is safe -- but the first
// live job through this path should still be watched, because a filename Sarvam
// rejects breaks `upload_urls` lookup AND `download-files`, and it fails at
// submit rather than silently.
export function providerFilename(audio: AudioToTranscribe): string {
  const ext = audio.fileExtension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${audio.lectureId}.${ext || "bin"}`;
}

// WHERE FIXTURE REPLAY IS PERMITTED, as a pure function of the environment.
//
// Replay attaches a transcript from a DIFFERENT recording to a lecture. On
// 2026-08-22 that reached a deployed product because the switch was an ambient
// environment variable, set for a demo and forgotten. So the rule is stated
// here, once, as a function of two signals and nothing else:
//
//   VERCEL      set in build and runtime for every deployment, production and
//               preview alike. Preview is NOT exempt: preview URLs get shared,
//               and a shared URL serving another lecture's transcript is the
//               same failure.
//   NODE_ENV    covers a production build served from anywhere else -- a
//               container, a VM, someone running `next start` on a laptop.
//
// It reads NO OTHER VARIABLE, deliberately and permanently. In particular
// ALLOW_LIVE_SARVAM, which permits deliberate SPENDING on a developer machine,
// must never be able to permit replay: those two switches point in opposite
// directions and the asymmetry is the whole safety property.
//
// It lives in this file, with no imports and no `server-only`, so the rule can
// be EXECUTED against a simulated deployment environment by a test running
// under plain node. A safety rule that can only be reasoned about, never run,
// is the kind that quietly stops holding.
export function replayIsAllowedIn(env: {
  VERCEL?: string | undefined;
  NODE_ENV?: string | undefined;
}): boolean {
  return !env.VERCEL && env.NODE_ENV !== "production";
}

export interface SubmittedJob {
  providerJobId: string;
  // The provider's own status string. Debug/audit only -- application code
  // branches on ProviderJobState, never on this.
  providerStatus: string;
  // The language code actually sent, after defaulting. Persist it with the
  // run: provenance is written later, often in a different request, and
  // `describe()` can only reproduce the decoding params of this call if it
  // is given the same language this call used.
  languageCode: string;
}

export interface JobPoll {
  state: ProviderJobState;
  providerStatus: string;
  errorMessage: string | null;
  // Provider-side job timestamps, when the provider reports them. These are
  // what make a truthful processing duration possible; the run row's own
  // timestamps would fold in upload and queue time.
  providerCreatedAt: string | null;
  providerUpdatedAt: string | null;
}

// Everything a provider must state about itself for a provenance record to
// be written without the caller guessing. A provider that cannot meet a
// provenance obligation says so in `limitations` rather than leaving the
// caller to invent a value.
export interface ProviderDescriptor {
  engine: string;
  modelSnapshot: string;
  // False when the provider publishes only a floating alias. Never set true
  // to satisfy Constitution IV -- fix the provider, not the flag.
  modelSnapshotIsDated: boolean;
  modelVersion: string;
  apiVersion: string;
  decodingParams: Record<string, unknown>;
  configuredLanguage: string;
  limitations: string[];
}

export interface TranscriptionProvider {
  // Not a constant, because part of what a provider does to a run is chosen
  // per call. Building the descriptor from the same language the job was
  // submitted with is what keeps provenance.decodingParams equal to the
  // request body rather than merely similar to it (Constitution IV).
  describe(languageCode?: string): ProviderDescriptor;
  submit(
    audio: AudioToTranscribe,
    // Chosen by the caller -- in practice the course's configured language.
    // Omitted means DEFAULT_LANGUAGE_CODE, never LANGUAGE_DETECT.
    languageCode?: string,
  ): Promise<SubmittedJob>;
  poll(providerJobId: string): Promise<JobPoll>;
  // Returns the provider's response exactly as received. Callers persist it
  // unchanged; normalization is a separate, later step.
  fetchRawResult(providerJobId: string): Promise<unknown>;
  // The provider's own identity for the audio it decoded, lifted out of the
  // raw response HERE rather than by a route reaching into a provider-shaped
  // field. That is what keeps this file the whole boundary: nothing downstream
  // knows the word "Sarvam", and an identity check must not be the exception.
  //
  // It is a DISCRIMINATOR, not a proof of origin. Sarvam computes it over its
  // own decoded audio -- the response reports audio/wav for a file sent as mp3
  // -- so it can never establish "this transcript is of my audio". What it can
  // establish is "this decoded audio has been seen before, under a different
  // recording", which is the question the identity ledger asks.
  //
  // Null is a legitimate answer: not every provider returns one, and not every
  // response carries one. A null must be recorded as unverified, never as
  // agreement.
  audioIdentity(raw: unknown): string | null;
}
