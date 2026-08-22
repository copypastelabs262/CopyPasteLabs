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
  filename: string;
  contentType: string;
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
}
