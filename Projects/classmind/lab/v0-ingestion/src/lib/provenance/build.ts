import "server-only";
import type { ProcessingProvenance } from "@/types/provenance";
import type { ProviderDescriptor } from "@/lib/transcription/types";
import { getCommitHash } from "./commit";

interface BuildInput {
  descriptor: ProviderDescriptor;
  // Provider-side job timestamps. These give real processing duration; the
  // row's own timestamps would include upload and queue time.
  providerCreatedAt: string | null;
  providerUpdatedAt: string | null;
  // Fallback only, used when the provider reports no usable timestamps.
  runCreatedAt: string | null;
  rawResponse: unknown;
}

// Pulls the engine-reported language out of the raw response without
// assuming its shape -- the raw artefact is authoritative, this is a read.
function detectedLanguage(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = (raw as Record<string, unknown>).language_code;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function buildProvenance(input: BuildInput): ProcessingProvenance {
  const { descriptor } = input;
  const limitations = [...descriptor.limitations];

  let processingTimeMs = 0;
  const started = input.providerCreatedAt
    ? Date.parse(input.providerCreatedAt)
    : NaN;
  const finished = input.providerUpdatedAt
    ? Date.parse(input.providerUpdatedAt)
    : NaN;

  if (Number.isFinite(started) && Number.isFinite(finished) && finished >= started) {
    processingTimeMs = finished - started;
  } else {
    const fallback = input.runCreatedAt ? Date.parse(input.runCreatedAt) : NaN;
    if (Number.isFinite(fallback)) {
      processingTimeMs = Date.now() - fallback;
      limitations.push(
        "processingTimeMs measured from run creation, not provider job start: it includes upload and queue time.",
      );
    } else {
      limitations.push(
        "processingTimeMs could not be determined from provider or run timestamps; recorded as 0.",
      );
    }
  }

  const commitHash = getCommitHash();
  if (commitHash === "unknown") {
    limitations.push(
      "commitHash could not be resolved: no git metadata and no GIT_COMMIT set.",
    );
  } else if (commitHash.endsWith("-dirty")) {
    limitations.push(
      "Working tree was dirty at write time; the named commit alone does not reproduce this artefact.",
    );
  }

  const detected = detectedLanguage(input.rawResponse);

  return {
    engine: descriptor.engine,
    modelSnapshot: descriptor.modelSnapshot,
    modelSnapshotIsDated: descriptor.modelSnapshotIsDated,
    modelVersion: descriptor.modelVersion,
    decodingParams: descriptor.decodingParams,
    commitHash,
    processedAt: new Date().toISOString(),
    processingTimeMs,
    costEstimate: null,
    language: detected ?? descriptor.configuredLanguage,
    configuredLanguage: descriptor.configuredLanguage,
    apiVersion: descriptor.apiVersion,
    limitations,
  };
}
