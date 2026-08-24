"use client";

import { useState } from "react";
import { EvidenceSpans, KindBadge, UnitBody, type KnowledgeUnit } from "./KnowledgeUnit";

// The only review surface left.
//
// Sentence-level review is gone. A lecturer used to be handed ~32 cards — every
// topic, every definition, every aside — and asked to rule on each one; the
// predictable result was that nobody read past the first screen, so the items
// that actually mattered got the least attention. Now teaching enters the base
// automatically and only work with a consequence reaches this queue: an
// assignment, a deadline, an exam instruction.
//
// One card per reconstructed item, not per sentence. The four fragments that
// together describe one assignment are one decision here, with the fragments
// shown underneath as evidence.

interface Verdict {
  status: KnowledgeUnit["status"];
  title?: string;
  summary?: string;
  steps?: string[];
}
interface ReviewBody {
  action: "confirm" | "reject" | "edit";
  title?: string; summary?: string; steps?: string[];
}

export default function ActionableReview({
  units, onSeek, onReviewed,
}: {
  units: KnowledgeUnit[];
  onSeek: (ms: number) => void;
  onReviewed: () => void;
}) {
  // A verdict applied here and now, before the parent's refetch lands.
  //
  // The card has to LEAVE the queue the moment the write succeeds. Waiting for
  // the refetch is what made the old queue look broken: the counter dropped to
  // zero while the card sat exactly where it was, and "it worked" was
  // indistinguishable from "it did nothing".
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", summary: "", steps: "" });
  const [error, setError] = useState<string | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);

  const merged = units.map((u) => (verdicts[u.id] ? { ...u, ...verdicts[u.id] } : u));
  const pending = merged.filter((u) => u.status === "pending");
  // Only actionable items are ever gated, so filtering on the verdict rather
  // than on the category is enough — and stays right if the gate widens.
  const reviewed = merged.filter((u) => u.status === "confirmed" || u.status === "rejected");

  async function act(id: string, body: ReviewBody) {
    setBusy(id); setError(null);
    try {
      const r = await fetch(`/api/knowledge/${id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Review failed.");
      setVerdicts((v) => ({
        ...v,
        [id]: {
          status: b.item?.status ?? (body.action === "reject" ? "rejected" : "confirmed"),
          ...(body.action === "edit"
            ? { title: body.title, summary: body.summary, steps: body.steps }
            : {}),
        },
      }));
      setEditing(null);
      // The lecture page still refetches: this component's overlay is a
      // latency fix, not a second source of truth.
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(null); }
  }

  function card(u: KnowledgeUnit, ruled: boolean) {
    const isEditing = editing === u.id;
    return (
      <li
        key={u.id}
        className={
          "rounded-lg border p-4 " +
          (u.status === "rejected"
            ? "border-zinc-200 opacity-60 dark:border-zinc-800"
            : u.status === "confirmed"
              ? "border-green-300 dark:border-green-900"
              : "border-zinc-200 dark:border-zinc-800")
        }
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <KindBadge kind={u.kind} />
          <span className="font-medium">{u.title}</span>
          {u.confidence != null ? (
            <span className="text-xs text-zinc-400">confidence {u.confidence.toFixed(2)}</span>
          ) : null}
        </div>
        <UnitBody unit={u} />
        <EvidenceSpans evidence={u.evidence} onSeek={onSeek} />
        {ruled ? (
          <p className="mt-2 text-xs text-zinc-500">
            {u.status === "rejected" ? "Rejected — students never see this." : "Confirmed — live for students."}
            {" "}Rule again to change it.
          </p>
        ) : null}
        {isEditing ? (
          <EditForm
            draft={draft} setDraft={setDraft} busy={busy === u.id}
            onCancel={() => setEditing(null)}
            onSave={() => act(u.id, {
              action: "edit", title: draft.title, summary: draft.summary,
              // One step per line. A structured multi-input editor would be
              // more precise and far more friction for a three-step task.
              steps: draft.steps.split("\n").map((s) => s.trim()).filter(Boolean),
            })}
          />
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={busy !== null} onClick={() => act(u.id, { action: "confirm" })}
              className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              disabled={busy !== null}
              onClick={() => {
                setEditing(u.id);
                setDraft({ title: u.title, summary: u.summary, steps: u.steps.join("\n") });
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Edit
            </button>
            <button
              disabled={busy !== null} onClick={() => act(u.id, { action: "reject" })}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              Reject
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Needs your confirmation
        <span className="ml-2 font-normal normal-case text-zinc-400">
          {pending.length} waiting
          {reviewed.length ? ` · ${reviewed.length} reviewed` : ""}
        </span>
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Assignments, deadlines and exam instructions only. They stay invisible to students
        until you confirm them — everything else was published automatically.
      </p>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {/* An empty queue is the normal, healthy state, so it is phrased as one.
          "No items" reads like a failure; it usually means the lecture simply
          set no work. */}
      {pending.length === 0 ? (
        <p className="mt-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          Nothing is waiting for you.
          {reviewed.length
            ? " Everything actionable in this lecture has been ruled on."
            : " No assignment, deadline or exam instruction was reconstructed from this lecture."}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">{pending.map((u) => card(u, false))}</ul>
      )}

      {reviewed.length > 0 ? (
        <div className="mt-6">
          <button
            onClick={() => setShowReviewed(!showReviewed)}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            {showReviewed ? "Hide" : "Show"} {reviewed.length} already reviewed
          </button>
          {showReviewed ? (
            <ul className="mt-3 space-y-3">{reviewed.map((u) => card(u, true))}</ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

interface Draft { title: string; summary: string; steps: string }

// An edit is a confirmation in the lecturer's own words: the same route, the
// same single verdict, just different text. It never becomes a second concept.
function EditForm({
  draft, setDraft, busy, onCancel, onSave,
}: {
  draft: Draft; setDraft: (d: Draft) => void; busy: boolean;
  onCancel: () => void; onSave: () => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <input
        value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="Title"
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <textarea
        value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
        placeholder="What students have to do" rows={3}
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <textarea
        value={draft.steps} onChange={(e) => setDraft({ ...draft, steps: e.target.value })}
        placeholder="One step per line" rows={4}
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-700"
      />
      <p className="text-xs text-zinc-400">
        One step per line. The evidence spans above are never edited — they are what was said.
      </p>
      <div className="flex gap-2">
        <button
          disabled={busy || !draft.title.trim() || !draft.summary.trim()} onClick={onSave}
          className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save &amp; confirm
        </button>
        <button onClick={onCancel} className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          Cancel
        </button>
      </div>
    </div>
  );
}
