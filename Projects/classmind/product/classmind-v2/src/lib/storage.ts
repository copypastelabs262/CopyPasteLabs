// Single source of truth for the lecture bucket. Separate from Lab v0's `audio`
// bucket so the research environment and the product never share objects.
export const LECTURE_BUCKET = "lectures";
// 50 MiB is the Supabase Free plan's global ceiling, not a preference -- a
// per-bucket limit cannot exceed it. A 40-minute lecture at 64 kbps mono is
// ~18 MB, which fits comfortably.
export const FILE_SIZE_LIMIT_BYTES = 52_428_800;
export const ALLOWED_MIME_TYPES = [
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4",
  "audio/m4a", "audio/webm", "audio/ogg",
] as const;

export function lectureObjectPath(lectureId: string, filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "bin" : filename.slice(dot + 1);
  return `${lectureId}/original.${ext}`;
}
