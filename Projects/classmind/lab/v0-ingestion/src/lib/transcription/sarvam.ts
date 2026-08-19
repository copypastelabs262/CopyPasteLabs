import "server-only";
import { readEnv } from "@/lib/env";
import type {
  AudioToTranscribe,
  JobPoll,
  ProviderDescriptor,
  ProviderJobState,
  SubmittedJob,
  TranscriptionProvider,
} from "./types";

const API_BASE = "https://api.sarvam.ai/speech-to-text/job/v1";

// Sarvam publishes floating aliases only ("saaras:v3"), not the dated
// snapshot Constitution IV asks for. Recorded verbatim rather than invented;
// closing that gap needs an answer from Sarvam, not a guess here.
const MODEL = "saaras:v3";
const API_VERSION = "speech-to-text/job/v1";

// Sent verbatim on job creation and recorded verbatim as decodingParams --
// one definition, so provenance can never drift from what was actually sent.
const JOB_PARAMETERS = {
  // Hinglish is code-switched by definition; let Sarvam identify it rather
  // than asserting hi-IN or en-IN and biasing the result.
  language_code: "unknown",
  model: MODEL,
  mode: "transcribe",
  with_timestamps: true,
  with_diarization: false,
} as const;

const DESCRIPTOR: ProviderDescriptor = {
  engine: "sarvam",
  modelSnapshot: MODEL,
  // Sarvam publishes a floating alias only. Recorded honestly as undated
  // rather than fabricating a snapshot date -- see limitations below.
  modelSnapshotIsDated: false,
  modelVersion: MODEL,
  apiVersion: API_VERSION,
  decodingParams: { ...JOB_PARAMETERS },
  configuredLanguage: JOB_PARAMETERS.language_code,
  limitations: [
    "Sarvam exposes only the floating model alias saaras:v3; no dated model snapshot is published, so the dated-snapshot requirement in Constitution IV is unmet and this transcript is not pinned to an immutable model version.",
    "Sarvam returns no cost figure for a batch job; costEstimate is null.",
  ],
};

interface JobStatusResponse {
  job_state: string;
  job_id: string;
  created_at?: string | null;
  updated_at?: string | null;
  error_message?: string | null;
  job_details?: Array<{
    outputs?: Array<{ file_name: string }>;
    error_message?: string | null;
  }>;
}

function apiKey(): string {
  const key = readEnv("SARVAM_API_KEY");
  if (!key) {
    throw new Error(
      "Missing SARVAM_API_KEY. Add it to .env.local -- see .env.example.",
    );
  }
  return key;
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(API_BASE + path, {
    ...init,
    headers: {
      "api-subscription-key": apiKey(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    // Body, not headers -- the request carried the key and must never be echoed.
    const detail = await response.text().catch(() => "");
    throw new Error(
      "Sarvam " +
        (init.method ?? "GET") +
        " " +
        path +
        " failed: " +
        response.status +
        " " +
        detail.slice(0, 500),
    );
  }

  return response.json();
}

// The one step Sarvam's reference does not document. storage_container_type
// comes back as "Azure_V1", and an Azure Blob SAS upload requires PUT with an
// explicit blob-type header. Isolated in this function so it is the only
// thing to change if the first live run proves otherwise.
async function uploadToPresignedUrl(
  url: string,
  audio: AudioToTranscribe,
): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": audio.contentType,
    },
    body: audio.bytes,
  });

  if (!response.ok) {
    throw new Error(
      "Upload to provider storage failed: " + response.status,
    );
  }
}

function toState(jobState: string): ProviderJobState {
  switch (jobState) {
    case "Completed":
    case "PartiallyCompleted":
      return "completed";
    case "Failed":
      return "failed";
    default:
      // Accepted | Pending | Running, and anything Sarvam adds later. An
      // unknown state must never read as terminal.
      return "in_progress";
  }
}

async function submit(audio: AudioToTranscribe): Promise<SubmittedJob> {
  const created = (await call("", {
    method: "POST",
    body: JSON.stringify({ job_parameters: JOB_PARAMETERS }),
  })) as { job_id: string; job_state: string };

  const uploads = (await call("/upload-files", {
    method: "POST",
    body: JSON.stringify({ job_id: created.job_id, files: [audio.filename] }),
  })) as { upload_urls?: Record<string, { file_url?: string }> };

  const target = uploads.upload_urls?.[audio.filename];
  if (!target?.file_url) {
    throw new Error("Sarvam returned no upload URL for " + audio.filename + ".");
  }

  await uploadToPresignedUrl(target.file_url, audio);

  const started = (await call("/" + created.job_id + "/start", {
    method: "POST",
  })) as { job_state: string };

  return {
    providerJobId: created.job_id,
    providerStatus: started.job_state,
  };
}

async function poll(providerJobId: string): Promise<JobPoll> {
  const status = (await call(
    "/" + providerJobId + "/status",
  )) as JobStatusResponse;

  return {
    state: toState(status.job_state),
    providerStatus: status.job_state,
    errorMessage:
      status.error_message ??
      status.job_details?.[0]?.error_message ??
      null,
    providerCreatedAt: status.created_at ?? null,
    providerUpdatedAt: status.updated_at ?? null,
  };
}

async function fetchRawResult(providerJobId: string): Promise<unknown> {
  const status = (await call(
    "/" + providerJobId + "/status",
  )) as JobStatusResponse;

  const names = (status.job_details ?? [])
    .flatMap((detail) => detail.outputs ?? [])
    .map((output) => output.file_name);

  if (names.length === 0) {
    throw new Error("Sarvam reported no output files for a completed job.");
  }

  const links = (await call("/download-files", {
    method: "POST",
    body: JSON.stringify({ job_id: providerJobId, files: names }),
  })) as { download_urls?: Record<string, { file_url?: string }> };

  const first = links.download_urls?.[names[0]];
  if (!first?.file_url) {
    throw new Error("Sarvam returned no download URL for " + names[0] + ".");
  }

  const response = await fetch(first.file_url);
  if (!response.ok) {
    throw new Error("Downloading the transcript failed: " + response.status);
  }

  // Returned exactly as received. The caller persists this unchanged.
  return response.json();
}

export function createSarvamProvider(): TranscriptionProvider {
  return {
    descriptor: DESCRIPTOR,
    submit,
    poll,
    fetchRawResult,
  };
}
