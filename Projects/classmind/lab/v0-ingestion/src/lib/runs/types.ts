import type { ProcessingProvenance } from "@/types/provenance";

export type RunStatus =
  | "pending_upload"
  | "uploaded"
  // A provider job is in flight. provider_job_id is what makes this
  // resumable across a refresh or restart -- see the migration's comment.
  | "transcribing"
  | "completed"
  | "failed";

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface NormalizedTranscript {
  // Continuous prose with inline [mm:ss] markers -- the default read.
  // Never served as pre-cut per-segment rows (v0-ingestion/README.md).
  text: string;
  segments: TranscriptSegment[];
}

export interface Run {
  id: string;
  createdAt: string;
  completedAt: string | null;
  status: RunStatus;
  originalFilename: string;
  storagePath: string;
  fileSizeBytes: number;
  contentType: string;
  checksumSha256: string | null;
  errorMessage: string | null;
  providerJobId: string | null;
  // Debug/audit only -- never branched on. See migration comment on this column.
  providerStatus: string | null;
  rawTranscriptionResponse: unknown | null;
  transcriptNormalized: NormalizedTranscript | null;
  provenance: ProcessingProvenance | null;
}

// DB rows are snake_case (Postgres convention); the app uses camelCase.
export function runFromRow(row: Record<string, unknown>): Run {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
    status: row.status as RunStatus,
    originalFilename: row.original_filename as string,
    storagePath: row.storage_path as string,
    fileSizeBytes: Number(row.file_size_bytes),
    contentType: row.content_type as string,
    checksumSha256: (row.checksum_sha256 as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    providerJobId: (row.provider_job_id as string | null) ?? null,
    providerStatus: (row.provider_status as string | null) ?? null,
    rawTranscriptionResponse: row.raw_transcription_response ?? null,
    transcriptNormalized:
      (row.transcript_normalized as NormalizedTranscript | null) ?? null,
    provenance: (row.provenance as ProcessingProvenance | null) ?? null,
  };
}
