"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AskPanel from "./AskPanel";
import { KIND_LABEL } from "./Input";

export interface KnowledgeItem {
  candidateId: string; kind: string; title: string; detail: string;
  duePhrase: string | null; dueResolved: string | null;
  lectureId: string; lectureTitle: string;
  evidenceStartMs: number; evidenceEndMs: number; evidenceText: string;
  extractionMethod: string; extractionVersion: string;
  confirmedAt: string; wasEdited: boolean;
}

export function mmss(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// KIND_LABEL is declared in the order faculty think in -- what is owed first,
// advice last -- so its key order is also the order the groups read in.
const KIND_ORDER = Object.keys(KIND_LABEL);

function byKind(items: KnowledgeItem[]): [string, KnowledgeItem[]][] {
  const groups = new Map<string, KnowledgeItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.kind);
    if (bucket) bucket.push(item);
    else groups.set(item.kind, [item]);
  }
  const rank = (kind: string) => {
    const i = KIND_ORDER.indexOf(kind);
    // A kind the extractor grew but this UI has not learned yet still has to
    // appear, so it sorts last rather than being dropped.
    return i === -1 ? KIND_ORDER.length : i;
  };
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0]));
}

export function KnowledgeCard({
  item, courseId, defaultOpen, hideKind,
}: {
  item: KnowledgeItem; courseId: string;
  defaultOpen?: boolean; hideKind?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* Dropped under a group heading that already says it, kept in answer
            results, which are ranked across kinds and have no heading. */}
        {hideKind ? null : (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {KIND_LABEL[item.kind] ?? item.kind}
          </span>
        )}
        <span className="font-medium">{item.title}</span>
        {item.duePhrase ? (
          <span className="text-sm text-amber-700 dark:text-amber-400">&ldquo;{item.duePhrase}&rdquo;</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{item.detail}</p>

      <button onClick={() => setOpen((o) => !o)} className="mt-2 text-xs text-zinc-500 hover:underline">
        {open ? "Hide evidence" : "Show evidence"}
      </button>

      {open ? (
        <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500">
            {item.lectureTitle} · spoken at <span className="font-mono">{mmss(item.evidenceStartMs)}</span>
          </p>
          {/* The verbatim span, uncleaned. What the lecturer actually said --
              not a paraphrase, and not the confirmed wording shown above. */}
          <p className="mt-1 italic text-zinc-700 dark:text-zinc-300">&ldquo;{item.evidenceText}&rdquo;</p>
          <Link
            href={`/courses/${courseId}/lectures/${item.lectureId}?t=${item.evidenceStartMs}`}
            className="mt-2 inline-block text-xs font-medium hover:underline"
          >
            Open transcript at {mmss(item.evidenceStartMs)} &rarr;
          </Link>
          <p className="mt-2 text-xs text-zinc-400">
            Extracted by {item.extractionMethod} v{item.extractionVersion}
            {item.wasEdited ? " · edited by faculty before publishing" : " · confirmed by faculty"}
          </p>
        </div>
      ) : null}
    </li>
  );
}

export default function KnowledgePanel({
  courseId, heading, showAsk,
}: { courseId: string; heading: string; showAsk?: boolean }) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses/${courseId}/knowledge`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok) throw new Error(b.error ?? "Could not load knowledge.");
        setItems(b.items ?? []); setError(null);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId]);

  return (
    <div className="space-y-8">
      {/* Asking is Layer 4: it answers from reconstructed knowledge units, which
          is a different store from the confirmed-candidate list below. Kept as
          one component so faculty and students get the identical answer surface
          rather than two that drift apart. Above the list, not inside it -- the
          question is what a reader came for; the list is what they fall back to. */}
      {showAsk ? <AskPanel courseId={courseId} /> : null}

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{heading}</h2>

        {loading ? <p className="mt-3 text-sm text-zinc-500">Loading…</p> : null}
        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        {!loading && !items.length ? (
          <p className="mt-3 text-sm text-zinc-500">
            Nothing confirmed yet. Items appear here only after faculty confirm them.
          </p>
        ) : null}

        {/* Grouped by kind rather than listed flat: a student arrives asking one
            question -- what do I owe, and when -- and a single list of mixed
            assignments, exam scope and asides makes them read all of it to find
            out. */}
        {items.length ? (
          <div className="mt-3 space-y-6">
            {byKind(items).map(([kind, group]) => (
              <div key={kind}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {KIND_LABEL[kind] ?? kind}
                  <span className="ml-2 font-normal text-zinc-400">{group.length}</span>
                </h3>
                <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {group.map((i) => (
                    <KnowledgeCard key={i.candidateId} item={i} courseId={courseId} hideKind />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
