"use client";

import { useCallback, useEffect, useState } from "react";
import RunDetails from "./RunDetails";
import {
  formatBytes,
  formatWhen,
  type RunSummary,
  type RunView,
} from "./shared";

// Minimal list of what has been uploaded, backed entirely by the existing
// `runs` table and GET /api/runs. No new table, no search, no filters.
export default function LectureLibrary({ refreshKey }: { refreshKey: number }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<RunView | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // Bumped by the Refresh button. Refetching is driven entirely by this effect
  // rather than by a callback the button and the effect both invoke, so every
  // setState here happens inside a promise callback -- which is what
  // react-hooks/set-state-in-effect allows.
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/runs")
      .then((response) =>
        response
          .json()
          .then((body: { runs?: RunSummary[]; error?: string }) => {
            if (!response.ok) {
              throw new Error(body.error ?? `List failed: ${response.status}`);
            }
            return body;
          }),
      )
      .then((body) => {
        if (cancelled) return;
        setRuns(body.runs ?? []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setRuns([]);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, reloadCount]);

  const open = useCallback(async (runId: string) => {
    setOpening(runId);
    try {
      const response = await fetch(`/api/runs/${runId}`);
      const data = (await response.json()) as RunView & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Open failed: ${response.status}`);
      setOpened(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpening(null);
    }
  }, []);

  if (opened) {
    return (
      <section className="space-y-4">
        <button
          onClick={() => setOpened(null)}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Back to lecture library
        </button>
        <RunDetails run={opened} />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Uploaded lectures
        </h2>
        <button
          onClick={() => setReloadCount((c) => c + 1)}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}

      {runs === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-zinc-500">No lectures uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {runs.map((run) => (
            <li
              key={run.runId}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{run.originalFilename}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatWhen(run.createdAt)} · {formatBytes(run.fileSizeBytes)} ·{" "}
                  {run.status}
                  {run.providerStatus ? ` · ${run.providerStatus}` : ""}
                  {run.detectedLanguage ? ` · ${run.detectedLanguage}` : ""}
                </p>
              </div>
              <button
                onClick={() => void open(run.runId)}
                disabled={opening === run.runId}
                className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {opening === run.runId ? "Opening…" : "View"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
