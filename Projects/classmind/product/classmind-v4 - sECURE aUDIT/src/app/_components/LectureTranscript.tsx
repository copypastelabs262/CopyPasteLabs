"use client";

import { mmss } from "./KnowledgeUnit";

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  charStart: number;
  charEnd: number;
  text: string;
}

// The transcript, read as a document.
//
// A lecture normalizes into several hundred segments, and rendering one row per
// segment produces a wall of timestamped fragments that nobody reads -- it looks
// like a log file, so it gets treated like one. Segments are therefore grouped
// into paragraphs of roughly a breath's worth of speech, with a single timecode
// in the margin, which is how a transcript looks in print.
//
// Every segment keeps its own `seg-<startMs>` anchor inside the paragraph. That
// is what evidence navigation scrolls to and highlights, so grouping changes
// how this READS without changing where a citation lands.

// Long enough that a paragraph is a paragraph, short enough that the margin
// timecodes stay dense enough to navigate by.
const TARGET_CHARS = 420;
const HARD_LIMIT = TARGET_CHARS * 2;
// Devanagari danda included: a Hinglish lecture transcribes with both.
const SENTENCE_END = /[.!?…।॥]["'”’)]*\s*$/;

function toParagraphs(segments: TranscriptSegment[]): TranscriptSegment[][] {
  const out: TranscriptSegment[][] = [];
  let current: TranscriptSegment[] = [];
  let chars = 0;

  for (const s of segments) {
    current.push(s);
    chars += s.text.length + 1;
    const closes = SENTENCE_END.test(s.text.trim());
    // Break on a sentence boundary once the paragraph is long enough, and break
    // regardless once it is far too long -- a speaker who never lands a full
    // stop must not produce one paragraph the length of the lecture.
    if ((chars >= TARGET_CHARS && closes) || chars >= HARD_LIMIT) {
      out.push(current);
      current = [];
      chars = 0;
    }
  }
  if (current.length) out.push(current);
  return out;
}

export default function LectureTranscript({
  segments, highlightMs, onSeek, raw, showRaw,
}: {
  segments: TranscriptSegment[];
  /** The segment start currently being cited, or null. */
  highlightMs: number | null;
  onSeek: (ms: number) => void;
  /** The provider response, shown only when normalization produced nothing. */
  raw?: unknown;
  showRaw?: boolean;
}) {
  if (!segments.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
        <p className="text-[15px] text-ink-soft">
          {raw
            ? "This recording produced a transcript we could not lay out as text."
            : "No transcript for this lecture yet."}
        </p>
        {raw && showRaw ? (
          <details className="mx-auto mt-4 max-w-2xl text-left">
            <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-soft">
              Provider response
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded-xl border border-line p-4 text-[11px] leading-relaxed">
              {JSON.stringify(raw, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    );
  }

  const paragraphs = toParagraphs(segments);

  return (
    <div className="space-y-7">
      {paragraphs.map((para) => {
        const start = para[0].startMs;
        return (
          <div
            key={`para-${start}`}
            className="sm:grid sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-6"
          >
            <button
              type="button"
              onClick={() => onSeek(start)}
              title="Play from here"
              className="mb-1 font-mono text-[11px] tabular-nums text-ink-faint transition-colors hover:text-ink sm:mb-0 sm:pt-1.5 sm:text-right"
            >
              {mmss(start)}
            </button>
            <p className="max-w-[68ch] text-[16px] leading-8 text-ink sm:text-[17px]">
              {para.map((s, i) => (
                <span
                  key={`${s.startMs}-${i}`}
                  id={`seg-${s.startMs}`}
                  // `cm-flash` is the shared highlight; the tinted background is
                  // its floor, so a cited line is visibly the cited line even
                  // before the animation is defined.
                  className={
                    highlightMs === s.startMs
                      ? "cm-flash rounded bg-warn-soft px-0.5 py-0.5 "
                      : undefined
                  }
                >
                  {s.text}{" "}
                </span>
              ))}
            </p>
          </div>
        );
      })}
    </div>
  );
}
