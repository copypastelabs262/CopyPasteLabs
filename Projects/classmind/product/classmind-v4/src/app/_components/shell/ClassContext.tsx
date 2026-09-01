"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { CourseContextDoc, CourseHeader, CourseLecture } from "../CourseClient";

// ONE fetch of the course, shared by the shell and every tab under it.
//
// v3's CourseClient owned this request and its page alone consumed it. In the
// v4 shell the same payload feeds the context header, the Home stream, the
// Lectures tab and the Assignments tab — so it moves up here, fetched once,
// and the tabs read it from context. The shell and its tabs therefore cannot
// disagree about what the course contains, and switching tabs costs no
// request at all.
//
// `refresh` bumps a version counter exactly as CourseClient's did; anything
// that changes the course (an upload completing, context added) calls it and
// every consumer sees the new payload together.

export interface ClassData {
  courseId: string;
  course: CourseHeader | null;
  isOwner: boolean;
  lectures: CourseLecture[];
  context: CourseContextDoc[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Restart from the skeleton after an error — used by the shell's retry. */
  retry: () => void;
}

const ClassDataContext = createContext<ClassData | null>(null);

export function useClassData(): ClassData {
  const value = useContext(ClassDataContext);
  if (!value) {
    // Loud and local: a tab rendered outside the shell is a wiring bug, and a
    // silent empty screen would send the reader hunting through data code.
    throw new Error("useClassData must be used inside <ClassDataProvider>.");
  }
  return value;
}

export function ClassDataProvider({
  courseId, children,
}: { courseId: string; children: React.ReactNode }) {
  const [course, setCourse] = useState<CourseHeader | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [lectures, setLectures] = useState<CourseLecture[]>([]);
  const [context, setContext] = useState<CourseContextDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);

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

  return (
    <ClassDataContext.Provider
      value={{ courseId, course, isOwner, lectures, context, loading, error, refresh, retry }}
    >
      {children}
    </ClassDataContext.Provider>
  );
}
