"use client";

import Link from "next/link";
import AskPanel from "./AskPanel";
import KnowledgePanel from "./KnowledgePanel";
import { formatWhen } from "./Input";
import type { CourseLecture } from "./CourseClient";

// A student sees stored course knowledge and published lectures. Nothing
// pending is merely hidden here -- the API never sends it to a non-owner.
//
// Asking comes first, because it is what a student actually arrives to do:
// "when is it due", "what did I miss". Browsing the confirmed list is the
// fallback for when they do not know what to ask.
export default function StudentCourseView({
  courseId, lectures,
}: { courseId: string; lectures: CourseLecture[] }) {
  return (
    <div className="space-y-10">
      <AskPanel courseId={courseId} />

      {/* `showAsk` is deliberately off: AskPanel is already mounted above, and
          two question boxes on one page is two places to look for the answer. */}
      <KnowledgePanel courseId={courseId} heading="Confirmed course information" />

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Lectures</h2>
        {lectures.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No published lectures yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {lectures.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                <div>
                  <Link href={`/courses/${courseId}/lectures/${l.id}`} className="font-medium hover:underline">
                    {l.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-zinc-500">{formatWhen(l.created_at)}</p>
                </div>
                <Link href={`/courses/${courseId}/lectures/${l.id}`} className="text-xs text-zinc-600 hover:underline dark:text-zinc-400">
                  Transcript
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
