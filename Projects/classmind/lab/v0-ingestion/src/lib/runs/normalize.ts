import type { NormalizedTranscript, TranscriptSegment } from "./types";

// Derives a readable transcript from the provider's raw response at READ time.
// Nothing here is persisted: raw_transcription_response stays the artefact and
// this is re-derivable from it, which is why poll/route.ts deliberately does
// not normalize. If this function is wrong, fix it and reload -- no re-run.
//
// Sarvam's exact output shape for a batch job is NOT yet verified against a
// live call, so every shape below is attempted in turn and an unrecognised
// response returns null rather than a confident-looking empty transcript. The
// UI shows the raw JSON in that case, which is the honest failure mode.

export function formatMarker(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}]`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function secondsToMs(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 1000) : null;
}

// Shape A / C: an array of objects each carrying text and a start time.
function fromEntryArray(entries: unknown): TranscriptSegment[] | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const out: TranscriptSegment[] = [];
  for (const item of entries) {
    const rec = asRecord(item);
    if (!rec) continue;
    const text = rec.transcript ?? rec.text;
    if (typeof text !== "string" || text.trim() === "") continue;
    const startMs =
      secondsToMs(rec.start_time_seconds) ?? secondsToMs(rec.start) ?? 0;
    const endMs =
      secondsToMs(rec.end_time_seconds) ?? secondsToMs(rec.end) ?? startMs;
    out.push({ startMs, endMs, text: text.trim() });
  }
  return out.length > 0 ? out : null;
}

// Shape B: parallel word / start / end arrays. Words are grouped so a marker
// lands roughly every GROUP_MS or at a sentence end -- never one per word,
// which would be unreadable and would also amount to pre-cutting the text.
const GROUP_MS = 12_000;
const SENTENCE_END = /[.!?\u0964]$/; // includes danda

function fromWordArrays(timestamps: unknown): TranscriptSegment[] | null {
  const rec = asRecord(timestamps);
  if (!rec) return null;
  const words = rec.words;
  const starts = rec.start_time_seconds;
  const ends = rec.end_time_seconds;
  if (!Array.isArray(words) || words.length === 0) return null;
  if (!Array.isArray(starts)) return null;

  const out: TranscriptSegment[] = [];
  let buffer: string[] = [];
  let groupStart: number | null = null;
  let groupEnd = 0;

  const flush = () => {
    if (buffer.length === 0 || groupStart === null) return;
    out.push({
      startMs: groupStart,
      endMs: groupEnd,
      text: buffer.join(" ").trim(),
    });
    buffer = [];
    groupStart = null;
  };

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (typeof word !== "string") continue;
    const startMs = secondsToMs(starts[i]) ?? groupEnd;
    const endMs =
      (Array.isArray(ends) ? secondsToMs(ends[i]) : null) ?? startMs;
    if (groupStart === null) groupStart = startMs;
    buffer.push(word);
    groupEnd = endMs;
    if (endMs - groupStart >= GROUP_MS && SENTENCE_END.test(word)) flush();
    else if (endMs - groupStart >= GROUP_MS * 2) flush();
  }
  flush();

  return out.length > 0 ? out : null;
}

export function normalizeRawTranscript(raw: unknown): NormalizedTranscript | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const diarized = asRecord(rec.diarized_transcript);
  const segments =
    fromEntryArray(diarized?.entries) ??
    fromEntryArray(rec.segments) ??
    fromEntryArray(rec.chunks) ??
    fromWordArrays(rec.timestamps) ??
    // Last resort: a bare transcript string. Readable, but with no timing,
    // so it carries a single 00:00 marker rather than faking positions.
    (typeof rec.transcript === "string" && rec.transcript.trim() !== ""
      ? [{ startMs: 0, endMs: 0, text: rec.transcript.trim() }]
      : null);

  if (!segments) return null;

  // Continuous prose with inline [mm:ss] markers. Deliberately NOT pre-cut
  // rows -- v0-ingestion/README.md: pre-segmented rows would make annotators
  // anchor on ASR boundaries and corrupt the walkthrough's boundary measure.
  const text = segments
    .map((s) => `${formatMarker(s.startMs)} ${s.text}`)
    .join(" ");

  return { text, segments };
}
