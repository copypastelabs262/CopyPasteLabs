import "server-only";
import type { ProcessingProvenance } from "@/types/provenance";
import type { ProviderDescriptor } from "@/lib/transcription/types";
import { getCommitHash } from "@/lib/provenance/commit";
import { validateTranscript, type TranscriptValidation } from "@/lib/provenance/transcript-validation";
import { normalizeRawTranscript } from "@/lib/transcript/normalize";

interface BuildInput {
  // The run this record describes, and the provider call that produced it.
  // Required, not optional: a provenance record that cannot name its own run is
  // the shape of record that let a replayed transcript look legitimate.
  lectureId: string
  providerJobId: string | null
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


// The text the guard reads. Goes through the SAME normalizer the rest of the
// product reads with, rather than reaching for one flat field: the previous
// version read only rawResponse.transcript, so any response shape that put the
// text elsewhere yielded an empty string and the guard silently judged nothing.
// A guard with a silent path is the failure this whole module exists to remove.
function transcriptText(raw: unknown): string {
  const flat = typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>).transcript
    : undefined;
  if (typeof flat === "string" && flat.trim() !== "") return flat;
  return normalizeRawTranscript(raw)?.text ?? "";
}

// Returns the provenance record AND the transcript verdict. They are produced
// together because they are read from the same artefact at the same moment,
// and because a caller that stores one without the other can store a
// transcript nobody has checked -- which is exactly how a foreign transcript
// reached a deployed product once already.
export interface BuiltProvenance {
  provenance: ProcessingProvenance;
  validation: TranscriptValidation;
}

export function buildProvenance(input: BuildInput): BuiltProvenance {
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

  // The check above compares two metadata fields and therefore cannot see the
  // failure it was written for -- the Arabic run reported en-IN, matching its
  // configuration exactly. This one reads the transcript, and takes no
  // configured language at all, deliberately: see transcript-validation.ts.
  const validation = validateTranscript(transcriptText(input.rawResponse));
  if (validation.reason) limitations.push(validation.reason);

  // The engine own language confidence USED to be a guard here. It is not one
  // and never was: live Sarvam batch responses carry no language_probability at
  // all -- it is null on every production call -- so the threshold only ever
  // fired on the captured fixtures, which happen to have it. It cleared the one
  // real failure by 0.183 in any case. The field is still recorded below
  // because it is part of the artefact; it is no longer treated as evidence.
  if (probability === null) {
    limitations.push(
      "The engine reported no language confidence for this run, which is normal for " +
        "its batch API. Language was verified by reading the transcript instead.",
    );
  }

  const provenance: ProcessingProvenance = {
    lectureId: input.lectureId,
    providerJobId: input.providerJobId,
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
    languageProbability: probability,
    configuredLanguage: descriptor.configuredLanguage,
    apiVersion: descriptor.apiVersion,
    limitations,
  };

  return { provenance, validation };
}
