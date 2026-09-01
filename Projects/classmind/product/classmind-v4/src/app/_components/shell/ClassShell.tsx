"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Card, Skeleton, cx, termLabel } from "@/app/_components/ui";
import { AlertIcon, CheckIcon, KeyIcon } from "@/app/_components/ui/icons";
import { ClassDataProvider, useClassData } from "./ClassContext";

// THE CLASS SHELL — v4's structural change.
//
// Grammar (see V4-ARCHITECTURE.md and .knowledge/design/teams-grammar/):
//
//   class rail (which classes exist, where am I)
//     → context header (which class this is — persistent, never rediscovered)
//       → tab bar (the four things a person does in a class)
//         → the tab's own surface
//
// The shell is chrome, so it stays quiet: no glass beyond what the tokens
// already grant chrome, no decoration, hierarchy carried by type and space.
// Every destination inside a class renders through this component, including
// the lecture detail page — which is what keeps "where am I" answered even
// three levels deep.

interface RailCourse {
  id: string; code: string; title: string; term: string | null;
}

const TABS = [
  { slug: "", label: "Home" },
  { slug: "/ask", label: "Ask" },
  { slug: "/lectures", label: "Lectures" },
  { slug: "/assignments", label: "Assignments" },
] as const;

// ---------------------------------------------------------------- join code
// Moved verbatim from v3's CourseClient (now retired): the code stays real,
// selectable text, and the copy button withdraws itself where the clipboard is
// absent or refuses.

const neverChanges = () => () => {};
const hasClipboard = () => typeof navigator.clipboard?.writeText === "function";

function JoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [copyRefused, setCopyRefused] = useState(false);
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
              setCopyRefused(true);
            }
          }}
        >
          {copied ? (<><CheckIcon size={14} />Copied</>) : "Copy"}
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- the rail

// The user's classes, fetched once per shell mount. Deliberately its own
// request rather than a prop from the server layout: the list is the same for
// every class the user visits, the browser caches nothing across layouts
// anyway, and the rail failing must never take the class itself down — a rail
// that cannot load renders nothing and the page still works.
function useMyCourses(): { owned: RailCourse[]; enrolled: RailCourse[]; loaded: boolean } {
  const [state, setState] = useState<{ owned: RailCourse[]; enrolled: RailCourse[]; loaded: boolean }>(
    { owned: [], enrolled: [], loaded: false },
  );
  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (cancelled || !b) return;
        setState({ owned: b.owned ?? [], enrolled: b.enrolled ?? [], loaded: true });
      })
      .catch(() => { if (!cancelled) setState((s) => ({ ...s, loaded: true })); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

function RailGroup({
  label, courses, activeId,
}: { label: string; courses: RailCourse[]; activeId: string }) {
  if (!courses.length) return null;
  return (
    <div>
      <p className="px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">{label}</p>
      <ul className="mt-1.5 space-y-0.5">
        {courses.map((c) => {
          const active = c.id === activeId;
          return (
            <li key={c.id}>
              <Link
                href={`/courses/${c.id}`}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block rounded-lg px-3 py-2 transition-colors",
                  active ? "bg-surface-raised text-ink" : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
                )}
              >
                <span className="block truncate text-[13px] font-medium leading-snug">{c.title}</span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                  {c.code}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ClassRail({ activeId }: { activeId: string }) {
  const { owned, enrolled, loaded } = useMyCourses();
  return (
    <nav aria-label="Your classes" className="space-y-6">
      <Link
        href="/courses"
        className="block px-3 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink"
      >
        &larr; All classes
      </Link>
      {!loaded ? (
        <div className="space-y-2 px-3" aria-hidden="true">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-4/5" />
        </div>
      ) : (
        <>
          <RailGroup label="Teaching" courses={owned} activeId={activeId} />
          <RailGroup label="Enrolled" courses={enrolled} activeId={activeId} />
        </>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------- header + tabs

function ClassHeader() {
  const { course, isOwner, loading } = useClassData();
  if (loading) {
    return (
      <div role="status" aria-label="Loading the course">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="mt-2.5 h-8 w-full max-w-sm" />
        <Skeleton className="mt-3 h-3.5 w-48" />
      </div>
    );
  }
  if (!course) return null;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <p className="eyebrow-mono">{course.code}</p>
        <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {course.title}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {termLabel(course.term) ?? "No term set"} ·{" "}
          {isOwner ? "You teach this course" : "Enrolled as a student"}
        </p>
      </div>
      {isOwner && course.join_code ? (
        <div className="hidden sm:block">
          <JoinCode code={course.join_code} />
        </div>
      ) : null}
    </div>
  );
}

function ClassTabs({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const base = `/courses/${courseId}`;
  return (
    <nav aria-label="Class sections" className="border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const href = `${base}${t.slug}`;
          // Home is exact; the others own their subtree, so the lecture detail
          // page lights the Lectures tab.
          const active = t.slug === "" ? pathname === base : pathname.startsWith(href);
          return (
            <li key={t.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors",
                  active
                    ? "border-accent font-medium text-ink"
                    : "border-transparent text-ink-soft hover:border-line hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------- error

function ClassError() {
  const { error, retry } = useClassData();
  if (!error) return null;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-danger">
          <AlertIcon size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink">This course could not be loaded.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{error}</p>
          <Button className="mt-5" onClick={retry}>Try again</Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the shell

function ShellFrame({ courseId, children }: { courseId: string; children: React.ReactNode }) {
  const { error } = useClassData();
  return (
    <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-12">
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <ClassRail activeId={courseId} />
        </div>
      </aside>

      <div className="min-w-0">
        {error ? (
          <ClassError />
        ) : (
          <>
            <ClassHeader />
            <div className="mt-8">
              <ClassTabs courseId={courseId} />
            </div>
            <div className="mt-10">{children}</div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ClassShell({
  courseId, children,
}: { courseId: string; children: React.ReactNode }) {
  return (
    <ClassDataProvider courseId={courseId}>
      <ShellFrame courseId={courseId}>{children}</ShellFrame>
    </ClassDataProvider>
  );
}
