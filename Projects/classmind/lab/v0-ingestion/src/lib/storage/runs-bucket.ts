// Single source of truth for the audio bucket's name and constraints.
// setup-storage.mts uses these to provision the bucket; the /api/runs
// route uses the same constants to reject bad requests before minting a
// signed upload URL, rather than letting a doomed upload discover the
// bucket's own limits after the fact.
export const AUDIO_BUCKET = "audio";
export const FILE_SIZE_LIMIT_BYTES = 524_288_000; // 500 MiB
export const ALLOWED_MIME_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/webm",
  "audio/ogg",
] as const;

export function buildAudioObjectPath(runId: string, originalFilename: string): string {
  const dot = originalFilename.lastIndexOf(".");
  const ext = dot === -1 ? "bin" : originalFilename.slice(dot + 1);
  // Relative to the bucket -- Supabase's client scopes to AUDIO_BUCKET via
  // .from(), so this must not repeat the bucket name as a path prefix.
  return `${runId}/original.${ext}`;
}
