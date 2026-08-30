"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  EmptyState,
  Page,
  PageHeader,
  Section,
  StatusPill,
  lectureStatusLabel,
  lectureStatusNote,
  lectureStatusTone,
} from "@/app/_components/ui";
import {
  AudioIcon,
  ChevronRightIcon,
  KeyIcon,
  PlusIcon,
} from "@/app/_components/ui/icons";
import { agoLabel, type OverviewCourse, type TeacherOverview } from "./CoursesClient";

// The teacher's home.
//
// A teacher opens this to answer two questions in order: is anything stuck
// waiting on me, and where do I put the recording I just made. Everything else
// on the screen is orientation, and orientation is quiet.
//
// There are deliberately no statistics. A count of lectures, a count of
// courses and a count of items would fill the top of the screen with numbers
// nobody acts on -- and push the one row that IS actionable ("three items have
// been waiting nine days") below them.
//
// This is also the only home that may use `lectureStatusNote`. Its wording is
// written from the lecturer's side -- "waiting for your review" -- and a
// student reviews nothing.

interface Props {
  eyebrow: string;
  data: TeacherOverview;
  // Resolved by the shell, because "upload a lecture" means opening a course,
  // creating one, or choosing between several, and only the shell owns those
  // dialogs.
  primaryAction: ReactNode;
  onCreateCourse: () => void;
  onJoinCourse: () => void;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function TeacherHome({
  eyebrow,
  data,
  primaryAction,
  onCreateCourse,
  onJoinCourse,
}: Props) {
  const courseCount = data.courses.length;
  const attentionCount = data.reviewQueueTotal + data.blockedTotal;

  // One sentence, and never one the payload cannot prove. The overview covers
  // every course in the account, so unlike the old per-course fan-out this may
  // speak about the whole account rather than hedging to "your most recent".
  function subtitle(): string {
    if (!courseCount) return "Nothing here yet. A course is where lectures live.";
    const courses = plural(courseCount, "course", "courses");
    if (data.processingCount) {
      return `${courses}. ${plural(data.processingCount, "lecture is", "lectures are")} still processing.`;
    }
    if (attentionCount) {
      return `${courses}. ${plural(attentionCount, "lecture needs", "lectures need")} you.`;
    }
    if (data.recentLecturesTotal) {
      return `${courses}, ${plural(data.recentLecturesTotal, "lecture", "lectures")}. Nothing is waiting on you.`;
    }
    return `${courses}. No lectures uploaded yet.`;
  }

  return (
    <Page>
      <PageHeader
        eyebrow={eyebrow}
        title="Your lectures"
        subtitle={subtitle()}
        action={primaryAction}
      />

      {/* Only when there is something in it. An empty "Needs your attention"
          box is a box that teaches the reader to stop looking at it. */}
      {attentionCount ? (
        <Section
          title="Needs your attention"
          description="Nothing here reaches a student until you have looked at it."
        >
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {data.reviewQueue.map((entry) => (
                <li key={entry.lectureId}>
                  <Link
                    href={`/courses/${entry.courseId}/lectures/${entry.lectureId}`}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-sunken sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-ink">
                        {entry.lectureTitle}
                      </span>
                      <span className="mt-1 block truncate text-[13px] text-ink-faint">
                        {entry.courseCode} &middot; waiting {agoLabel(entry.waitingSince)}
                      </span>
                    </span>
                    <span className="shrink-0">
                      <StatusPill tone="warn">
                        {plural(entry.pendingCount, "item to review", "items to review")}
                      </StatusPill>
                    </span>
                  </Link>
                </li>
              ))}

              {data.blocked.map((lecture) => (
                <li key={lecture.id}>
                  <Link
                    href={`/courses/${lecture.courseId}/lectures/${lecture.id}`}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-sunken sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-ink">
                        {lecture.title}
                      </span>
                      <span className="mt-1 block truncate text-[13px] text-ink-faint">
                        {lecture.courseCode} &middot; {agoLabel(lecture.createdAt)}
                      </span>
                      <span className="mt-2 block text-sm leading-relaxed text-ink-soft">
                        {lectureStatusNote(lecture.status, lecture.errorMessage)}
                      </span>
                    </span>
                    <span className="shrink-0">
                      <StatusPill tone={lectureStatusTone(lecture.status)}>
                        {lectureStatusLabel(lecture.status)}
                      </StatusPill>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {/* The caps are the payload's, so the count has to be told rather
              than inferred from what happens to be on screen. */}
          {data.reviewQueueTotal > data.reviewQueue.length ||
          data.blockedTotal > data.blocked.length ? (
            <p className="mt-3 text-[13px] text-ink-faint">
              Showing {data.reviewQueue.length + data.blocked.length} of {attentionCount}. The rest
              are inside their courses.
            </p>
          ) : null}
        </Section>
      ) : null}

      {data.recentLectures.length ? (
        <Section title="Recent lectures" description="The latest across every course you teach.">
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {data.recentLectures.map((lecture) => {
                // What this lecture actually left behind, in a sentence. The
                // pending count is more specific than the status sentence
                // whenever there is one, so it wins.
                const note =
                  lecture.pendingCount > 0
                    ? `${plural(lecture.pendingCount, "item is", "items are")} waiting for your review.`
                    : lecture.status === "ready"
                      ? "What was taught is live. Nothing is waiting for you."
                      : lectureStatusNote(lecture.status, lecture.errorMessage);
                return (
                  <li key={lecture.id}>
                    <Link
                      href={`/courses/${lecture.courseId}/lectures/${lecture.id}`}
                      className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-sunken sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-medium text-ink">
                          {lecture.title}
                        </span>
                        <span className="mt-1 block truncate text-[13px] text-ink-faint">
                          {lecture.courseCode} &middot; {agoLabel(lecture.createdAt)}
                        </span>
                        {note ? (
                          <span className="mt-2 block text-sm leading-relaxed text-ink-soft">
                            {note}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0">
                        <StatusPill tone={lectureStatusTone(lecture.status)}>
                          {lectureStatusLabel(lecture.status)}
                        </StatusPill>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Section>
      ) : (
        <EmptyState
          icon={<AudioIcon size={20} />}
          title="Your first lecture is where ClassMind starts learning your classroom."
          description={
            courseCount
              ? "A lecture is uploaded inside a course. Open one and add a recording."
              : "A lecture is uploaded inside a course, so a course comes first."
          }
          action={primaryAction}
        />
      )}

      {/* Absent, not empty, when there are no courses. The empty state above
          already names creating one as the next step, and a second box saying
          the same thing with its own primary button would put two dominant
          actions on a screen that is allowed one. */}
      {courseCount ? (
        <Section
          title="Your courses"
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" tone="secondary" onClick={onCreateCourse}>
                <PlusIcon size={15} />
                New course
              </Button>
              <Button size="sm" tone="ghost" onClick={onJoinCourse}>
                <KeyIcon size={15} />
                Join with a code
              </Button>
            </div>
          }
        >
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {data.courses.map((course) => (
                <li key={course.id}>
                  <CourseRow course={course} />
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}
    </Page>
  );
}

// Shared by both homes in spirit but not in code: the teacher's row carries a
// join code and a lecture count, the student's carries neither, and folding
// them into one component with two flags would make both harder to read.
function CourseRow({ course }: { course: OverviewCourse }) {
  const meta = [
    course.isOwner ? "Teaching" : "Student",
    course.term,
    plural(course.lectureCount, "lecture", "lectures"),
    course.processingCount ? `${course.processingCount} processing` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <Link
      href={`/courses/${course.id}`}
      className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-sunken sm:p-5"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">
          <span className="font-medium">{course.code}</span>
          <span className="text-ink-soft"> {course.title}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-faint">
          <span>{meta}</span>
          {/* Copied roughly once a term. Present, quiet, never competing with
              the course name. */}
          {course.joinCode ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-1.5 py-0.5">
              <KeyIcon size={13} />
              <code className="font-mono">{course.joinCode}</code>
            </span>
          ) : null}
        </span>
      </span>
      <ChevronRightIcon size={18} className="shrink-0 text-ink-faint" />
    </Link>
  );
}
