"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 5000;

// Drives a lecture from `transcribing` to `ready` from whatever page is open.
//
// There is no worker process: provider_job_id lives on the lecture row, so
// advancing a lecture is just "someone with the owner's session asks again".
// The upload widget polls its own upload, but that is the one case that always
// works -- close the tab, reload, or come back tomorrow and the job has long
// since finished with nothing to notice. This component is what makes the
// status on screen a live one rather than a snapshot of the moment the row was
// last written.
//
// Owner-only by construction: both routes it calls are behind requireCourseOwner
// and would 403 for a student.
export default function LectureProgress({
  lectureId, status, onAdvanced,
}: { lectureId: string; status: string; onAdvanced: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const extract = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/lectures/${lectureId}/extract`, { method: "POST" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Extraction failed.");
      // A re-run against a method+version that already read this lecture is
      // skipped rather than duplicated. Say so instead of reporting a silent
      // success that produced nothing.
      setNote(b.skipped
        ? (b.message as string)
        : `${b.candidateCount} candidate${b.candidateCount === 1 ? "" : "s"} proposed for review.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      // Re-read either way. On success the lecture is `ready`; on failure it is
      // still `transcribed` and needs the retry button back. Both are the
      // server's answer rather than a guess made here.
      onAdvanced();
    }
  }, [lectureId, onAdvanced]);

  useEffect(() => {
    if (status !== "transcribing") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const r = await fetch(`/api/lectures/${lectureId}/poll`, { method: "POST" });
        const b = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(b.error ?? "Poll failed.");
        setNote((b.providerStatus as string) ?? null); setError(null);
        if (b.status === "transcribed") {
          // Extraction follows transcription without asking, exactly as it does
          // in the upload widget. It produces CANDIDATES only, so nothing
          // reaches a student from this call.
          await extract();
          return;
        }
        if (b.status !== "transcribing") { onAdvanced(); return; }
      } catch (err) {
        // A failed poll is a transport problem, not a failed lecture -- the
        // route deliberately leaves the row in `transcribing` for exactly this
        // reason, so show the error and keep asking.
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [lectureId, status, extract, onAdvanced]);

  if (status === "transcribing") {
    return (
      <p className="mt-1 text-xs text-zinc-500">
        Transcribing{note ? ` · ${note}` : ""} · checking every {POLL_MS / 1000}s
        {error ? <span className="text-red-600 dark:text-red-400"> · {error}</span> : null}
      </p>
    );
  }

  // `transcribed` with no extraction is the state a closed tab leaves behind.
  // It is not an error and it is not finished, so it gets an action rather than
  // a label.
  if (status === "transcribed") {
    return (
      <div className="mt-2">
        <button
          onClick={extract} disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {busy ? "Extracting…" : "Extract candidates"}
        </button>
        {note ? <p className="mt-1 text-xs text-zinc-500">{note}</p> : null}
        {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
    );
  }

  return note ? <p className="mt-1 text-xs text-zinc-500">{note}</p> : null;
}
