"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  EmptyState,
  Page,
  PageHeader,
  PipelineTrack,
  Section,
  StatusPill,
  TechnicalDisclosure,
  friendlyLectureError,
  lectureStatusLabel,
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
// waiting on me, and where do I put the recording I just made. The layout now
// says that with scale instead of order alone: whatever needs a human is the
// screen's single hero surface — edge-lit, biggest thing on the page — and
// courses recede into a quiet rail. One dominant object per screen.
//
// There are deliberately no statistics. A count of lectures would fill the
// top of the screen with numbers nobody acts on and push the one row that IS
// actionable below them.
//
// This is also the only home that may use lecture status notes; their wording
// is written from the lecturer's side, and a student reviews nothing.

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

  // A lecture in the attention block must not reappear below it. The same
  // fact twice at the same weight is how a reader stops trusting sections to
  // mean anything.
  const attentionIds = new Set([
    ...data.reviewQueue.map((entry) => entry.lectureId),
    ...data.blocked.map((lecture) => lecture.id),
  ]);
  const recent = data.recentLectures.filter((lecture) => !attentionIds.has(lecture.id));

  // One sentence, and never one the payload cannot prove.
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

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 space-y-10 lg:col-span-8">
          {/* The beacon. Amber, because "needs a human" is this product's
              signature moment — and only when there is something in it. An
              empty attention box teaches the reader to stop looking. */}
          {attentionCount ? (
            <Section
              title="Needs your attention"
              description="Nothing here reaches a student until you have looked at it."
            >
              <div className="glass-hero glass-hero--amber rounded-2xl">
                <ul className="divide-y divide-line">
                  {data.reviewQueue.map((entry) => (
                    <li key={entry.lectureId}>
                      <Link
                        href={`/courses/${entry.courseId}/lectures/${entry.lectureId}`}
                        className="row-hover flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[16px] font-medium tracking-[-0.008em] text-ink">
                            {entry.lectureTitle}
                          </span>
                          <span className="mt-1 block truncate text-[13px] text-ink-faint">
                            {entry.courseCode} &middot; waiting {agoLabel(entry.waitingSince)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <StatusPill tone="warn">
                            {plural(entry.pendingCount, "item to review", "items to review")}
                          </StatusPill>
                          <ChevronRightIcon size={16} className="text-ink-faint" />
                        </span>
                      </Link>
                    </li>
                  ))}

                  {data.blocked.map((lecture) => {
                    const error = friendlyLectureError(lecture.errorMessage);
                    return (
                      <li key={lecture.id} className="p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                          <span className="min-w-0">
                            <Link
                              href={`/courses/${lecture.courseId}/lectures/${lecture.id}`}
                              className="block truncate text-[16px] font-medium tracking-[-0.008em] text-ink hover:text-accent"
                            >
                              {lecture.title}
                            </Link>
                            <span className="mt-1 block truncate text-[13px] text-ink-faint">
                              {lecture.courseCode} &middot; {agoLabel(lecture.createdAt)}
                            </span>
                          </span>
                          <span className="shrink-0">
                            <StatusPill tone={lectureStatusTone(lecture.status)}>
                              {lectureStatusLabel(lecture.status)}
                            </StatusPill>
                          </span>
                        </div>

                        <PipelineTrack
                          status={lecture.status}
                          errorMessage={lecture.errorMessage}
                          className="mt-4 max-w-sm"
                        />

                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
                          {error.message}
                        </p>

                        {/* The card ends in a verb. Retrying transcription is a
                            paid call and an operator decision, so the honest
                            action is the lecture page, which owns recovery. */}
                        <div className="mt-4">
                          <ButtonLink
                            href={`/courses/${lecture.courseId}/lectures/${lecture.id}`}
                            size="sm"
                            tone="secondary"
                          >
                            Open lecture
                            <ChevronRightIcon size={14} />
                          </ButtonLink>
                        </div>

                        <TechnicalDisclosure error={error} />
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* The caps are the payload's, so the count has to be told. */}
              {data.reviewQueueTotal > data.reviewQueue.length ||
              data.blockedTotal > data.blocked.length ? (
                <p className="mt-3 text-[13px] text-ink-faint">
                  Showing {data.reviewQueue.length + data.blocked.length} of {attentionCount}. The
                  rest are inside their courses.
                </p>
              ) : null}
            </Section>
          ) : null}

          {recent.length ? (
            <Section title="Recent lectures" description="The latest across every course you teach.">
              <Card padded={false}>
                <ul className="divide-y divide-line">
                  {recent.map((lecture) => {
                    const note =
                      lecture.pendingCount > 0
                        ? `${plural(lecture.pendingCount, "item is", "items are")} waiting for your review.`
                        : lecture.status === "ready"
                          ? "What was taught is live. Nothing is waiting for you."
                          : null;
                    return (
                      <li key={lecture.id}>
                        <Link
                          href={`/courses/${lecture.courseId}/lectures/${lecture.id}`}
                          className="row-hover flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-5"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium text-ink">
                              {lecture.title}
                            </span>
                            <span className="mt-1 block truncate text-[13px] text-ink-faint">
                              {lecture.courseCode} &middot; {agoLabel(lecture.createdAt)}
                            </span>
                            <PipelineTrack
                              status={lecture.status}
                              errorMessage={lecture.errorMessage}
                              className="mt-3 max-w-[16rem]"
                            />
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
          ) : !attentionCount ? (
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
          ) : null}
        </div>

        {/* The rail: orientation, one material level below the work. Absent
            entirely when there are no courses — the empty state already names
            creating one as the next step. */}
        {courseCount ? (
          <div className="min-w-0 lg:col-span-4">
            <Section
              title="Your courses"
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" tone="secondary" onClick={onCreateCourse}>
                    <PlusIcon size={15} />
                    New
                  </Button>
                  <Button size="sm" tone="ghost" onClick={onJoinCourse}>
                    <KeyIcon size={15} />
                    Join
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
          </div>
        ) : null}
      </div>
    </Page>
  );
}

// The teacher's row carries a join code and a lecture count; the student's
// carries neither, and folding them into one component with two flags would
// make both harder to read.
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
      className="row-hover flex items-center gap-4 p-4 sm:p-5"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">
          <span className="font-medium">{course.code}</span>
          <span className="text-ink-soft"> {course.title}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-faint">
          <span>{meta}</span>
          {/* Copied roughly once a term. Present, quiet, machine voice. */}
          {course.joinCode ? (
            <span className="chip-mono inline-flex items-center gap-1">
              <KeyIcon size={12} />
              {course.joinCode}
            </span>
          ) : null}
        </span>
      </span>
      <ChevronRightIcon size={18} className="shrink-0 text-ink-faint" />
    </Link>
  );
}
