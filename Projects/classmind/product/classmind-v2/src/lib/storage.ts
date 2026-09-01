// Single source of truth for the lecture bucket. Separate from Lab v0's `audio`
// bucket so the research environment and the product never share objects.
export const LECTURE_BUCKET = "lectures";
// 50 MiB is the Supabase Free plan's global ceiling, not a preference -- a
// per-bucket limit cannot exceed it. A 40-minute lecture at 64 kbps mono is
// ~18 MB, which fits comfortably.
export const FILE_SIZE_LIMIT_BYTES = 52_428_800;

// WHAT COUNTS AS AN AUDIO RECORDING.
//
// Two signals, either one sufficient: the browser reports an audio/* type, or
// the filename carries the extension of a format Sarvam's batch API documents
// as decodable (WAV, MP3, AAC, AIFF, OGG, OPUS, FLAC, MP4/M4A, AMR, WMA,
// WebM). The extension path exists because Windows reports many perfectly
// real recordings -- .m4a, .opus and .amr among them -- as
// application/octet-stream or as no type at all, and the previous whitelist
// of seven exact MIME strings refused files the pipeline handles fine.
//
// Raw PCM (.pcm/.raw) is deliberately absent: Sarvam requires an explicit
// input_audio_codec parameter for it, which the transcribe path does not
// send. PCM inside a WAV container works like any other WAV.
export const AUDIO_EXTENSION_MIME: Record<string, string> = {
  mp3: "audio/mpeg", mpga: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4", mp4: "audio/mp4", m4b: "audio/mp4",
  aac: "audio/aac",
  aif: "audio/aiff", aiff: "audio/aiff",
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  flac: "audio/flac",
  amr: "audio/amr",
  wma: "audio/x-ms-wma",
  webm: "audio/webm",
  // audio/3gpp is NOT on Sarvam's allowlist (its 2026-09-02 400 response
  // enumerates the list verbatim). 3GP is an ISO-BMFF (MP4-family) container,
  // and audio/mp4 is allowed, so that is what a .3gp is sent as.
  "3gp": "audio/mp4", "3gpp": "audio/mp4",
};

// Browser-reported types that are genuinely audio but named in a dialect the
// transcription provider refuses. Windows reports .aac as the DLNA type; the
// content is ordinary ADTS/AAC, which Sarvam accepts as audio/aac. Extend only
// from an observed refusal, never speculatively.
const EXOTIC_AUDIO_ALIASES: Record<string, string> = {
  "audio/vnd.dlna.adts": "audio/aac",
};

// For the file input's `accept` attribute: any audio/* type, plus the
// extensions above so files the OS reports without a type stay pickable.
export const AUDIO_ACCEPT = [
  "audio/*",
  ...Object.keys(AUDIO_EXTENSION_MIME).map((ext) => `.${ext}`),
].join(",");

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isAllowedAudio(contentType: string, filename: string): boolean {
  if (contentType.trim().toLowerCase().startsWith("audio/")) return true;
  return extensionOf(filename) in AUDIO_EXTENSION_MIME;
}

// The type that is stored, sent to the bucket, and handed to the
// transcription provider. Always audio/* -- the bucket admits only audio/*,
// so a browser that reported nothing (or application/octet-stream, or
// video/webm for an audio-only recording) gets the canonical type for its
// extension instead of its own guess.
export function canonicalAudioContentType(contentType: string, filename: string): string {
  const reported = contentType.trim().toLowerCase();
  if (reported.startsWith("audio/")) return reported.split(";")[0].trim();
  return AUDIO_EXTENSION_MIME[extensionOf(filename)] ?? "audio/mpeg";
}

export function lectureObjectPath(lectureId: string, filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "bin" : filename.slice(dot + 1);
  return `${lectureId}/original.${ext}`;
}
