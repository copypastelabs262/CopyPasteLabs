"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import FacultyWorkspace from "./FacultyWorkspace";
import StudentCourseView from "./StudentCourseView";
import { Button, Card, Page, PageHeader, Skeleton } from "@/app/_components/ui";
import { AlertIcon, CheckIcon, KeyIcon } from "@/app/_components/ui/icons";

export interface CourseLecture {
  id: string; title: string; status: string; provider_status: string | null;
  original_filename: string; file_size_bytes: number; created_at: string;
  completed_at: string | null; error_message: string | null;
  // Optional because it arrived later than the rest of the row: the course
  // route already selects it, and nothing that consumes this type may assume
  // an older payload carried it.
  recorded_on?: string | null;
}
export interface CourseContextDoc {
  id: string; kind: string; title: string; body: string; created_at: string;
}
export interface CourseHeader {
  id: string; code: string; title: string; term: string | null;
  join_code?: string; transcription_language?: string;
}

// Module scope, so both are stable identities: a subscribe or snapshot
// function rebuilt each render makes `useSyncExternalStore` re-subscribe on
// every pass.
const neverChanges = () => () => {};
const hasClipboard = () => typeof navigator.clipboard?.writeText === "function";

// The join code is the one thing a lecturer comes back to this screen to read
// out loud, and it used to be buried mid-sentence in the subtitle beside the
// term. It gets a frame of its own so it can be found at a glance.
//
// The code stays real, selectable text rather than living inside the button:
// `navigator.clipboard` is absent on an insecure origin and can be refused
// outright, and a lecturer reading the code off a projector has to work in
// both cases.
function JoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [copyRefused, setCopyRefused] = useState(false);

  // The server has no `navigator`, so this answer legitimately differs between
  // the two renders. `useSyncExternalStore` is the one hook allowed to say so:
  // it hands React a server snapshot to hydrate against and the real value
  // immediately after, instead of a mount effect that flips state and makes
  // every render cascade.
  const clipboardAvailable = useSyncExternalStore(neverChanges, hasClipboard, () => false);
  const canCopy = clipboardAvailable && !copyRefused;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-3.5 py-2.5">
      <KeyIcon size={16} className="shrink-0 text-ink-faint" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-[0.08em] text-ink-faint uppercase">Join code</p>
        <p className="font-mono text-sm tracking-wide text-ink select-all">{code}</p>
      </div>
      {canCopy ? (
        <Button
          tone="secondary"
          size="sm"
          aria-live="polite"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            } catch {
              // Permission refused, or a clipboard that exists but will not
              // write. Nothing to report and nothing to throw -- drop the
              // button and leave the code to be selected by hand.
              setCopyRefused(true);
            }
          }}
        >
          {copied ? (
            <>
              <CheckIcon size={14} />
              Copied
            </>
          ) : (
            "Copy"
          )}
        </Button>
      ) : null}
    </div>
  );
}

// Shaped like the course that is about to replace it -- a header block and a
// few rows -- so the page does not jump when the payload lands. The word
// "Loading" would be honest and would also guarantee that jump.
function CourseSkeleton() {
  return (
    <div role="status" aria-label="Loading the course">
      <Page>
        <div>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-10 w-full max-w-sm" />
          <Skeleton className="mt-4 h-4 w-56" />
        </div>
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {[0, 1, 2].map((row) => (
              <li key={row} className="flex items-start gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="mt-3 h-3 w-40" />
                </div>
                <Skeleton className="h-8 w-16 shrink-0" />
              </li>
            ))}
          </ul>
        </Card>
      </Page>
    </div>
  );
}

export default function CourseClient({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<CourseHeader | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [lectures, setLectures] = useState<CourseLecture[]>([]);
  const [context, setContext] = useState<CourseContextDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses/${courseId}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok) throw new Error(b.error ?? "Could not load the course.");
        setCourse(b.course); setIsOwner(Boolean(b.isOwner));
        setLectures(b.lectures ?? []); setContext(b.context ?? []); setError(null);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, version]);

  if (loading) return <CourseSkeleton />;

  if (error) {
    return (
      <Page>
        <Card>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-danger">
              <AlertIcon size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-ink">This course could not be loaded.</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{error}</p>
              <Button
                className="mt-5"
                onClick={() => {
                  // Back to the skeleton, then the same fetch the mount ran.
                  // Retrying against a stale error on screen reads as a button
                  // that did nothing.
                  setError(null);
                  setLoading(true);
                  refresh();
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        </Card>
      </Page>
    );
  }

  if (!course) return null;

  return (
    <Page>
      <PageHeader
        eyebrow={course.code}
        title={course.title}
        subtitle={`${course.term ?? "No term set"} · ${isOwner ? "You teach this course" : "Enrolled as a student"}`}
        action={isOwner && course.join_code ? <JoinCode code={course.join_code} /> : undefined}
      />

      {isOwner ? (
        <FacultyWorkspace
          courseId={courseId} lectures={lectures} context={context} onChanged={refresh}
        />
      ) : (
        <StudentCourseView courseId={courseId} lectures={lectures} />
      )}
    </Page>
  );
}
