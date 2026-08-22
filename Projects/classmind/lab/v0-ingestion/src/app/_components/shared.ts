import type { NormalizedTranscript } from "@/lib/runs/types";
import type { ProcessingProvenance } from "@/types/provenance";

// One run, fully loaded -- what GET /api/runs/[id] returns.
export interface RunView {
  runId: string;
  status: string;
  originalFilename: string;
  fileSizeBytes: number;
  contentType: string;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  providerStatus: string | null;
  provenance: ProcessingProvenance | null;
  transcript: NormalizedTranscript | null;
  rawTranscriptionResponse: unknown;
}

// One row in the library -- what GET /api/runs returns. Metadata only; no
// transcript, so listing stays cheap however long the transcripts are.
export interface RunSummary {
  runId: string;
  status: string;
  originalFilename: string;
  fileSizeBytes: number;
  createdAt: string;
  completedAt: string | null;
  providerStatus: string | null;
  detectedLanguage: string | null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}
