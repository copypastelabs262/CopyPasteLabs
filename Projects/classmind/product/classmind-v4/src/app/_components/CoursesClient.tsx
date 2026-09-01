"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import {
  Button,
  ButtonLink,
  Card,
  Dialog,
  Page,
  PageHeader,
  SelectInput,
  Skeleton,
  Spinner,
  TextInput,
} from "@/app/_components/ui";
import { AlertIcon, ChevronRightIcon, PlusIcon, UploadIcon } from "@/app/_components/ui/icons";
import TeacherHome from "./TeacherHome";
import StudentHome from "./StudentHome";

// The signed-in home, as a shell.
//
// It owns three things and deliberately renders none of the page itself:
//
//   1. ONE request. `/api/me/overview` answers "what matters to me right now"
//      in a single round trip. The previous version listed the courses, then
//      fetched each course, then fetched knowledge per lecture -- O(lectures)
//      requests from the browser to assemble a screen.
//   2. The forms. Creating a course and joining one are needed by both roles,
//      both live behind dialogs, and neither belongs to a home screen: a form
//      permanently open on the home screen is a form the reader skips past on
//      every visit to reach the thing they came for.
//   3. The branch. A teacher and a student get genuinely different screens,
//      because they arrive with different questions. They keep the SAME lecture
//      URL, so a link a teacher sends a student still opens.

/* ---------------------------------------------------------------------------
   The payload, as the client sees it.

   Declared here rather than imported from the route, because the route module
   pulls in the service-role Supabase client and `server-only`. Same reason
   KnowledgeUnit.tsx declares its own copy of the knowledge shape.
--------------------------------------------------------------------------- */

export interface OverviewCourse {
  id: string;
  code: string;
  title: string;
  term: string | null;
  // Owner-only, and null for everyone else -- it is how new people get in.
  joinCode: string | null;
  isOwner: boolean;
  lectureCount: number;
  processingCount: number;
}

export interface OverviewLecture {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  errorMessage: string | null;
  courseId: string;
  courseCode: string;
  courseTitle: string;
}

export interface TeacherLecture extends OverviewLecture {
  // How many items on this lecture are still waiting on the teacher.
  pendingCount: number;
}

export interface ReviewQueueEntry {
  lectureId: string;
  lectureTitle: string;
  courseId: string;
  courseCode: string;
  pendingCount: number;
  waitingSince: string;
}

export interface TeacherOverview {
  role: "faculty";
  courses: OverviewCourse[];
  reviewQueue: ReviewQueueEntry[];
  reviewQueueTotal: number;
  reviewItemsTotal: number;
  blocked: OverviewLecture[];
  blockedTotal: number;
  processingCount: number;
  recentLectures: TeacherLecture[];
  recentLecturesTotal: number;
}

// One obligation a student actually has. Note what is NOT here: no status, no
// confidence, no evidence, no review affordance. By the time an item is in this
// list a human has confirmed it, so there is nothing left to qualify.
export interface TodoItem {
  id: string;
  kind: string;
  title: string;
  summary: string;
  steps: string[];
  unspecified: string[];
  courseId: string;
  courseCode: string;
  courseTitle: string;
  lectureId: string;
  lectureTitle: string;
  lectureAt: string;
}

export interface StudentOverview {
  role: "student";
  courses: OverviewCourse[];
  todo: TodoItem[];
  todoTotal: number;
  // A COUNT and never content: how many items the lecturer has not looked at.
  awaitingReview: number;
  recentLectures: OverviewLecture[];
  recentLecturesTotal: number;
}

export type Overview = TeacherOverview | StudentOverview;

export interface CoursesUser {
  fullName: string | null;
  email: string | null;
  role: "faculty" | "student";
}

/* ---------------------------------------------------------------------------
   Shared presentation
--------------------------------------------------------------------------- */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Elapsed time in the words a person would use. Used by both homes -- "waiting
// four days" and "added four days ago" are the same measurement, and the two
// screens must not disagree about when a day becomes two.
//
// Deliberately coarse. "3 days" and "3 days, 4 hours" carry the same decision,
// and the second one asks the reader to parse more to learn nothing.
export function agoLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const elapsed = Date.now() - then;
  // Clock skew between the browser and the server can make a fresh row appear
  // to be from the future. Say the true thing rather than "in -2 minutes".
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(elapsed / DAY);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? "month" : "months"} ago`;
}

const LANGUAGE_OPTIONS = [
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "Hindi / Hinglish" },
  { value: "unknown", label: "Auto-detect (not recommended)" },
] as const;

// Not a nicety. Auto-detect once romanized an English lecture into Arabic, and
// the person who picked it had no way to know that was a possible outcome.
const LANGUAGE_HINT =
  "Auto-detect once romanized an English lecture into Arabic. Pick what you teach in.";

// What the server renders, and therefore what the first client render has to
// render too. The server has no timezone to guess with, so it cannot say more
// than this without the two disagreeing.
const NEUTRAL_GREETING = "Welcome back";

function greetingNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// There is nothing to subscribe to -- the hour is read during render, never
// pushed -- so this is a no-op that exists to satisfy the store contract. It
// lives at module scope because the subscribe function has to be stable across
// renders or React resubscribes on every one.
function subscribeToNothing() {
  return () => {};
}

function firstNameOf(user: CoursesUser): string | null {
  const fromFullName = user.fullName?.trim().split(/\s+/)[0];
  if (fromFullName) return fromFullName;
  // Not a name, but closer to one than the whole address, and it is all we have
  // for an account created without a profile.
  const local = user.email?.split("@")[0]?.trim();
  return local || null;
}

/* ---------------------------------------------------------------------------
   The shell
--------------------------------------------------------------------------- */

export default function CoursesClient({ user }: { user: CoursesUser }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Separate from `error`, which belongs to the page, and from each other. A
  // rejected join code reported at the top of the page reads as "your courses
  // failed to load", and it used to stay there through every later success.
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);

  // The hour is a client-only fact, so the server HTML and the first client
  // render have to agree on the neutral greeting or React discards the markup
  // it just hydrated. `useSyncExternalStore` is the hook that is allowed to
  // answer differently on the two sides on purpose: it renders the server
  // snapshot through hydration and swaps in the real greeting straight after.
  // A mount effect reaches the same place one cascading render later, which is
  // what `react-hooks/set-state-in-effect` objects to.
  const greeting = useSyncExternalStore(subscribeToNothing, greetingNow, () => NEUTRAL_GREETING);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/me/overview");
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(body.error ?? "Could not load your home.");
        setOverview(body as Overview);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // A fast unmount -- a click straight through into a course -- must not
    // leave a resolved fetch setting state on a component that is gone.
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function post(url: string, payload: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Request failed.");
    return body;
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await post("/api/courses", { code, title, term, transcriptionLanguage: language });
      setCode("");
      setTitle("");
      setTerm("");
      setCreateOpen(false);
      setReload((v) => v + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError(null);
    setJoining(true);
    try {
      await post("/api/enroll", { joinCode });
      setJoinCode("");
      setJoinOpen(false);
      setReload((v) => v + 1);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
    }
  }

  function openCreate() {
    setCreateError(null);
    setCreateOpen(true);
  }

  function openJoin() {
    setJoinError(null);
    setJoinOpen(true);
  }

  // The retry is the only path that puts the whole screen back into its loading
  // state. A reload after creating or joining deliberately does not: the page
  // is already on screen and correct, and collapsing it into skeletons for one
  // round trip makes a successful action look like a page reset.
  function retry() {
    setError(null);
    setLoading(true);
    setReload((v) => v + 1);
  }

  const firstName = firstNameOf(user);
  const eyebrow = firstName ? `${greeting}, ${firstName}` : greeting;
  const owned = overview?.courses.filter((course) => course.isOwner) ?? [];

  // Upload is what the teacher's screen is for, but a lecture is uploaded
  // inside a course -- so the one primary action has to resolve to whichever
  // step the reader is actually missing. Branching here is the price of not
  // putting five equal buttons on the page and making them choose.
  function uploadAction() {
    if (owned.length === 1) {
      return (
        <ButtonLink tone="primary" size="lg" href={`/courses/${owned[0].id}`}>
          <UploadIcon size={18} />
          Upload lecture
        </ButtonLink>
      );
    }
    if (owned.length > 1) {
      return (
        <Button tone="primary" size="lg" onClick={() => setPickOpen(true)}>
          <UploadIcon size={18} />
          Upload lecture
        </Button>
      );
    }
    return (
      <Button tone="primary" size="lg" onClick={openCreate}>
        <PlusIcon size={18} />
        Create your first course
      </Button>
    );
  }

  return (
    <>
      {loading ? (
        <HomeSkeleton />
      ) : error ? (
        <Page>
          <PageHeader eyebrow={eyebrow} title="Your home" />
          <div role="alert" className="rounded-2xl border border-line bg-surface-raised p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-ink">Your home did not load.</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{error}</p>
                <Button className="mt-5" onClick={retry}>
                  Try again
                </Button>
              </div>
            </div>
          </div>
        </Page>
      ) : overview?.role === "student" ? (
        <StudentHome eyebrow={eyebrow} data={overview} onJoinCourse={openJoin} />
      ) : overview ? (
        <TeacherHome
          eyebrow={eyebrow}
          data={overview}
          primaryAction={uploadAction()}
          onCreateCourse={openCreate}
          onJoinCourse={openJoin}
        />
      ) : null}

      {/* The dialogs sit outside <Page> on purpose: they are fixed overlays,
          and a vertical-rhythm container has no business adding margin to
          something that is not in the flow. */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New course"
        description="Lectures are uploaded inside a course."
      >
        <form onSubmit={onCreate} className="space-y-4">
          <TextInput
            label="Course code"
            value={code}
            onChange={setCode}
            placeholder="PH101"
            required
            autoFocus
            disabled={creating}
          />
          <TextInput
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder="Electric Charges and Fields"
            required
            disabled={creating}
          />
          <TextInput
            label="Term"
            value={term}
            onChange={setTerm}
            placeholder="Autumn 2026"
            hint="Optional."
            disabled={creating}
          />
          <SelectInput
            label="Lecture language"
            value={language}
            onChange={setLanguage}
            options={LANGUAGE_OPTIONS}
            hint={LANGUAGE_HINT}
            disabled={creating}
          />
          {createError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
            >
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              {createError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button
              type="button"
              tone="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" tone="primary" disabled={creating}>
              {creating ? <Spinner size={16} /> : null}
              {creating ? "Creating" : "Create course"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join with a code"
        description="Your teacher hands out one code per course."
      >
        <form onSubmit={onJoin} className="space-y-4">
          <TextInput
            label="Join code"
            value={joinCode}
            onChange={setJoinCode}
            placeholder="a1b2c3d4"
            required
            autoFocus
            disabled={joining}
          />
          {joinError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
            >
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              {joinError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" tone="ghost" onClick={() => setJoinOpen(false)} disabled={joining}>
              Cancel
            </Button>
            <Button type="submit" tone="primary" disabled={joining}>
              {joining ? <Spinner size={16} /> : null}
              {joining ? "Joining" : "Join as student"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Only reached by a teacher with more than one course, where "upload"
          has no single honest destination. */}
      <Dialog
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title="Which course?"
        description="Upload happens inside a course."
      >
        <ul className="divide-y divide-line">
          {owned.map((course) => (
            <li key={course.id}>
              <Link
                href={`/courses/${course.id}`}
                onClick={() => setPickOpen(false)}
                className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-sunken"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">
                    {course.code}
                  </span>
                  <span className="block truncate text-[13px] text-ink-faint">{course.title}</span>
                </span>
                <ChevronRightIcon size={16} className="shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}

// Shaped like the header and the first list, so the page does not jump when the
// payload lands. Role-agnostic on purpose: the shell does not know which home
// it is about to render until the response arrives, and guessing would make the
// wrong half of the readers watch the layout rearrange itself.
function HomeSkeleton() {
  return (
    <Page>
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading your home.</span>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-3 h-9 w-72 max-w-full" />
            <Skeleton className="mt-4 h-4 w-56" />
          </div>
          <Skeleton className="h-12 w-48 rounded-xl" />
        </div>
      </div>
      <Card padded={false}>
        <ul className="divide-y divide-line">
          {[0, 1, 2, 3].map((row) => (
            <li key={row} className="p-4 sm:p-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2.5 h-3 w-1/3" />
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
