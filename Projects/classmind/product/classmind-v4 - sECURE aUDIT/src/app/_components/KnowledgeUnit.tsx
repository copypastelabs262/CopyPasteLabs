"use client";

import Link from "next/link";
import { AlertIcon, PlayIcon } from "./ui/icons";
import { Card, cx } from "./ui";

// One reconstructed idea, as a student reads it.
//
// Not one interesting sentence: an assignment assembled from four spoken
// fragments is a single unit carrying four evidence spans, which is why every
// part below renders N spans rather than the one span a candidate had.
//
// The types are declared here rather than imported from `src/lib/knowledge/read.ts`
// because that module is `server-only` -- importing its types into a client
// component would drag the service-role Supabase client into the browser bundle.

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

// A timecode a person can say out loud. Hours appear only when the recording is
// long enough to have them -- "01:04" for a four-minute mark would be a lie
// about the length of the lecture.
export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// The kinds the reconstruction pass is allowed to emit, in the words a student
// would use. A kind this map has not learned yet still renders -- the reasoning
// layer grows vocabulary faster than the UI does, and an unknown kind must
// appear as itself rather than vanish.
export const UNIT_KIND_LABEL: Record<string, string> = {
  assignment: "Assignment",
  deadline: "Deadline",
  exam_instruction: "Exam instruction",
  exam_scope: "Exam scope",
  announcement: "Announcement",
  topic: "Topic",
  lesson_scope: "Lesson scope",
  concept: "Concept",
  definition: "Concept",
  comparison: "Comparison",
  enumeration: "Breakdown",
  procedure: "How to",
  example: "Example",
  guidance: "Advice",
  reference: "Mentioned",
};

export function kindLabel(kind: string): string {
  const known = UNIT_KIND_LABEL[kind];
  if (known) return known;
  const words = kind.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Where a click on a timecode should go.
//
// Two possibilities, and only the caller knows which is available: on the
// lecture page the recording is on screen, so a span from THAT lecture moves
// the player in place; anywhere else -- a course page, or a span cited from a
// different lecture -- it becomes a deep link that opens the lecture at that
// millisecond. Getting this wrong is what makes a citation feel broken, so the
// decision is made per span rather than per panel.
export interface EvidenceNav {
  courseId?: string;
  lectureId?: string;
  onSeek?: (ms: number) => void;
}

function canSeekHere(nav: EvidenceNav | undefined, e: Evidence): boolean {
  return Boolean(nav?.onSeek && nav.lectureId && nav.lectureId === e.lectureId);
}

// ---------------------------------------------------------------- timecodes

// Sized for a thumb, not for a mouse: this is the control a student presses
// most, and on a phone it is often the only thing they press.
const TIMECODE_CLASS = cx(
  "inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-1",
  "font-mono text-[11px] tabular-nums text-ink-soft transition-colors",
  "hover:border-ink-faint hover:text-ink",
);

// One clickable moment. Rendered as a button when the player is on screen and
// as a link when it is not, so the affordance always matches what will happen.
export function Timecode({
  ms, evidence, nav, label,
}: {
  ms: number;
  evidence: Evidence;
  nav?: EvidenceNav;
  label?: string;
}) {
  const text = label ?? mmss(ms);
  if (canSeekHere(nav, evidence)) {
    return (
      <button
        type="button"
        onClick={() => nav?.onSeek?.(ms)}
        className={TIMECODE_CLASS}
        title="Play this moment"
      >
        <PlayIcon size={11} />
        {text}
      </button>
    );
  }
  if (nav?.courseId) {
    return (
      <Link
        href={`/courses/${nav.courseId}/lectures/${evidence.lectureId}?t=${ms}`}
        className={TIMECODE_CLASS}
        title="Open the lecture at this moment"
      >
        <PlayIcon size={11} />
        {text}
      </Link>
    );
  }
  return <span className={`${TIMECODE_CLASS} hover:border-line`}>{text}</span>;
}

// ---------------------------------------------------------------- evidence

// Every span, every time.
//
// A unit built from three sentences shows three moments, because collapsing
// them to "first mentioned at 04:12" hides that the deadline came from
// somewhere other than the task description. Each quote is verbatim transcript
// text, checked against the transcript before it was stored.
export function EvidenceList({
  evidence, nav, heading = "From the lecture",
}: {
  evidence: Evidence[];
  nav?: EvidenceNav;
  heading?: string;
}) {
  if (!evidence.length) return null;
  return (
    <div className="mt-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">{heading}</p>
      <ul className="mt-2 space-y-2 border-l border-line pl-4">
        {evidence.map((e, i) => (
          <li
            key={`${e.lectureId}-${e.startMs}-${i}`}
            className="flex flex-wrap items-start gap-x-2.5 gap-y-1"
          >
            <span className="mt-0.5">
              <Timecode ms={e.startMs} evidence={e} nav={nav} />
            </span>
            <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-soft">
              &ldquo;{e.quote}&rdquo;
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A single compact line of moments, for units where the quotes would be noise
// but the ability to hear them still matters.
export function EvidenceTrail({ evidence, nav }: { evidence: Evidence[]; nav?: EvidenceNav }) {
  if (!evidence.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {evidence.slice(0, 4).map((e, i) => (
        <Timecode key={`${e.lectureId}-${e.startMs}-${i}`} ms={e.startMs} evidence={e} nav={nav} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- gaps

// What the lecturer did not say, stated as plainly as what they did.
//
// This is the one field a summariser silently drops, and "no submission date
// was given" is the difference between a student planning their week and a
// student guessing. Styled as information, not as an error: a calm rule and a
// muted amber, never a red alarm about something nobody did wrong.
export function NotSpecified({ items, id }: { items: string[]; id: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-5 border-l-2 border-warn pl-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-warn">
        <AlertIcon size={13} />
        Not specified
      </p>
      <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-ink-soft">
        {items.map((u, i) => (
          <li key={`${id}-gap-${i}`}>{u}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- steps

export function Steps({ steps, id }: { steps: string[]; id: string }) {
  if (!steps.length) return null;
  return (
    <ol className="mt-5 space-y-3">
      {steps.map((s, i) => (
        <li key={`${id}-step-${i}`} className="flex gap-3.5">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[11px] tabular-nums text-ink-soft"
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <span className="text-[15px] leading-relaxed text-ink">{s}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- units

// The strongest treatment on the page, deliberately.
//
// An assignment is the one thing here with a consequence attached, and it has
// to answer four questions without the reader clicking anything: what do I have
// to do, in what order, what was left open, and where in the lecture it was
// said.
export function AssignmentCard({
  unit, nav, showLecture,
}: {
  unit: KnowledgeUnit;
  nav?: EvidenceNav;
  showLecture?: boolean;
}) {
  return (
    <Card className="shadow-soft">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-accent-ink">
          {kindLabel(unit.kind)}
        </span>
        {showLecture ? (
          <span className="text-xs text-ink-faint">{unit.lectureTitle}</span>
        ) : null}
      </div>

      <h3 className="mt-3 text-xl font-semibold leading-snug tracking-tight text-ink sm:text-2xl">
        {unit.title}
      </h3>

      {unit.summary ? (
        <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft sm:text-base">
          {unit.summary}
        </p>
      ) : null}

      <Steps steps={unit.steps} id={unit.id} />
      <NotSpecified items={unit.unspecified} id={unit.id} />
      <EvidenceList evidence={unit.evidence} nav={nav} />
    </Card>
  );
}

// A taught idea, read as prose rather than as a record. No card: forty concepts
// rendered as forty identical boxes is a database table with rounded corners.
export function ConceptBlock({ unit, nav }: { unit: KnowledgeUnit; nav?: EvidenceNav }) {
  return (
    <div className="max-w-[68ch]">
      <h4 className="text-[17px] font-semibold leading-snug tracking-tight text-ink">
        {unit.title}
      </h4>
      {unit.summary ? (
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
          {unit.summary}
        </p>
      ) : null}
      {unit.steps.length ? (
        <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-ink-soft">
          {unit.steps.map((s, i) => (
            <li key={`${unit.id}-point-${i}`} className="flex gap-3">
              <span className="mt-[0.62rem] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <NotSpecified items={unit.unspecified} id={unit.id} />
      <EvidenceTrail evidence={unit.evidence} nav={nav} />
    </div>
  );
}

// "Element manager vs Unified manager" is two things held against each other,
// and the title already says so. Splitting it makes the shape of the idea
// visible before a word of the summary is read.
const VERSUS = /^(.{2,60}?)\s+(?:vs\.?|versus)\s+(.{2,60})$/i;

export function ComparisonBlock({ unit, nav }: { unit: KnowledgeUnit; nav?: EvidenceNav }) {
  const parts = VERSUS.exec(unit.title.trim());
  return (
    <div className="max-w-[68ch]">
      {parts ? (
        <h4 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[17px] font-semibold leading-snug tracking-tight text-ink">
          <span>{parts[1]}</span>
          <span className="font-mono text-[11px] font-normal uppercase tracking-[0.16em] text-ink-faint">
            vs
          </span>
          <span>{parts[2]}</span>
        </h4>
      ) : (
        <h4 className="text-[17px] font-semibold leading-snug tracking-tight text-ink">
          {unit.title}
        </h4>
      )}
      {unit.summary ? (
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
          {unit.summary}
        </p>
      ) : null}
      {unit.steps.length ? (
        <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-ink-soft">
          {unit.steps.map((s, i) => (
            <li key={`${unit.id}-diff-${i}`} className="flex gap-3">
              <span className="mt-[0.62rem] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <EvidenceTrail evidence={unit.evidence} nav={nav} />
    </div>
  );
}

// A topic is a name and, at most, a line. A list of names is the fastest way to
// answer "was this the lecture I missed?", and anything more turns the list
// into reading.
export function TopicRow({
  unit, nav, showLecture,
}: {
  unit: KnowledgeUnit;
  nav?: EvidenceNav;
  showLecture?: boolean;
}) {
  const first = unit.evidence[0];
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
      {first ? (
        <span className="order-last sm:order-first">
          <Timecode ms={first.startMs} evidence={first} nav={nav} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug text-ink">
          {unit.title}
        </p>
        {unit.summary ? (
          <p className="mt-0.5 text-[14px] leading-relaxed text-ink-soft">
            {unit.summary}
          </p>
        ) : null}
        {showLecture ? (
          <p className="mt-1 text-xs text-ink-faint">{unit.lectureTitle}</p>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- faculty compatibility
//
// The three renderers below are what the faculty review surface consumes. They
// are kept as their own exports, at the same names and signatures, so that the
// student rework above does not reach across into a component another surface
// owns.

export function KindBadge({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft">
      {kindLabel(kind)}
    </span>
  );
}

export function UnitBody({
  unit,
}: {
  unit: Pick<KnowledgeUnit, "id" | "summary" | "steps" | "unspecified">;
}) {
  return (
    <>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
        {unit.summary}
      </p>
      <Steps steps={unit.steps} id={unit.id} />
      <NotSpecified items={unit.unspecified} id={unit.id} />
    </>
  );
}

export function EvidenceSpans({
  evidence, onSeek, courseId,
}: {
  evidence: Evidence[];
  onSeek?: (ms: number) => void;
  courseId?: string;
}) {
  if (!evidence.length) {
    return <p className="mt-3 text-xs text-ink-faint">No evidence span stored for this item.</p>;
  }
  // `lectureId` is taken from the spans themselves: this signature predates the
  // nav object and callers do not pass one, but every span already knows which
  // lecture it came from, and on the lecture page they all came from this one.
  const nav: EvidenceNav = { onSeek, courseId, lectureId: onSeek ? evidence[0]?.lectureId : undefined };
  return <EvidenceList evidence={evidence} nav={nav} heading="What was actually said" />;
}
