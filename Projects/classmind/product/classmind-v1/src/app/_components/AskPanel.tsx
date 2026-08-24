"use client";

import { useState } from "react";
import { EvidenceSpans, KindBadge, UnitBody, type Evidence, type KnowledgeUnit } from "./KnowledgeUnit";

// LAYER 4 — asking the course's memory a question.
//
// The prose comes first because that is what was asked for; the sources come
// underneath because an answer nobody can check is worth less than no answer.
// Every claim carries a [n] that maps to a stored knowledge unit, and every
// unit opens to the verbatim spans it was built from, timestamped into the
// recording. Nothing here is retrieved from the transcript directly — the model
// only ever sees knowledge that was already reconstructed and, for anything
// actionable, confirmed by the lecturer.

// A cited unit. Same shape as a stored one minus the two fields the route does
// not send, plus the citation number the prose refers to.
type Source = Omit<KnowledgeUnit, "courseId" | "confidence"> & { ref: number };

interface Answer {
  question: string;
  answered: boolean;
  answer: string;
  sources: Source[];
  degraded: boolean;
  knowledgeUnitsAvailable: number;
}

// Deliberately the four questions the product exists to answer, phrased the way
// a student would type them. A blank box invites a blank stare; these say what
// kind of thing this can be asked.
const EXAMPLES = [
  "What was taught?",
  "What assignments were given?",
  "Was there a deadline?",
  "What do I need for the exam?",
];

export default function AskPanel({ courseId }: { courseId: string }) {
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<string | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setQ(text); setAsking(true); setError(null);
    try {
      const r = await fetch(`/api/courses/${courseId}/ask?q=${encodeURIComponent(text)}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Could not answer that.");
      setAnswer(b as Answer);
      setOpenSource(null);
    } catch (err) {
      setAnswer(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally { setAsking(false); }
  }

  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Ask this course</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Answered only from what was said in the lectures. If the lecturer did not say it,
        you will be told that rather than given a guess.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); void ask(q); }}
        className="mt-3 flex gap-2"
      >
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="What assignments were given?"
          className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
        />
        <button
          disabled={asking || !q.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {asking ? "Asking…" : "Ask"}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e} type="button" disabled={asking} onClick={() => void ask(e)}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            {e}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {answer ? <AnswerView answer={answer} courseId={courseId} openSource={openSource} setOpenSource={setOpenSource} /> : null}
    </section>
  );
}

function AnswerView({
  answer, courseId, openSource, setOpenSource,
}: {
  answer: Answer; courseId: string;
  openSource: string | null; setOpenSource: (id: string | null) => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
      {/* Said plainly, not hidden behind a subtle style change. A listing and a
          composed answer are different products, and a student who cannot tell
          which one they got will read the first line of a list as a conclusion. */}
      {answer.degraded ? (
        <p className="border-b border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No reasoning model answered, so this is a listing of the matching lecture knowledge
          rather than a written answer. Everything below is still what was said in class.
        </p>
      ) : null}

      {/* `whitespace-pre-wrap` because the degraded path returns one line per
          unit, and the model's prose sometimes contains a short list. */}
      <p className="whitespace-pre-wrap p-4 text-sm text-zinc-800 dark:text-zinc-200">
        {answer.answer}
      </p>

      {answer.sources.length ? (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
            What this is based on
          </p>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {answer.sources.map((s) => (
              <li key={s.id} className="p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {/* The number in the prose, so a reader can walk from a
                      sentence to the item it came from without guessing. */}
                  <span className="font-mono text-xs text-zinc-500">[{s.ref}]</span>
                  <KindBadge kind={s.kind} />
                  <span className="font-medium">{s.title}</span>
                  {s.status === "confirmed" ? (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] uppercase text-green-800 dark:bg-green-950 dark:text-green-400">
                      confirmed by lecturer
                    </span>
                  ) : null}
                </div>
                <UnitBody unit={s} />
                <p className="mt-2 text-xs text-zinc-500">{s.lectureTitle}</p>
                <button
                  onClick={() => setOpenSource(openSource === s.id ? null : s.id)}
                  className="mt-1 text-xs text-zinc-500 hover:underline"
                >
                  {openSource === s.id
                    ? "Hide evidence"
                    : `Show evidence (${s.evidence.length})`}
                </button>
                {openSource === s.id ? (
                  // No audio element on a course page, so each span is a deep
                  // link into the lecture at that millisecond instead.
                  <EvidenceSpans evidence={s.evidence as Evidence[]} courseId={courseId} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {answer.knowledgeUnitsAvailable === 0 ? (
        <p className="border-t border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
          This course has no stored lecture knowledge yet, so there is nothing to answer from.
        </p>
      ) : null}
    </div>
  );
}
