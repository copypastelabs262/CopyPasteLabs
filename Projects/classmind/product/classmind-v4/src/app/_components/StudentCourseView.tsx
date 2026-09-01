"use client";

import Link from "next/link";
import { type KnowledgeUnit } from "./KnowledgeUnit";
import { topicUnits, useCourseKnowledge } from "./KnowledgePanel";
import { BookIcon, ChevronRightIcon } from "./ui/icons";
import { EmptyState, Section } from "./ui";
import type { CourseLecture } from "./CourseClient";

// The lecture index, as a student reads it.
//
// v4: this surface does ONE job now. Asking moved to the Ask tab and "what do
// I owe" moved to the Assignments tab — what remains is the question answered
// one lecture at a time: what was actually taught, in the lecture I missed or
// the lecture before the exam, each row opening onto its full account.

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // An explicit locale rather than the visitor's default: the same string has
  // to come out of the server render and the client render.
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function StudentCourseView({
  courseId, lectures,
}: { courseId: string; lectures: CourseLecture[] }) {
  // ONE request, for the whole course.
  //
  // This used to fan out to `/api/lectures/{id}/knowledge` once per published
  // lecture. Each of those is about nine database round trips, so a twenty-week
  // course opened roughly a hundred and eighty queries to draw a page whose
  // content is a few assignments and a list of titles. The per-lecture grouping
  // it needed is a loop over the single payload, below.
  //
  // Re-read when the set of published lectures changes, and derived from the
  // ids rather than the array: `lectures` is a fresh array on every parent
  // render, so keying on it would refetch continuously.
  const readyIds = lectures.filter((l) => l.status === "ready").map((l) => l.id).join(",");
  const { units, loading } = useCourseKnowledge(courseId, readyIds);

  // Grouped per lecture so each row in the index can say what it covered
  // without a second pass over the whole set for every row.
  const topicsByLecture = new Map<string, KnowledgeUnit[]>();
  for (const u of topicUnits(units)) {
    const bucket = topicsByLecture.get(u.lectureId);
    if (bucket) bucket.push(u);
    else topicsByLecture.set(u.lectureId, [u]);
  }
  const unitCountByLecture = new Map<string, number>();
  for (const u of units) {
    unitCountByLecture.set(u.lectureId, (unitCountByLecture.get(u.lectureId) ?? 0) + 1);
  }

  return (
    <Page>
      <AskPanel courseId={courseId} />

      <Section
        title="What you have to do"
        description="Everything set across this course, newest lectures first."
      >
        {loading ? (
          <Skeleton className="h-28 rounded-2xl" />
        ) : owed.length ? (
          <div className="space-y-4">
            {owed.map((u) => (
              <AssignmentCard key={u.id} unit={u} nav={{ courseId }} showLecture />
            ))}
          </div>
        ) : awaitingReview ? (
          // "NOTHING TO DO" AND "YOUR LECTURER HAS NOT LOOKED YET" ARE NOT THE
          // SAME SENTENCE, and a student who reads the first when the second is
          // true plans their week around a page that misled them. The count is
          // all that is said: what those items are stays invisible until the
          // lecturer confirms them, which is the product's central safety rule
          // and does not bend for this.
          <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
            Nothing to do right now.{" "}
            {awaitingReview === 1
              ? "1 item is waiting for your lecturer to confirm"
              : `${awaitingReview} items are waiting for your lecturer to confirm`}
            , and will appear here once they have.
          </p>
        ) : (
          <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
            Nothing has been set from these lectures yet. Anything your lecturer gives out will
            appear here, with the moment it was said.
          </p>
        )}
      </Section>

      <Section title="Lectures">
        {lectures.length === 0 ? (
          <EmptyState
            icon={<BookIcon size={18} />}
            title="No lectures published yet"
            description="Once your lecturer uploads a recording and it has been processed, it will appear here with everything that was taught in it."
          />
        ) : (
          <ul className="divide-y divide-line">
            {lectures.map((l) => {
              const topics = topicsByLecture.get(l.id) ?? [];
              const covered = topics.slice(0, 4).map((t) => t.title).join(" · ");
              const processed = (unitCountByLecture.get(l.id) ?? 0) > 0;
              return (
                <li key={l.id}>
                  <Link
                    href={`/courses/${courseId}/lectures/${l.id}`}
                    className="group -mx-3 flex items-start gap-4 rounded-xl px-3 py-5 transition-colors hover:bg-surface-sunken"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-medium leading-snug tracking-tight text-ink">
                        {l.title}
                      </p>
                      <p className="mt-1 text-xs text-ink-faint">{formatDay(l.created_at)}</p>

                      {loading ? null : covered ? (
                        <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-ink-soft">
                          {covered}
                          {topics.length > 4 ? ` · +${topics.length - 4} more` : ""}
                        </p>
                      ) : processed ? null : (
                        <p className="mt-2 text-[14px] leading-relaxed text-ink-faint">
                          Understanding the lecture — connecting concepts and identifying important
                          information.
                        </p>
                      )}
                    </div>
                    <ChevronRightIcon
                      size={18}
                      className="mt-1 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink-soft"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </Page>
  );
}
