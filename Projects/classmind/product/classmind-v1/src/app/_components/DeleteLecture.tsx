"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Deleting a recording. Deliberately awkward, because it is irreversible: the
// audio, the raw transcript, every extracted candidate and every verdict on
// them go together, and none of it can be recovered.
//
// The confirmation asks the user to type the lecture's title rather than
// clicking "yes". A dialog that can be dismissed by reflex is not a
// confirmation, and the one failure this guards against -- deleting the wrong
// lecture -- is precisely the one a reflexive click produces.
export default function DeleteLecture({
  lectureId, lectureTitle, courseId, candidateCount,
}: { lectureId: string; lectureTitle: string; courseId: string; candidateCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === lectureTitle.trim();

  async function remove() {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/lectures/${lectureId}`, { method: "DELETE" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Delete failed.");
      // Back to the course, and refresh so the lecture list re-reads rather
      // than showing a row that no longer exists.
      router.push(`/courses/${courseId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTyped(""); setError(null); }}
        className="text-xs text-red-700 hover:underline dark:text-red-400"
      >
        Delete this recording
      </button>
    );
  }

  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
      <p className="text-sm font-medium text-red-900 dark:text-red-300">
        Delete &ldquo;{lectureTitle}&rdquo; permanently?
      </p>
      <p className="mt-1 text-xs text-red-800 dark:text-red-400">
        This removes the audio file from storage, the raw transcript, and{" "}
        {candidateCount} extracted {candidateCount === 1 ? "item" : "items"} with every review
        decision made on them. It cannot be undone, and no other lecture is affected.
      </p>
      <label className="mt-3 block text-xs text-red-800 dark:text-red-400">
        Type the lecture title to confirm:
      </label>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={lectureTitle}
        className="mt-1 w-full rounded-md border border-red-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-red-900"
      />
      {error ? <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          disabled={!matches || busy}
          onClick={remove}
          className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
