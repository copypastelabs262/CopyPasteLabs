"use client";

import { useEffect, useState } from "react";
import { mmss } from "./KnowledgePanel";

// "What all was taught in this lecture?"
//
// The answer is assembled from stored knowledge, not regenerated from the
// transcript. Nothing here is written by a model: every line is a phrase pulled
// out of a sentence the lecturer said, and clicking it seeks the audio to the
// second it was said at, so a reader can check any claim rather than trusting
// the summary.

interface Item {
  candidateId: string; kind: string; title: string; detail: string;
  evidenceStartMs: number; evidenceEndMs: number; evidenceText: string;
  confidence: number | null; reviewState: "unreviewed" | "confirmed" | "rejected";
}
interface Taught {
  lectureTitle: string;
  lessonScope: Item[]; mainTopics: Item[]; concepts: Item[];
  breakdowns: Item[]; comparisons: Item[]; references: Item[]; actionable: Item[];
  counts: { teaching: number; actionable: number; reference: number; rejected: number };
}

// Ordered as a student reads a set of notes: what the session was about, then
// the topics, then the detail, and the work at the end where it is looked for.
const SECTIONS: { key: keyof Omit<Taught, "lectureTitle" | "counts">; heading: string; blurb: string }[] = [
  { key: "lessonScope", heading: "What this lesson covers", blurb: "Stated by the lecturer" },
  { key: "mainTopics", heading: "Main topics taught", blurb: "" },
  { key: "concepts", heading: "Concepts explained", blurb: "" },
  { key: "breakdowns", heading: "Types and components", blurb: "" },
  { key: "comparisons", heading: "Distinctions drawn", blurb: "" },
  { key: "actionable", heading: "Assignments and instructions", blurb: "" },
  { key: "references", heading: "Mentioned in passing", blurb: "" },
];

export default function TaughtPanel({
  lectureId, version, onSeek,
}: { lectureId: string; version: number; onSeek: (ms: number) => void }) {
  const [taught, setTaught] = useState<Taught | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lectures/${lectureId}/taught`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok) throw new Error(b.error ?? "Could not load the lecture summary.");
        setTaught(b.taught);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
    // `version` is the refresh signal: a confirm or a re-extraction changes what
    // this panel should say, so it re-reads rather than going stale.
  }, [lectureId, version]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!taught) return <p className="text-sm text-zinc-500">Loading what was taught…</p>;

  const total = taught.counts.teaching + taught.counts.actionable + taught.counts.reference;
  if (total === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Nothing extracted from this lecture yet.
      </p>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          What was taught
          <span className="ml-2 font-normal normal-case text-zinc-400">
            {taught.counts.teaching} taught · {taught.counts.actionable} actionable
            {taught.counts.reference ? ` · ${taught.counts.reference} referenced` : ""}
          </span>
        </h2>
        <button onClick={() => setOpen(!open)} className="text-xs text-zinc-500 hover:underline">
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-5">
          {SECTIONS.map(({ key, heading, blurb }) => {
            const items = taught[key];
            if (!items.length) return null;
            return (
              <div key={key}>
                <h3 className="text-sm font-semibold">
                  {heading}
                  {blurb ? <span className="ml-2 text-xs font-normal text-zinc-400">{blurb}</span> : null}
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {items.map((i) => (
                    <li key={i.candidateId} className="flex items-baseline gap-2 text-sm">
                      <button
                        onClick={() => onSeek(i.evidenceStartMs)}
                        className="shrink-0 font-mono text-xs text-zinc-500 hover:underline"
                        title="Jump to this moment in the recording"
                      >
                        [{mmss(i.evidenceStartMs)}]
                      </button>
                      <span className="text-zinc-800 dark:text-zinc-200">{i.title}</span>
                      {/* An unreviewed item is labelled, always. This panel shows
                          faculty their own unconfirmed extractions so the queue
                          is navigable; it must never read as settled fact. */}
                      {i.reviewState === "unreviewed" ? (
                        <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-400">
                          unconfirmed
                        </span>
                      ) : null}
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
