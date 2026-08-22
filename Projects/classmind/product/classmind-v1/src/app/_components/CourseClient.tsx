"use client";

import { useCallback, useEffect, useState } from "react";
import FacultyWorkspace from "./FacultyWorkspace";
import StudentCourseView from "./StudentCourseView";

export interface CourseLecture {
  id: string; title: string; status: string; provider_status: string | null;
  original_filename: string; file_size_bytes: number; created_at: string;
  completed_at: string | null; error_message: string | null;
}
export interface CourseContextDoc {
  id: string; kind: string; title: string; body: string; created_at: string;
}
export interface CourseHeader {
  id: string; code: string; title: string; term: string | null;
  join_code?: string; transcription_language?: string;
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

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!course) return null;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl font-semibold">{course.code} — {course.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {course.term ?? "No term set"}
          {isOwner ? " · You teach this course" : " · Enrolled as a student"}
          {isOwner && course.join_code ? " · join code " : ""}
          {isOwner && course.join_code ? <code className="font-mono">{course.join_code}</code> : null}
        </p>
      </header>

      {isOwner ? (
        <FacultyWorkspace
          courseId={courseId} lectures={lectures} context={context} onChanged={refresh}
        />
      ) : (
        <StudentCourseView courseId={courseId} lectures={lectures} />
      )}
    </div>
  );
}
