"use client";

import { useCallback, useRef, useState } from "react";
import { ALLOWED_MIME_TYPES, FILE_SIZE_LIMIT_BYTES } from "@/lib/storage";
import { formatBytes } from "./Input";

type Phase = "idle" | "hashing" | "creating" | "uploading" | "submitting" | "transcribing" | "done" | "failed";

const POLL_MS = 5000;
const MAX_POLLS = 240;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// XHR rather than fetch: fetch cannot report upload progress, and a 40 MB upload
// with no feedback is indistinguishable from a hang.
function upload(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`Storage upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Storage upload failed: network error"));
    xhr.send(file);
  });
}

async function post(url: string, body?: unknown) {
  const r = await fetch(url, {
    method: "POST",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? `${url} failed: ${r.status}`);
  return b as Record<string, unknown>;
}

export default function LectureUpload({
  courseId, onComplete,
}: { courseId: string; onComplete: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = useCallback((picked: File | null) => {
    setError(null); setPhase("idle"); setProgress(0); setStatus(null);
    if (!picked) return setFile(null);
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(picked.type)) {
      setFile(null); setError(`${picked.type || "That file"} is not a supported audio type.`); return;
    }
    if (picked.size > FILE_SIZE_LIMIT_BYTES) {
      setFile(null);
      setError(`${formatBytes(picked.size)} exceeds the ${formatBytes(FILE_SIZE_LIMIT_BYTES)} limit. Re-encode at 64 kbps mono.`);
      return;
    }
    setFile(picked);
    if (!title) setTitle(picked.name.replace(/\.[^.]+$/, ""));
  }, [title]);

  const run = useCallback(async () => {
    if (!file) return;
    setError(null);
    try {
      setPhase("hashing");
      const checksumSha256 = await sha256Hex(file);

      setPhase("creating");
      const created = await post(`/api/courses/${courseId}/lectures`, {
        title, originalFilename: file.name, fileSizeBytes: file.size,
        contentType: file.type, checksumSha256,
      });
      const lectureId = created.lectureId as string;

      setPhase("uploading");
      await upload(created.signedUrl as string, file, setProgress);

      setPhase("submitting");
      const submitted = await post(`/api/lectures/${lectureId}/transcribe`);
      setStatus((submitted.providerStatus as string) ?? null);

      setPhase("transcribing");
      for (let i = 0; i < MAX_POLLS; i += 1) {
        await sleep(POLL_MS);
        const polled = await post(`/api/lectures/${lectureId}/poll`);
        setStatus((polled.providerStatus as string) ?? null);
        const s = polled.status as string;
        if (s === "transcribed" || s === "ready") {
          // Extraction runs immediately after transcription. It produces
          // CANDIDATES only -- nothing is visible to a student until a human
          // rules on it.
          try {
            await post(`/api/lectures/${lectureId}/extract`);
          } catch (err) {
            // Swallowing this used to leave the panel saying "candidates
            // extracted" when none were. The transcript is safe either way --
            // only the proposal step failed, and the lecture page can retry it.
            throw new Error(
              `Transcribed, but extraction failed: ${err instanceof Error ? err.message : String(err)} Open the lecture to run it again.`,
            );
          }
          setPhase("done"); onComplete(); return;
        }
        if (s === "failed") throw new Error("Transcription failed.");
      }
      throw new Error("Still transcribing after 20 minutes. The job id is stored, so polling can resume.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("failed");
      onComplete();
    }
  }, [file, title, courseId, onComplete]);

  const busy = !["idle", "done", "failed"].includes(phase);

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Upload a lecture</h2>

      {!busy ? (
        <>
          <input
            ref={inputRef} type="file" accept={ALLOWED_MIME_TYPES.join(",")}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
          {file ? (
            <>
              <p className="text-xs text-zinc-500">{file.name} · {formatBytes(file.size)}</p>
              <input
                value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture title"
                className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
              <button
                onClick={run}
                className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Process lecture
              </button>
            </>
          ) : null}
        </>
      ) : null}

      {busy || phase === "done" ? (
        <div className="space-y-2 text-sm">
          <p className="text-zinc-600 dark:text-zinc-400">
            {phase === "hashing" ? "Checksumming…"
              : phase === "creating" ? "Creating the lecture…"
              : phase === "uploading" ? `Uploading ${progress}%`
              : phase === "submitting" ? "Submitting to transcription…"
              : phase === "transcribing" ? `Transcribing${status ? ` · ${status}` : ""}…`
              : "Done — candidates extracted and waiting for your review."}
          </p>
          {phase === "uploading" ? (
            <div className="h-1 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {phase === "done" || phase === "failed" ? (
        <button
          onClick={() => { setFile(null); setTitle(""); setPhase("idle"); setProgress(0); setError(null); if (inputRef.current) inputRef.current.value = ""; }}
          className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Upload another
        </button>
      ) : null}
    </div>
  );
}
