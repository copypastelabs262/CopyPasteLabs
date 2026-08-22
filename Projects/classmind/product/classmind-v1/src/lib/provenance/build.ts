import "server-only";
import type { ProcessingProvenance } from "@/types/provenance";
import type { ProviderDescriptor } from "@/lib/transcription/types";
import { getCommitHash } from "@/lib/provenance/commit";

interface BuildInput {
  // Must come from provider.describe(<the language this run was submitted
  // with>), not from a describe() with no argument. The descriptor carries
  // decodingParams, and decodingParams is only a record of the request if it
  // was built from the same language the request used.
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

// The engine's own confidence in that language. The Arabic run reported
// 0.617 and was wrong; nothing else in the response hinted at it, which
// makes this the only early warning the artefact contains.
function languageProbability(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = (raw as Record<string, unknown>).language_probability;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Not calibrated -- one failure at 0.617 is not a threshold. It is set high
// enough to catch that case and only ever appends a note, so an over-eager
// value costs a line of text and a missed one costs a silent wrong-language
// transcript. Lower it once there are enough runs to know where the edge is.
const LOW_LANGUAGE_CONFIDENCE = 0.8;

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
  const probability = languageProbability(input.rawResponse);

  // A run that stated its language and got a different one back is the
  // visible symptom of the failure that produced romanized Arabic from an
  // English lecture. It is not proof of anything -- code-switched audio can
  // legitimately be reported as the other language -- so it is recorded as a
  // limitation for a reader to weigh, not raised as an error.
  if (
    detected &&
    descriptor.configuredLanguage !== "unknown" &&
    detected !== descriptor.configuredLanguage
  ) {
    limitations.push(
      "Sarvam reported language " +
        detected +
        " but the run was configured as " +
        descriptor.configuredLanguage +
        "; the transcript may be in the wrong language.",
    );
  }

  if (probability !== null && probability < LOW_LANGUAGE_CONFIDENCE) {
    limitations.push(
      "Engine language confidence was " +
        probability +
        "; a transcript produced at this confidence has previously come back in an unrelated language while reading as fluent.",
    );
  }

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
