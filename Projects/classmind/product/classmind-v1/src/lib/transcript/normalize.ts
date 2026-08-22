import type { NormalizedTranscript, TranscriptSegment } from "@/lib/transcript/types";

// Derives a readable transcript from the provider's raw response at READ time.
// Nothing here is persisted: the raw response stays the artefact and this is
// re-derivable from it, which is why the poll route deliberately does not
// normalize. If this function is wrong, fix it and reload -- no re-run.
//
// One shape is now confirmed against live Sarvam batch jobs (see the note on
// fromChunkArrays); the rest are not. Every shape below is still attempted in
// turn and an unrecognised response returns null rather than a
// confident-looking empty transcript. The UI shows the raw JSON in that case,
// which is the honest failure mode.

// Everything a shape parser can know. The character offsets are assigned
// later, by joinWithOffsets, because they only exist relative to the joined
// text -- a parser working one segment at a time cannot know them.
type DraftSegment = Omit<TranscriptSegment, "charStart" | "charEnd">;

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
function fromEntryArray(entries: unknown): DraftSegment[] | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const out: DraftSegment[] = [];
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

// Shape B: parallel text / start / end arrays under `timestamps`.
//
// The field is called `words`, and it was originally read as words. It is
// not. With with_diarization false, Sarvam returns diarized_transcript: null
// and fills timestamps.words with whole sentences or clauses -- measured
// across live runs at roughly 15s per element, 32s at the longest. The
// grouping below therefore almost always flushes after a single element, so
// one Sarvam chunk becomes one segment and the timing stays as fine-grained
// as the response allows.
//
// The grouping is kept anyway, because the field name is the only thing
// Sarvam promises: if a future model or a diarized job really does return
// words, one marker per word would be unreadable prose and would also amount
// to pre-cutting the transcript on ASR boundaries.
const GROUP_MS = 12_000;
const SENTENCE_END = /[.!?।]$/; // includes danda

// An element lasting this long is not a word, whatever the field is called.
// Sarvam's chunks average ~15s; no spoken word comes close.
//
// This exists because translit output does not reliably punctuate. Requiring
// a full stop before closing a group -- correct when grouping words -- makes
// an unpunctuated chunk swallow the next one and hold until the hard cap, so
// a response that punctuates half its chunks silently loses half its timing
// resolution. An element long enough to be a chunk is allowed to close its
// own group; the sentence rule still governs everything shorter.
const CHUNK_MS = 5_000;

function fromChunkArrays(timestamps: unknown): DraftSegment[] | null {
  const rec = asRecord(timestamps);
  if (!rec) return null;
  const chunks = rec.words;
  const starts = rec.start_time_seconds;
  const ends = rec.end_time_seconds;
  if (!Array.isArray(chunks) || chunks.length === 0) return null;
  if (!Array.isArray(starts)) return null;

  const out: DraftSegment[] = [];
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

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (typeof chunk !== "string") continue;
    const startMs = secondsToMs(starts[i]) ?? groupEnd;
    const endMs =
      (Array.isArray(ends) ? secondsToMs(ends[i]) : null) ?? startMs;
    if (groupStart === null) groupStart = startMs;
    buffer.push(chunk);
    groupEnd = endMs;
    if (endMs - groupStart >= GROUP_MS && SENTENCE_END.test(chunk)) flush();
    else if (endMs - groupStart >= GROUP_MS * 2) flush();
  }
  flush();

  return out.length > 0 ? out : null;
}

// Builds the joined prose and each segment's offsets in one pass, so the two
// cannot disagree. Doing it in two passes -- join, then search for each
// segment's text -- would break the moment a lecturer repeats a sentence.
function joinWithOffsets(drafts: DraftSegment[]): NormalizedTranscript {
  const parts: string[] = [];
  const segments: TranscriptSegment[] = [];
  let cursor = 0;

  for (const draft of drafts) {
    // Leading space for every segment but the first: identical to joining the
    // rendered segments with " ", which is what this replaces.
    const prefix =
      (parts.length === 0 ? "" : " ") + formatMarker(draft.startMs) + " ";
    parts.push(prefix + draft.text);
    const charStart = cursor + prefix.length;
    cursor = charStart + draft.text.length;
    segments.push({ ...draft, charStart, charEnd: cursor });
  }

  return { text: parts.join(""), segments };
}

export function normalizeRawTranscript(raw: unknown): NormalizedTranscript | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const diarized = asRecord(rec.diarized_transcript);
  const drafts =
    fromEntryArray(diarized?.entries) ??
    fromEntryArray(rec.segments) ??
    fromEntryArray(rec.chunks) ??
    fromChunkArrays(rec.timestamps) ??
    // Last resort: a bare transcript string. Readable, but with no timing,
    // so it carries a single 00:00 marker rather than faking positions.
    (typeof rec.transcript === "string" && rec.transcript.trim() !== ""
      ? [{ startMs: 0, endMs: 0, text: rec.transcript.trim() }]
      : null);

  if (!drafts) return null;

  // Continuous prose with inline [mm:ss] markers. Deliberately NOT pre-cut
  // rows -- pre-segmented rows would make a reader anchor on ASR boundaries
  // instead of on meaning. The segments come back alongside it so extracted
  // items can still be mapped to a timestamp; see TranscriptSegment.charStart.
  return joinWithOffsets(drafts);
}
