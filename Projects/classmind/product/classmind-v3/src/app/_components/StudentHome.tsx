"use client";

import Link from "next/link";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Page,
  PageHeader,
  Section,
  StatusPill,
} from "@/app/_components/ui";
import { AssignmentIcon, BookIcon, ChevronRightIcon, KeyIcon, SearchIcon } from "@/app/_components/ui/icons";
import { kindLabel } from "./KnowledgeUnit";
import { agoLabel, type OverviewCourse, type StudentOverview, type TodoItem } from "./CoursesClient";

// The student's home.
//
// A student's real question does not fit inside one course. It is "what do I
// owe, and what did I miss" — so the work comes first, whole, before any
// mention of courses. And the screen's one luminous surface is the product's
// promise itself: ask your lectures anything. That panel is a DOOR, not a
// form — asking happens inside a course, where answers can cite their
// evidence (and where the cost of asking is a deliberate act, not a home-page
// keystroke).
//
// NOTHING teacher-facing may appear on this screen. No status notes, no
// unreviewed content, no review affordances. The single thing a student is
// told about unreviewed work is a NUMBER, and the wording makes clear whose
// job it is: waiting for the lecturer, not for them.

interface Props {
  eyebrow: string;
  data: StudentOverview;
  onJoinCourse: () => void;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// The honesty sentence, in one place because it is said in three. "Nothing to
// do" and "your lecturer has not looked yet" are different facts and a student
// acts differently on each.
function awaitingSentence(count: number, hasWork: boolean): string | null {
  if (!count) return null;
  const items = plural(count, "item is", "items are");
  return hasWork
    ? `${items} still waiting for your lecturer to confirm. You will see them here when they do.`
    : `${items} waiting for your lecturer to confirm. They will appear here once confirmed.`;
}

export default function StudentHome({ eyebrow, data, onJoinCourse }: Props) {
  const courseCount = data.courses.length;
  const firstCourse = data.courses[0];

  function subtitle(): string {
    if (!courseCount) return "A join code from your teacher is all it takes.";
    const courses = plural(courseCount, "course", "courses");
    if (data.todoTotal) {
      return `${plural(data.todoTotal, "thing", "things")} to do across ${courses}.`;
    }
    return `${courses}. ${plural(data.recentLecturesTotal, "lecture", "lectures")} you can revisit.`;
  }

  // The door to the product's whole point. With one course it opens that
  // course; with several it opens the list; with none it asks for a code.
  const askHero = (
    <div className="glass-hero flex flex-col gap-5 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
      <div className="min-w-0">
        <p className="eyebrow-mono">ask classmind</p>
        <h2 className="font-display mt-1.5 text-[1.55rem] leading-snug font-medium tracking-[-0.01em] text-ink">
          Ask your lectures anything.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
          &ldquo;What was assigned?&rdquo; &middot; &ldquo;What did I miss on Tuesday?&rdquo; &mdash;
          every answer is traced to the second it was spoken in class.
        </p>
      </div>
      <div className="shrink-0">
        {firstCourse ? (
          <ButtonLink
            tone="primary"
            size="lg"
            href={courseCount === 1 ? `/courses/${firstCourse.id}` : "#courses"}
          >
            <SearchIcon size={17} />
            {courseCount === 1 ? `Ask ${firstCourse.code}` : "Open a course to ask"}
          </ButtonLink>
        ) : (
          <Button tone="primary" size="lg" onClick={onJoinCourse}>
            <KeyIcon size={17} />
            Join a course
          </Button>
        )}
      </div>
    </div>
  );

  if (!courseCount) {
    return (
      <Page>
        <PageHeader eyebrow={eyebrow} title="Catch up" subtitle={subtitle()} />
        {askHero}
        <EmptyState
          icon={<KeyIcon size={18} />}
          title="You are not in a course yet."
          description="Your teacher hands out one join code per course. Once you are in, everything they publish shows up here."
          action={
            <Button tone="secondary" onClick={onJoinCourse}>
              Enter a code
            </Button>
          }
        />
      </Page>
    );
  }

  const awaiting = awaitingSentence(data.awaitingReview, data.todo.length > 0);

  return (
    <Page>
      <PageHeader eyebrow={eyebrow} title="Catch up" subtitle={subtitle()} />

      {askHero}

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 space-y-10 lg:col-span-8">
          <Section
            title="What you have to do"
            description={
              data.todo.length
                ? "Confirmed by your lecturer, across every course you are in."
                : undefined
            }
          >
            {data.todo.length ? (
              <>
                <ul className="space-y-4">
                  {data.todo.map((item) => (
                    <li key={item.id}>
                      <TodoCard item={item} />
                    </li>
                  ))}
                </ul>
                {data.todoTotal > data.todo.length ? (
                  <p className="mt-4 text-[13px] text-ink-faint">
                    Showing {data.todo.length} of {data.todoTotal}. The rest are inside their
                    courses.
                  </p>
                ) : null}
                {awaiting ? (
                  <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
                      aria-hidden="true"
                    />
                    {awaiting}
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={<AssignmentIcon size={18} />}
                title="Nothing to do right now."
                description={
                  awaiting ??
                  "Nothing has been assigned in your courses. Anything your lecturer confirms will show up here."
                }
                action={
                  firstCourse ? (
                    <ButtonLink tone="ghost" size="sm" href={`/courses/${firstCourse.id}`}>
                      Open {firstCourse.code}
                      <ChevronRightIcon size={14} />
                    </ButtonLink>
                  ) : undefined
                }
              />
            )}
          </Section>

          {data.recentLectures.length ? (
            <Section title="Recently added" description="Lectures you can catch up on.">
              <Card padded={false}>
                <ul className="divide-y divide-line">
                  {data.recentLectures.map((lecture) => (
                    <li key={lecture.id}>
                      <Link
                        href={`/courses/${lecture.courseId}/lectures/${lecture.id}`}
                        className="row-hover flex items-center gap-4 p-4 sm:p-5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-ink">
                            {lecture.title}
                          </span>
                          <span className="mt-1 block truncate text-[13px] text-ink-faint">
                            {lecture.courseCode} &middot; added {agoLabel(lecture.createdAt)}
                          </span>
                        </span>
                        <ChevronRightIcon size={18} className="shrink-0 text-ink-faint" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
              {data.recentLecturesTotal > data.recentLectures.length ? (
                <p className="mt-3 text-[13px] text-ink-faint">
                  Showing {data.recentLectures.length} of {data.recentLecturesTotal}.
                </p>
              ) : null}
            </Section>
          ) : (
            <Section title="Recently added">
              <EmptyState
                icon={<BookIcon size={18} />}
                title="No lectures published yet."
                description="When your lecturer publishes one, it appears here and you can revisit it in full."
              />
            </Section>
          )}
        </div>

        <div className="min-w-0 lg:col-span-4">
          <Section
            id="courses"
            title="Your courses"
            action={
              <Button size="sm" tone="ghost" onClick={onJoinCourse}>
                <KeyIcon size={15} />
                Join
              </Button>
            }
          >
            <Card padded={false}>
              <ul className="divide-y divide-line">
                {data.courses.map((course) => (
                  <li key={course.id}>
                    <StudentCourseRow course={course} />
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        </div>
      </div>
    </Page>
  );
}

// One obligation, whole. The steps and the "not specified" list are on the
// card rather than one click away, because they are the difference between
// knowing an assignment exists and knowing what it asks for — and because
// `unspecified` is the field that stops a student inferring a deadline that
// was never given.
function TodoCard({ item }: { item: TodoItem }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Amber means "this one is about time". If every kind were amber the
            colour would stop meaning anything. */}
        <StatusPill tone={item.kind === "deadline" ? "warn" : "neutral"}>
          {kindLabel(item.kind)}
        </StatusPill>
        <span className="truncate text-[13px] text-ink-faint">{item.courseCode}</span>
      </div>

      <h3 className="font-display mt-3.5 text-[19px] leading-snug font-medium tracking-[-0.008em] text-balance text-ink sm:text-[21px]">
        {item.title}
      </h3>

      {item.summary ? (
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{item.summary}</p>
      ) : null}

      {item.steps.length ? (
        <ol className="mt-4 max-w-2xl space-y-2 text-[15px] leading-relaxed text-ink">
          {item.steps.map((step, index) => (
            <li key={index} className="flex gap-3">
              <span className="chip-mono mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center !p-0 text-[11px] font-medium text-ink-soft">
                {index + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {/* Stated positively and never dropped: what the lecturer did NOT say is
          information, and silence about it reads as "there is no deadline". */}
      {item.unspecified.length ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-faint">
          Not stated in the lecture: {item.unspecified.join(", ")}.
        </p>
      ) : null}

      <div className="mt-5 border-t border-line pt-4">
        <Link
          href={`/courses/${item.courseId}/lectures/${item.lectureId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-warn hover:underline"
        >
          Hear where this was said
          <ChevronRightIcon size={15} />
        </Link>
        <p className="mt-1.5 text-[13px] text-ink-faint">
          {item.lectureTitle}
          {item.lectureAt ? ` · ${agoLabel(item.lectureAt)}` : null}
        </p>
      </div>
    </Card>
  );
}

function StudentCourseRow({ course }: { course: OverviewCourse }) {
  const meta = [course.term, plural(course.lectureCount, "lecture", "lectures")]
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
        {meta ? (
          <span className="mt-1 block truncate text-[13px] text-ink-faint">{meta}</span>
        ) : null}
      </span>
      <ChevronRightIcon size={18} className="shrink-0 text-ink-faint" />
    </Link>
  );
}
