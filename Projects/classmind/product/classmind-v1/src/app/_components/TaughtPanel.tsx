"use client";

import { useState } from "react";
import { CATEGORY_LABEL } from "./Input";
import { EvidenceSpans, KindBadge, UnitBody, type KnowledgeUnit } from "./KnowledgeUnit";

// "What all was taught in this lecture?" — answered from stored knowledge.
//
// READ ONLY, deliberately. Teaching and reference knowledge enters the base at
// status `auto` and is never put to a vote: a lecturer cannot confirm thirty
// topics after every lecture, and the cost of a slightly clumsy topic summary
// is nothing next to the cost of the review queue going unread. Only work with
// a consequence attached — assignments, deadlines, exam instructions — is
// gated, and that lives in ActionableReview.
//
// Nothing here is invented. Every unit carries the verbatim spans it was built
// from, and each span seeks the audio, so any line can be checked rather than
// trusted.

// Teaching before reference: the first is what the lecture was for, the second
// is what it brushed past. Actionable is deliberately absent — showing it here
// as well would put the same assignment on the page twice, once reviewable and
// once not.
const SECTIONS: ("teaching" | "reference")[] = ["teaching", "reference"];

export default function TaughtPanel({
  units, loading, error, onSeek,
}: {
  units: KnowledgeUnit[];
  loading: boolean;
  error: string | null;
  onSeek: (ms: number) => void;
}) {
  const [open, setOpen] = useState(true);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (loading) return <p className="text-sm text-zinc-500">Loading lecture knowledge…</p>;

  const counts = {
    teaching: units.filter((u) => u.category === "teaching").length,
    reference: units.filter((u) => u.category === "reference").length,
    actionable: units.filter((u) => u.category === "actionable").length,
  };

  if (units.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Lecture knowledge</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Nothing reconstructed from this lecture yet — the knowledge pass runs after
          transcription and candidate detection complete.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Lecture knowledge
          <span className="ml-2 font-normal normal-case text-zinc-400">
            {counts.teaching} taught
            {counts.reference ? ` · ${counts.reference} referenced` : ""}
            {counts.actionable ? ` · ${counts.actionable} actionable` : ""}
          </span>
        </h2>
        <button onClick={() => setOpen(!open)} className="text-xs text-zinc-500 hover:underline">
          {open ? "Collapse" : "Expand"}
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Stored automatically and visible to your students. Nothing here needs your confirmation.
      </p>

      {open ? (
        <div className="mt-3 space-y-6">
          {SECTIONS.map((category) => {
            const group = units.filter((u) => u.category === category);
            if (!group.length) return null;
            return (
              <div key={category}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {CATEGORY_LABEL[category]}
                  <span className="ml-2 font-normal text-zinc-400">{group.length}</span>
                </h3>
                <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {group.map((u) => (
                    <li key={u.id} className="p-4">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <KindBadge kind={u.kind} />
                        <span className="font-medium">{u.title}</span>
                      </div>
                      <UnitBody unit={u} />
                      <EvidenceSpans evidence={u.evidence} onSeek={onSeek} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
