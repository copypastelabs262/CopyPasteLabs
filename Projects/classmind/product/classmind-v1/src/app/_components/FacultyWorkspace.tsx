"use client";

import { useState } from "react";
import Link from "next/link";
import LectureUpload from "./LectureUpload";
import KnowledgePanel from "./KnowledgePanel";
import { Input, TextArea, formatBytes, formatWhen } from "./Input";
import type { CourseContextDoc, CourseLecture } from "./CourseClient";

const CONTEXT_KINDS = ["syllabus", "policy", "schedule", "note"] as const;

const STATUS_LABEL: Record<string, string> = {
  pending_upload: "Awaiting upload",
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  transcribed: "Transcribed — review candidates",
  extracting: "Extracting",
  ready: "Published",
  failed: "Failed",
};

export default function FacultyWorkspace({
  courseId, lectures, context, onChanged,
}: {
  courseId: string; lectures: CourseLecture[]; context: CourseContextDoc[]; onChanged: () => void;
}) {
  const [kind, setKind] = useState<string>("syllabus");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-2">
        <LectureUpload courseId={courseId} onComplete={onChanged} />

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              const r = await fetch(`/api/courses/${courseId}/context`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, title, body }),
              });
              const b = await r.json();
              if (!r.ok) throw new Error(b.error ?? "Could not save.");
              setTitle(""); setBody(""); onChanged();
            } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
          }}
          className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Course context</h2>
          <p className="text-xs text-zinc-500">
            Syllabus, policies and schedules. Context informs extraction only — it never
            touches transcription, so it cannot alter what the recording says.
          </p>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">Kind</label>
            <select
              value={kind} onChange={(e) => setKind(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm capitalize dark:border-zinc-700"
            >
              {CONTEXT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <Input label="Title" value={title} onChange={setTitle} placeholder="Assessment policy" required />
          <TextArea label="Body" value={body} onChange={setBody} rows={5}
            placeholder="Assignments are submitted on the LMS. Late work loses 10% per day." />
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <button className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
            Add context
          </button>

          {context.length ? (
            <ul className="mt-4 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              {context.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {c.kind}
                  </span>{" "}
                  <span className="font-medium">{c.title}</span>
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Lectures</h2>
        {lectures.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No lectures yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {lectures.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/courses/${courseId}/lectures/${l.id}`} className="font-medium hover:underline">
                    {l.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatWhen(l.created_at)} · {formatBytes(l.file_size_bytes)} ·{" "}
                    {STATUS_LABEL[l.status] ?? l.status}
                    {l.provider_status ? ` · ${l.provider_status}` : ""}
                  </p>
                  {l.error_message ? (
                    <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{l.error_message}</p>
                  ) : null}
                </div>
                <Link
                  href={`/courses/${courseId}/lectures/${l.id}`}
                  className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <KnowledgePanel courseId={courseId} heading="Confirmed course knowledge" showAsk />
    </div>
  );
}
