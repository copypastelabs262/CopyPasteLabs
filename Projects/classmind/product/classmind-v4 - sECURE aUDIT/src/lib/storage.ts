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

// `Object.hasOwn`, NOT `in` (fixed 2026-09-07, security audit).
//
// AUDIO_EXTENSION_MIME is an object literal, so it inherits Object.prototype --
// and `"constructor" in AUDIO_EXTENSION_MIME` is TRUE. A file named
// `lecture.constructor` therefore passed as a recognised audio format, and
// canonicalAudioContentType below then returned `AUDIO_EXTENSION_MIME["constructor"]`,
// which is the Object CONSTRUCTOR FUNCTION rather than a MIME string. That value
// went on to be stored in lectures.content_type and sent as an outbound HTTP
// header. Same for __proto__, toString, valueOf and hasOwnProperty.
//
// Not a privilege escalation -- the caller is already the course owner -- but it
// is a caller-chosen value reaching a header and a database column through a
// check that was supposed to be a closed vocabulary and was not.
export function isAllowedAudio(contentType: string, filename: string): boolean {
  if (contentType.trim().toLowerCase().startsWith("audio/")) return true;
  return Object.hasOwn(AUDIO_EXTENSION_MIME, extensionOf(filename));
}

// The type that is stored, sent to the bucket, and handed to the
// transcription provider. Always audio/* -- the bucket admits only audio/*.
//
// THE CURATED MAPPING OUTRANKS THE BROWSER'S REPORT. The first version kept
// any reported audio/* verbatim and only consulted the extension map for
// typeless files -- and the first real upload proved that wrong: Windows
// reports .aac as audio/vnd.dlna.adts, a real audio type that Sarvam's
// allowlist refuses, and the stored value rode all the way to a 400 at
// /start. Every value in AUDIO_EXTENSION_MIME is on Sarvam's allowlist, so
// when the extension is recognised its mapping wins; the reported type is
// only trusted when the filename tells us nothing.
// A MIME type, and only something shaped like one, may leave this function.
//
// The stored value is used two ways that both make a loose string dangerous: it
// is written to lectures.content_type, and it is handed to the transcription
// provider as an outbound HTTP HEADER VALUE. The old code returned the browser's
// reported type after `.split(";")[0].trim()`, which strips whitespace only at
// the ENDS -- so an embedded CR/LF survived, and a reported type carrying one
// went straight into a request header. undici rejects
// that at the call, which turns it into an unexplained 500 rather than a real
// header injection -- but a value that can only fail is a value that should
// never have been built. One conservative pattern. (2026-09-07, security audit.)
const MIME_TOKEN = /^audio\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/;

export function canonicalAudioContentType(contentType: string, filename: string): string {
  const ext = extensionOf(filename);
  // hasOwn, not a truthiness test on a bracket read: see isAllowedAudio.
  if (Object.hasOwn(AUDIO_EXTENSION_MIME, ext)) return AUDIO_EXTENSION_MIME[ext];
  const reported = contentType.trim().toLowerCase().split(";")[0].trim();
  if (MIME_TOKEN.test(reported)) {
    return Object.hasOwn(EXOTIC_AUDIO_ALIASES, reported)
      ? EXOTIC_AUDIO_ALIASES[reported]
      : reported;
  }
  // Unrecognised extension AND an unusable reported type. The bucket admits
  // only audio/*, so the fallback has to be one -- and mp3 is what an unknown
  // recording most often is.
  return "audio/mpeg";
}

// THE OBJECT KEY, AND WHY THE EXTENSION IS SANITISED (2026-09-07, security
// audit).
//
// `filename` is whatever the uploader typed -- it arrives as
// `body.originalFilename` on POST /api/courses/{id}/lectures and is used
// verbatim by the caller for the row's display name. It used to be used verbatim
// HERE too: the extension was everything after the last dot, so a file named
//
//     lecture.mp3/../../<another lecture id>/original.mp3
//
// produced the key `<mine>/original.mp3/../../<theirs>/original.mp3`, and the
// signed UPLOAD url minted for that key is handed straight back to the client.
// Whether Supabase Storage collapses the traversal is not the interesting
// question -- the interesting question is why a caller gets to write the key at
// all. It does not any more.
//
// The extension is now taken from the SAME map that decides what counts as
// audio, and falls back to "bin" when the name says nothing recognisable. The
// key is therefore always `<uuid>/original.<one of ~20 known tokens>`, built
// from a server-generated id and a closed vocabulary, with nothing
// caller-controlled left in it.
export function lectureObjectPath(lectureId: string, filename: string): string {
  const ext = extensionOf(filename);
  const safe = Object.hasOwn(AUDIO_EXTENSION_MIME, ext) ? ext : "bin";
  return `${lectureId}/original.${safe}`;
}
