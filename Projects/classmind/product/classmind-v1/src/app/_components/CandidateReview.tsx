"use client";

import { useState } from "react";
import { mmss } from "./KnowledgePanel";
import { KIND_LABEL } from "./Input";

export interface Candidate {
  id: string; kind: string; title: string; detail: string;
  due_phrase: string | null; due_resolved: string | null;
  evidence_start_ms: number; evidence_end_ms: number; evidence_text: string;
  confidence: number | null; matched_cue: string | null;
  extraction_method: string; extraction_version: string;
}
export interface Review {
  id: string; candidate_id: string; action: string;
  final_title: string | null; note: string | null; created_at: string;
}

const KINDS = ["assignment", "deadline", "exam_scope", "announcement", "guidance"];

// Faculty review. Every action INSERTS a verdict; the candidate row is never
// mutated, so what the machine proposed stays readable forever alongside what
// the human decided (Capture Contract Article 5).
export default function CandidateReview({
  candidates, reviews, onSeek, onReviewed,
}: {
  candidates: Candidate[]; reviews: Review[];
  onSeek: (ms: number) => void; onReviewed: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ kind: "assignment", title: "", detail: "", duePhrase: "" });
  const [error, setError] = useState<string | null>(null);

  const latest = new Map<string, Review>();
  for (const r of reviews) if (!latest.has(r.candidate_id)) latest.set(r.candidate_id, r);

  async function act(candidateId: string, body: Record<string, unknown>) {
    setBusy(candidateId); setError(null);
    try {
      const r = await fetch(`/api/candidates/${candidateId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Review failed.");
      setEditing(null); onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(null); }
  }

  const pending = candidates.filter((c) => !latest.has(c.id));
  const ruled = candidates.filter((c) => latest.has(c.id));

  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Candidates for review
        <span className="ml-2 font-normal normal-case text-zinc-400">
          {pending.length} pending · {ruled.length} ruled
        </span>
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Nothing here is visible to students. An item reaches the course only when you confirm it.
      </p>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {!candidates.length ? (
        <p className="mt-3 text-sm text-zinc-500">
          No candidates yet — extraction runs after transcription completes.
        </p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {[...pending, ...ruled].map((c) => {
          const verdict = latest.get(c.id);
          const isEditing = editing === c.id;
          return (
            <li
              key={c.id}
              className={
                "rounded-lg border p-4 " +
                (verdict?.action === "reject"
                  ? "border-zinc-200 opacity-60 dark:border-zinc-800"
                  : verdict
                    ? "border-green-300 dark:border-green-900"
                    : "border-zinc-200 dark:border-zinc-800")
              }
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {KIND_LABEL[c.kind] ?? c.kind}
                </span>
                <span className="font-medium">{c.title}</span>
                {c.due_phrase ? (
                  <span className="text-sm text-amber-700 dark:text-amber-400">
                    &ldquo;{c.due_phrase}&rdquo;
                  </span>
                ) : null}
                <button
                  onClick={() => onSeek(c.evidence_start_ms)}
                  className="ml-auto font-mono text-xs text-zinc-500 hover:underline"
                >
                  [{mmss(c.evidence_start_ms)}]
                </button>
              </div>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{c.detail}</p>
              <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">Evidence &mdash; what was actually said</p>
                <p className="mt-1 text-sm italic text-zinc-700 dark:text-zinc-300">
                  &ldquo;{c.evidence_text}&rdquo;
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  {c.extraction_method} v{c.extraction_version}
                  {c.matched_cue ? ` · cue: ${c.matched_cue}` : ""}
                  {c.confidence != null ? ` · confidence ${Number(c.confidence).toFixed(2)}` : ""}
                </p>
              </div>
              {verdict ? (
                <p className="mt-2 text-xs text-zinc-500">
                  {verdict.action === "reject" ? "Rejected" : verdict.action === "edit" ? "Edited and confirmed" : "Confirmed"}
                  {verdict.note ? ` · ${verdict.note}` : ""} · rule again to change this
                </p>
              ) : null}
              {isEditing ? (
                <EditForm
                  draft={draft} setDraft={setDraft} busy={busy === c.id}
                  onCancel={() => setEditing(null)}
                  onSave={() => act(c.id, {
                    action: "edit", kind: draft.kind, title: draft.title,
                    detail: draft.detail, duePhrase: draft.duePhrase || null,
                  })}
                />
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={busy === c.id} onClick={() => act(c.id, { action: "confirm" })}
                    className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    disabled={busy === c.id}
                    onClick={() => {
                      setEditing(c.id);
                      setDraft({ kind: c.kind, title: c.title, detail: c.detail, duePhrase: c.due_phrase ?? "" });
                    }}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Edit
                  </button>
                  <button
                    disabled={busy === c.id} onClick={() => act(c.id, { action: "reject" })}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface Draft { kind: string; title: string; detail: string; duePhrase: string }

// An edit is a confirmation with different words, not a separate concept: it
// still produces one verdict row, so the audit trail stays uniform.
function EditForm({
  draft, setDraft, busy, onCancel, onSave,
}: {
  draft: Draft; setDraft: (d: Draft) => void; busy: boolean;
  onCancel: () => void; onSave: () => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <select
        value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      >
        {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select>
      <input
        value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="Title"
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <textarea
        value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
        placeholder="Detail" rows={3}
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      {/* Stays the spoken phrase, never a resolved date -- Capture Contract
          Article 4 keeps "next Thursday" alongside anything derived from it. */}
      <input
        value={draft.duePhrase} onChange={(e) => setDraft({ ...draft, duePhrase: e.target.value })}
        placeholder="Due phrase, as spoken"
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <div className="flex gap-2">
        <button
          disabled={busy} onClick={onSave}
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
