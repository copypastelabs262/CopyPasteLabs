"use client";

import Link from "next/link";
import { useClassData } from "./ClassContext";
import { actionableUnits, useCourseKnowledge } from "../KnowledgePanel";
import { AssignmentCard } from "../KnowledgeUnit";
import {
  ButtonLink, Card, EmptyState, Page, Section, Skeleton, StatusPill,
  friendlyLectureError, lectureStatusLabel, lectureStatusNote, lectureStatusTone,
} from "@/app/_components/ui";
import { AudioIcon } from "@/app/_components/ui/icons";
import type { CourseLecture } from "../CourseClient";

// HOME — what is happening in this class that matters to me now.
//
// Not a dashboard. Two bands, in reading order:
//
//   1. "Needs you" — only when something actually does. For the owner that is
//      the review queue and any lecture the pipeline could not finish; for a
//      student it is the work that has been set. Absent when absent: an empty
//      attention band would train the eye to skip the band.
//   2. The stream — the class's activity, newest first, derived entirely from
//      real rows: every lecture is an event whose sentence is its current
//      state, decorated with what it yielded once knowledge exists. Nothing
//      here is invented, counted twice, or padded to look busy.
//
// Timestamps use the lecture's own dates. Knowledge units carry no timestamps
// over the wire, so knowledge is attributed to its lecture's event rather than
// given a fabricated one — the honest version of "activity".

interface Yield_ { taught: number; actionable: number; pending: number }

function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function yieldLine(y: Yield_ | undefined, fallback: string | null): string | null {
  if (!y) return fallback;
  if (!y.taught && !y.actionable) return "Nothing was read out of this recording.";
  const parts: string[] = [];
  if (y.taught) parts.push(`${y.taught} ${y.taught === 1 ? "topic" : "topics"} captured`);
  if (y.actionable) parts.push(`${y.actionable} actionable ${y.actionable === 1 ? "item" : "items"}`);
  return parts.join(" · ");
}

const PROBLEM_STATUSES = new Set(["failed", "quarantined"]);

export default function ClassHome() {
  const { courseId, lectures, isOwner, loading } = useClassData();
  const readyIds = lectures.filter((l) => l.status === "ready").map((l) => l.id).join(",");
  const knowledge = useCourseKnowledge(courseId, readyIds);

  if (loading) {
    return (
      <Page>
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </Page>
    );
  }

  // What each published lecture yielded, from the course-wide payload.
  const yields = new Map<string, Yield_>();
  if (!knowledge.loading && !knowledge.error) {
    for (const l of lectures) {
      if (l.status === "ready") yields.set(l.id, { taught: 0, actionable: 0, pending: 0 });
    }
    for (const u of knowledge.units) {
      const row = yields.get(u.lectureId);
      if (!row) continue;
      if (u.category === "teaching") row.taught += 1;
      if (u.category === "actionable") row.actionable += 1;
      if (u.status === "pending") row.pending += 1;
    }
  }

  const blocked = lectures.filter((l) => PROBLEM_STATUSES.has(l.status));
  const owed = actionableUnits(knowledge.units);
  const stream = [...lectures].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <Page>
      {/* ---- Needs you — rendered only when true ------------------------- */}
      {isOwner && (knowledge.awaitingReview > 0 || blocked.length > 0) ? (
        <div className="glass-hero glass-hero--amber rounded-2xl p-6">
          <p className="eyebrow-mono">Needs you</p>
          {knowledge.awaitingReview > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink">
                {knowledge.awaitingReview === 1
                  ? "1 item found in your lectures is waiting for your confirmation."
                  : `${knowledge.awaitingReview} items found in your lectures are waiting for your confirmation.`}{" "}
                <span className="text-ink-soft">Students cannot see them until you confirm.</span>
              </p>
              <ButtonLink href={`/courses/${courseId}/assignments`} tone="primary" size="sm">
                Review now
              </ButtonLink>
            </div>
          ) : null}
          {blocked.map((l) => {
            const err = friendlyLectureError(l.error_message ?? "");
            return (
              <p key={l.id} className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-soft">
                <Link
                  href={`/courses/${courseId}/lectures/${l.id}`}
                  className="font-medium text-ink transition-colors hover:text-accent"
                >
                  {l.title}
                </Link>{" "}
                — {l.error_message ? err.message : lectureStatusNote(l.status, null)}
              </p>
            );
          })}
        </div>
      ) : null}

      {!isOwner && owed.length > 0 ? (
        <Section
          title="What you have to do"
          action={
            owed.length > 2 ? (
              <ButtonLink href={`/courses/${courseId}/assignments`} tone="secondary" size="sm">
                See all {owed.length}
              </ButtonLink>
            ) : undefined
          }
        >
          <div className="space-y-4">
            {owed.slice(0, 2).map((u) => (
              <AssignmentCard key={u.id} unit={u} nav={{ courseId }} showLecture />
            ))}
          </div>
        </Section>
      ) : null}

      {/* ---- The stream -------------------------------------------------- */}
      <Section
        title="Activity"
        description="Every lecture in this class, newest first, with what it yielded."
      >
        {stream.length === 0 ? (
          <EmptyState
            icon={<AudioIcon size={20} />}
            title="Nothing has happened in this class yet."
            description={
              isOwner
                ? "Upload the first recording from the Lectures tab and its progress will appear here."
                : "When your lecturer uploads a recording, what it covered will appear here."
            }
          />
        ) : (
          <Card padded={false}>
            <ol className="divide-y divide-line">
              {stream.map((l) => (
                <StreamRow key={l.id} lecture={l} courseId={courseId} yield_={yields.get(l.id)} />
              ))}
            </ol>
          </Card>
        )}
      </Section>
    </Page>
  );
}

function StreamRow({
  lecture: l, courseId, yield_,
}: { lecture: CourseLecture; courseId: string; yield_?: Yield_ }) {
  const tone = lectureStatusTone(l.status);
  const note = lectureStatusNote(l.status, l.error_message);
  // A blocked lecture's full sentence lives in the "Needs you" band above —
  // the same paragraph twice on one screen is the duplication v3's design
  // fought. In the stream the pill says failed and the row stays chronology.
  // (Students never see these rows at all: the course payload filters them.)
  const line = l.status === "ready"
    ? yieldLine(yield_, note)
    : PROBLEM_STATUSES.has(l.status) ? null : note;
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 p-5 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link
            href={`/courses/${courseId}/lectures/${l.id}`}
            className="text-[15px] font-medium tracking-[-0.008em] text-ink transition-colors hover:text-accent"
          >
            {l.title}
          </Link>
          <StatusPill tone={tone}>{lectureStatusLabel(l.status)}</StatusPill>
          {yield_?.pending ? (
            <StatusPill tone="warn">{yield_.pending} waiting for review</StatusPill>
          ) : null}
        </div>
        {line ? (
          <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-ink-soft">{line}</p>
        ) : null}
      </div>
      <p className="shrink-0 text-xs text-ink-faint sm:pt-1">
        {formatDay(l.recorded_on ?? l.created_at)}
      </p>
    </li>
  );
}
