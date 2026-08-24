"use client";

import Link from "next/link";
import { mmss } from "./KnowledgePanel";

// LAYER 3 as the client sees it.
//
// One reconstructed idea — not one interesting sentence. An assignment
// assembled from four spoken fragments is a single unit carrying four evidence
// spans, which is why every part below is written to render N spans rather
// than the one span a candidate had.
//
// Declared here rather than imported from `src/lib/knowledge/read.ts`: that
// module is `server-only`, so pulling its types into a client component would
// drag the service-role Supabase client into the browser bundle.
export interface Evidence {
  role: string | null;
  startMs: number;
  endMs: number;
  quote: string;
  lectureId: string;
}

export interface KnowledgeUnit {
  id: string;
  lectureId: string;
  lectureTitle: string;
  courseId: string;
  category: "teaching" | "actionable" | "reference";
  kind: string;
  title: string;
  summary: string;
  steps: string[];
  unspecified: string[];
  status: "auto" | "pending" | "confirmed" | "rejected";
  confidence: number | null;
  evidence: Evidence[];
}

// The kinds the reconstruction pass is allowed to emit, in faculty words.
// A kind this map has not learned yet still renders — as itself — because the
// reasoning layer is expected to grow vocabulary faster than the UI does.
export const UNIT_KIND_LABEL: Record<string, string> = {
  assignment: "Assignment",
  deadline: "Deadline",
  exam_instruction: "Exam instruction",
  announcement: "Announcement",
  topic: "Topic",
  concept: "Concept",
  comparison: "Comparison",
  procedure: "Procedure",
  example: "Example",
  reference: "Reference",
};

export function KindBadge({ kind }: { kind: string }) {
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {UNIT_KIND_LABEL[kind] ?? kind}
    </span>
  );
}

// Summary, then steps, then the gaps.
//
// `unspecified` is rendered as loudly as the content is. It is the one field a
// summariser would silently drop, and "no submission date was given" is the
// difference between a student planning their week and a student guessing.
// Structurally typed rather than taking a whole unit: the ask route returns
// sources that carry no `courseId` or `confidence`, and widening this to the
// four fields it actually reads lets one renderer serve both.
export function UnitBody({
  unit,
}: {
  unit: Pick<KnowledgeUnit, "id" | "summary" | "steps" | "unspecified">;
}) {
  return (
    <>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{unit.summary}</p>

      {unit.steps.length ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          {unit.steps.map((s, i) => <li key={`${unit.id}-step-${i}`}>{s}</li>)}
        </ol>
      ) : null}

      {unit.unspecified.length ? (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Not specified by the lecturer</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {unit.unspecified.map((u, i) => <li key={`${unit.id}-gap-${i}`}>{u}</li>)}
          </ul>
        </div>
      ) : null}
    </>
  );
}

// Every span, every time.
//
// A unit built from three sentences shows three timestamps, because collapsing
// them to "first mentioned at 04:12" hides the fact that the deadline came from
// somewhere other than the task description. Each one is verbatim transcript
// text, verified against the transcript before storage.
//
// Two ways to reach the moment, because the caller decides which is possible:
// on the lecture page the <audio> element is on screen, so `onSeek` moves it
// in place; on a course page there is nothing to seek, so `courseId` turns each
// span into a deep link that opens the lecture at that millisecond.
export function EvidenceSpans({
  evidence, onSeek, courseId,
}: {
  evidence: Evidence[];
  onSeek?: (ms: number) => void;
  courseId?: string;
}) {
  if (!evidence.length) {
    return (
      <p className="mt-2 text-xs text-zinc-400">
        No evidence span stored for this item.
      </p>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">
        Evidence &mdash; what was actually said
        <span className="ml-2 text-zinc-400">
          {evidence.length} {evidence.length === 1 ? "span" : "spans"}
        </span>
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {evidence.map((e, i) => (
          <li key={`${e.lectureId}-${e.startMs}-${i}`} className="flex items-baseline gap-2 text-sm">
            {onSeek ? (
              <button
                onClick={() => onSeek(e.startMs)}
                className="shrink-0 font-mono text-xs text-zinc-500 hover:underline"
                title="Jump to this moment in the recording"
              >
                [{mmss(e.startMs)}]
              </button>
            ) : courseId ? (
              <Link
                href={`/courses/${courseId}/lectures/${e.lectureId}?t=${e.startMs}`}
                className="shrink-0 font-mono text-xs text-zinc-500 hover:underline"
                title="Open the lecture at this moment"
              >
                [{mmss(e.startMs)}]
              </Link>
            ) : (
              <span className="shrink-0 font-mono text-xs text-zinc-400">[{mmss(e.startMs)}]</span>
            )}
            <span className="italic text-zinc-700 dark:text-zinc-300">&ldquo;{e.quote}&rdquo;</span>
            {/* The role says what this span contributed — which fragment was
                the requirement and which was the deadline. Without it a
                multi-span item reads as one quote broken into pieces. */}
            {e.role ? (
              <span className="shrink-0 text-xs text-zinc-400">{e.role}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
