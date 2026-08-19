// The boundary between this app and any transcription provider.
//
// Provider-specific job states collapse to the three values below -- see the
// comment above `provider_job_id` in the Milestone 2 migration, which names
// this file. Nothing downstream of this module knows the word "Sarvam", so a
// second provider is a new file plus a one-line change in ./index.ts.

export type ProviderJobState = "in_progress" | "completed" | "failed";

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
  readonly descriptor: ProviderDescriptor;
  submit(audio: AudioToTranscribe): Promise<SubmittedJob>;
  poll(providerJobId: string): Promise<JobPoll>;
  // Returns the provider's response exactly as received. Callers persist it
  // unchanged; normalization is a separate, later step.
  fetchRawResult(providerJobId: string): Promise<unknown>;
}
