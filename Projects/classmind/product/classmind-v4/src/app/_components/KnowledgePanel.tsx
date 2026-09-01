"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AskPanel from "./AskPanel";
import { KIND_LABEL } from "./Input";
import { EmptyState, Skeleton, Spinner } from "./ui";
import { AlertIcon, BookIcon } from "./ui/icons";
import {
  AssignmentCard,
  ComparisonBlock,
  ConceptBlock,
  TopicRow,
  mmss,
  type EvidenceNav,
  type KnowledgeUnit,
} from "./KnowledgeUnit";

// What a lecture left behind, arranged the way a student would ask for it.
//
// The old panel rendered every unit as the same card in one flat list, which
// made a thirty-item lecture read as thirty equally important things. It is not
// thirty equally important things: one of them is an assignment with a
// consequence, twenty are the shape of what was taught, and the rest is what
// the lecturer mentioned in passing. The grouping below is that judgement made
// visible, and each group gets the treatment its content deserves rather than
// the treatment a generic renderer can give all of them.

export { mmss };

// ---------------------------------------------------------------- grouping

type GroupId = "actionable" | "topics" | "concepts" | "comparisons" | "reference";

interface Group {
  id: GroupId;
  label: string;
  /** Said only where the label alone would not carry it. */
  hint?: string;
  units: KnowledgeUnit[];
}

const CONCEPT_KINDS = new Set(["concept", "definition", "procedure", "example", "enumeration", "guidance"]);
const TOPIC_KINDS = new Set(["topic", "lesson_scope"]);

// First match wins, then everything unclaimed falls through on its category.
// A kind the reasoning layer grows tomorrow therefore still appears, in the
// group its category implies, rather than being silently dropped -- which is
// what a hard-coded kind list would do the first time the vocabulary moved.
function classify(u: KnowledgeUnit): GroupId {
  if (u.category === "actionable") return "actionable";
  if (u.kind === "comparison") return "comparisons";
  if (TOPIC_KINDS.has(u.kind)) return "topics";
  if (CONCEPT_KINDS.has(u.kind)) return "concepts";
  return u.category === "reference" ? "reference" : "concepts";
}

// Order is the reading order of a student's questions: what do I owe, what was
// this lecture about, what do I actually have to understand, what was held
// against what, and finally what was only touched on.
const GROUP_ORDER: { id: GroupId; label: string; hint?: string }[] = [
  { id: "actionable", label: "What you have to do" },
  { id: "topics", label: "Topics covered" },
  { id: "concepts", label: "Key concepts" },
  { id: "comparisons", label: "Comparisons" },
  { id: "reference", label: "Mentioned in passing" },
];

export function groupUnits(units: KnowledgeUnit[]): Group[] {
  const buckets = new Map<GroupId, KnowledgeUnit[]>();
  for (const u of units) {
    const id = classify(u);
    const existing = buckets.get(id);
    if (existing) existing.push(u);
    else buckets.set(id, [u]);
  }
  // A group with nothing in it is not rendered as an empty group -- it is not
  // rendered at all. Not every lecture contains a comparison, and a heading
  // over "None" tells a student the software expected something it did not get.
  return GROUP_ORDER.flatMap((g) => {
    const found = buckets.get(g.id);
    return found?.length ? [{ ...g, units: found }] : [];
  });
}

export function actionableUnits(units: KnowledgeUnit[]): KnowledgeUnit[] {
  return units.filter((u) => u.category === "actionable");
}

export function topicUnits(units: KnowledgeUnit[]): KnowledgeUnit[] {
  return units.filter((u) => TOPIC_KINDS.has(u.kind));
}

// ---------------------------------------------------------------- rendering

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">{label}</h3>
      <span className="font-mono text-[11px] tabular-nums text-ink-faint">
        {count}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  );
}

function GroupBody({
  group, nav, showLecture,
}: {
  group: Group;
  nav?: EvidenceNav;
  showLecture?: boolean;
}) {
  switch (group.id) {
    // The only group that gets a card each. Cards are for things you act on;
    // using them for everything is what made the old panel read as a table.
    case "actionable":
      return (
        <div className="mt-4 space-y-4">
          {group.units.map((u) => (
            <AssignmentCard key={u.id} unit={u} nav={nav} showLecture={showLecture} />
          ))}
        </div>
      );

    case "topics":
      return (
        <ul className="mt-2 divide-y divide-line">
          {group.units.map((u) => (
            <TopicRow key={u.id} unit={u} nav={nav} showLecture={showLecture} />
          ))}
        </ul>
      );

    case "comparisons":
      return (
        <div className="mt-5 space-y-8">
          {group.units.map((u) => (
            <ComparisonBlock key={u.id} unit={u} nav={nav} />
          ))}
        </div>
      );

    // Concepts and passing mentions are prose, spaced apart. The only
    // difference is weight: a passing mention is set quieter and tighter,
    // because it is genuinely less important and should read that way.
    case "reference":
      return (
        <div className="mt-4 space-y-5 opacity-80">
          {group.units.map((u) => (
            <ConceptBlock key={u.id} unit={u} nav={nav} />
          ))}
        </div>
      );

    default:
      return (
        <div className="mt-5 space-y-8">
          {group.units.map((u) => (
            <ConceptBlock key={u.id} unit={u} nav={nav} />
          ))}
        </div>
      );
  }
}

// The grouped knowledge itself, with no heading, states or chrome of its own so
// that a caller can place it under whatever heading its page needs.
export function KnowledgeGroups({
  units, nav, showLecture,
}: {
  units: KnowledgeUnit[];
  nav?: EvidenceNav;
  showLecture?: boolean;
}) {
  const groups = groupUnits(units);
  if (!groups.length) return null;
  return (
    <div className="space-y-12">
      {groups.map((g) => (
        <section key={g.id}>
          <GroupHeading label={g.label} count={g.units.length} />
          <GroupBody group={g} nav={nav} showLecture={showLecture} />
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- states

// Shaped like what is coming -- a heading, a card, then prose -- so the page
// does not jump when the knowledge lands.
function LoadingKnowledge() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-3 w-full max-w-lg" />
      <Skeleton className="h-3 w-full max-w-md" />
    </div>
  );
}

// The wait has to be described in terms of what the product is doing FOR the
// reader, not in terms of the job that is running. "extracting" and a provider
// status are true and useless; this is what the truth is for.
export function StillWorking({ children }: { children?: React.ReactNode }) {
  return (
    <EmptyState
      icon={<Spinner size={18} />}
      title="Understanding the lecture"
      description={
        children ??
        "Connecting concepts and identifying the information that matters. This page will have it shortly."
      }
    />
  );
}

// One lecture's knowledge, with the states around it.
export function LectureKnowledge({
  units, loading, error, nav,
}: {
  units: KnowledgeUnit[];
  loading: boolean;
  error: string | null;
  nav?: EvidenceNav;
}) {
  if (loading) return <LoadingKnowledge />;

  if (error) {
    return (
      <EmptyState
        icon={<AlertIcon size={18} />}
        title="We could not load what this lecture covered"
        description="Reloading the page usually fixes it."
      />
    );
  }

  if (!units.length) return <StillWorking />;

  return <KnowledgeGroups units={units} nav={nav} />;
}

// ---------------------------------------------------------------- a course

// Everything one course knows, read once.
//
// Both course surfaces -- the lecturer's workspace and the student's index --
// need the same set: every unit across every published lecture, plus how many
// actionable items are still waiting on the lecturer. They each used to build
// it by asking `/api/lectures/{id}/knowledge` once per finished lecture, which
// is roughly nine database round trips each. This is one request, and the
// grouping by lecture happens here, in the client, where it is free.
export interface CourseKnowledge {
  units: KnowledgeUnit[];
  /** Actionable items the lecturer has not ruled on yet. A count, never content. */
  awaitingReview: number;
  loading: boolean;
  error: string | null;
}

// The answer is stored WITH the course it was fetched for, so "are we loading"
// and "is this the right course" are both comparisons rather than extra pieces
// of state. A `loading` flag would have to be set synchronously inside the
// effect to stay correct when the course changes -- the cascading-render
// pattern this codebase has already been bitten by -- and it can go stale
// against the data it describes. Deriving it cannot.
interface LoadedCourseKnowledge {
  courseId: string;
  units: KnowledgeUnit[];
  awaitingReview: number;
  error: string | null;
}

// `refreshKey` is how a caller says "the course has moved on" -- a lecture
// finished processing, so the knowledge behind this page is no longer the
// knowledge it was drawn from. The lecturer's workspace passes the set of
// published lecture ids, which is exactly what changes when a recording lands.
//
// Changing it refetches WITHOUT blanking the page: the previous answer stays on
// screen until the new one arrives, because a course that already showed twelve
// topics should not flash back to a skeleton because a thirteenth lecture
// finished.
export function useCourseKnowledge(courseId: string, refreshKey = ""): CourseKnowledge {
  const [loaded, setLoaded] = useState<LoadedCourseKnowledge | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/courses/${courseId}/units`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok) throw new Error(b.error ?? "Could not load what this course covers.");
        setLoaded({
          courseId,
          units: (b.units ?? []) as KnowledgeUnit[],
          awaitingReview: typeof b.awaitingReview === "number" ? b.awaitingReview : 0,
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoaded({
          courseId,
          units: [],
          awaitingReview: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      });

    return () => { cancelled = true; };
  }, [courseId, refreshKey]);

  // An explicit null check rather than `loaded?.courseId === courseId`, so the
  // narrowing is the compiler's rather than a reader's inference. Note this is
  // the COURSE, not the refresh key: a refresh replaces the answer in place,
  // whereas another course's knowledge must never be shown under this one.
  const mine = loaded !== null && loaded.courseId === courseId;
  return {
    units: mine ? loaded.units : [],
    awaitingReview: mine ? loaded.awaitingReview : 0,
    loading: !mine,
    error: mine ? loaded.error : null,
  };
}

// The course's knowledge, under whatever heading the page gives it.
export function CourseKnowledgePanel({
  courseId, heading, knowledge, showAsk,
}: {
  courseId: string;
  heading: string;
  knowledge: CourseKnowledge;
  showAsk?: boolean;
}) {
  const { units, loading, error } = knowledge;
  return (
    <div className="space-y-10">
      {showAsk ? <AskPanel courseId={courseId} /> : null}

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">{heading}</h2>

        <div className="mt-4">
          {loading ? <LoadingKnowledge /> : null}

          {error ? (
            <EmptyState
              icon={<AlertIcon size={18} />}
              title="We could not load what this course covers"
              description="Reloading the page usually fixes it."
            />
          ) : null}

          {!loading && !error && !units.length ? (
            <EmptyState
              icon={<BookIcon size={18} />}
              title="Nothing here yet"
              description="Once a recording has been read, everything it taught appears here."
            />
          ) : null}

          {!loading && !error && units.length ? (
            <KnowledgeGroups units={units} nav={{ courseId }} showLecture />
          ) : null}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- legacy panel
//
// LEGACY, and no longer rendered anywhere.
//
// Everything below reads the Layer-1 confirmed-candidate store through
// `GET /api/courses/[id]/knowledge`, which is fed by `candidate_reviews` -- a
// table nothing has written since review moved to `knowledge_items`. That is
// why the course page told a lecturer "Nothing confirmed yet." after they had
// confirmed every item: the panel was reading a store that no longer receives
// verdicts. `CourseKnowledgePanel` above replaces it and reads the same store
// as the lecture pages and `/ask`.
//
// Kept because the route and `courseKnowledge()` are kept -- `scripts/e2e.mts`
// asserts on their shape -- and deleting the renderer while the endpoint lives
// on would leave the endpoint with no readable description of what it returns.

export interface KnowledgeItem {
  candidateId: string; kind: string; title: string; detail: string;
  duePhrase: string | null; dueResolved: string | null;
  lectureId: string; lectureTitle: string;
  evidenceStartMs: number; evidenceEndMs: number; evidenceText: string;
  extractionMethod: string; extractionVersion: string;
  confirmedAt: string; wasEdited: boolean;
}

const KIND_ORDER = Object.keys(KIND_LABEL);

function byKind(items: KnowledgeItem[]): [string, KnowledgeItem[]][] {
  const groups = new Map<string, KnowledgeItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.kind);
    if (bucket) bucket.push(item);
    else groups.set(item.kind, [item]);
  }
  const rank = (kind: string) => {
    const i = KIND_ORDER.indexOf(kind);
    return i === -1 ? KIND_ORDER.length : i;
  };
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0]));
}

export function KnowledgeCard({
  item, courseId, defaultOpen, hideKind,
}: {
  item: KnowledgeItem; courseId: string;
  defaultOpen?: boolean; hideKind?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <li className="p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {hideKind ? null : (
          <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft">
            {KIND_LABEL[item.kind] ?? item.kind}
          </span>
        )}
        <span className="font-medium">{item.title}</span>
        {item.duePhrase ? (
          <span className="text-sm text-warn">&ldquo;{item.duePhrase}&rdquo;</span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{item.detail}</p>

      <button onClick={() => setOpen((o) => !o)} className="mt-3 text-xs text-ink-soft hover:underline">
        {open ? "Hide evidence" : "Show evidence"}
      </button>

      {open ? (
        <div className="mt-2 rounded-xl border border-line bg-surface-sunken p-4 text-sm">
          <p className="text-xs text-ink-soft">
            {item.lectureTitle} &middot; spoken at{" "}
            <span className="font-mono">{mmss(item.evidenceStartMs)}</span>
          </p>
          <p className="mt-1 italic text-ink">&ldquo;{item.evidenceText}&rdquo;</p>
          <Link
            href={`/courses/${courseId}/lectures/${item.lectureId}?t=${item.evidenceStartMs}`}
            className="mt-2 inline-block text-xs font-medium hover:underline"
          >
            Open transcript at {mmss(item.evidenceStartMs)} &rarr;
          </Link>
          <p className="mt-2 text-xs text-ink-faint">
            Extracted by {item.extractionMethod} v{item.extractionVersion}
            {item.wasEdited ? " · edited by faculty before publishing" : " · confirmed by faculty"}
          </p>
        </div>
      ) : null}
    </li>
  );
}

export default function KnowledgePanel({
  courseId, heading, showAsk,
}: { courseId: string; heading: string; showAsk?: boolean }) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses/${courseId}/knowledge`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok) throw new Error(b.error ?? "Could not load knowledge.");
        setItems(b.items ?? []); setError(null);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId]);

  return (
    <div className="space-y-10">
      {showAsk ? <AskPanel courseId={courseId} /> : null}

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">{heading}</h2>

        {loading ? <p className="mt-3 text-sm text-ink-soft">Loading…</p> : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        {!loading && !items.length ? (
          <p className="mt-3 text-sm text-ink-soft">
            Nothing confirmed yet. Items appear here only after faculty confirm them.
          </p>
        ) : null}

        {items.length ? (
          <div className="mt-4 space-y-6">
            {byKind(items).map(([kind, group]) => (
              <div key={kind}>
                <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                  {KIND_LABEL[kind] ?? kind}
                  <span className="ml-2 font-normal text-ink-faint">{group.length}</span>
                </h3>
                <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
                  {group.map((i) => (
                    <KnowledgeCard key={i.candidateId} item={i} courseId={courseId} hideKind />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
