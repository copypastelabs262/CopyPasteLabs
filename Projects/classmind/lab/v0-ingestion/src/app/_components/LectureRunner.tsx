"use client";

import { useCallback, useRef, useState } from "react";
import {
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMIT_BYTES,
} from "@/lib/storage/runs-bucket";
import RunDetails from "./RunDetails";
import { formatBytes, type RunView } from "./shared";

// Phases the UI shows. Distinct from the run's DB status: `hashing` and
// `creating` happen before a row exists, and `uploading` is browser-to-Storage
// with no server involvement, so neither is representable as a RunStatus.
type Phase =
  | "idle"
  | "hashing"
  | "creating"
  | "uploading"
  | "submitting"
  | "transcribing"
  | "completed"
  | "failed";

const POLL_INTERVAL_MS = 5000;
// A 40-minute lecture on a batch queue can legitimately take a long time; this
// is a guard against polling forever, not a claim about how long Sarvam takes.
const MAX_POLLS = 240;

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// XHR rather than fetch: fetch cannot report upload progress, and a 40 MB
// upload with no feedback looks indistinguishable from a hang.
function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage upload failed: ${xhr.status} ${xhr.responseText.slice(0, 200)}`));
    xhr.onerror = () => reject(new Error("Storage upload failed: network error"));
    xhr.send(file);
  });
}

async function postJson(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `${url} failed: ${response.status}`);
  }
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PHASE_STEPS: { phase: Phase; label: string }[] = [
  { phase: "uploading", label: "Uploading" },
  { phase: "submitting", label: "Submitted to transcription" },
  { phase: "transcribing", label: "Transcribing" },
  { phase: "completed", label: "Completed" },
];

const PHASE_ORDER: Phase[] = [
  "idle", "hashing", "creating", "uploading", "submitting", "transcribing", "completed",
];

export default function LectureRunner({
  onRunCompleted,
}: {
  onRunCompleted?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase !== "idle" && phase !== "completed" && phase !== "failed";

  const chooseFile = useCallback((picked: File | null) => {
    setError(null);
    setRun(null);
    setProgress(0);
    setProviderStatus(null);
    setPhase("idle");
    if (!picked) return setFile(null);

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(picked.type)) {
      setFile(null);
      setError(
        `${picked.type || "That file type"} is not supported. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}.`,
      );
      return;
    }
    if (picked.size > FILE_SIZE_LIMIT_BYTES) {
      setFile(null);
      setError(
        `${formatBytes(picked.size)} exceeds the ${formatBytes(FILE_SIZE_LIMIT_BYTES)} limit. Re-encode at a lower bitrate — 64 kbps mono is plenty for transcription.`,
      );
      return;
    }
    setFile(picked);
  }, []);

  const process = useCallback(async () => {
    if (!file) return;
    setError(null);
    try {
      setPhase("hashing");
      const checksumSha256 = await sha256Hex(file);

      setPhase("creating");
      const created = await postJson("/api/runs", {
        originalFilename: file.name,
        fileSizeBytes: file.size,
        contentType: file.type,
        checksumSha256,
      });
      const runId = created.runId as string;
      const signedUrl = created.signedUrl as string;

      setPhase("uploading");
      await uploadWithProgress(signedUrl, file, setProgress);

      setPhase("submitting");
      const submitted = await postJson(`/api/runs/${runId}/transcribe`);
      setProviderStatus((submitted.providerStatus as string) ?? null);

      setPhase("transcribing");
      for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
        await sleep(POLL_INTERVAL_MS);
        const polled = await postJson(`/api/runs/${runId}/poll`);
        setProviderStatus((polled.providerStatus as string) ?? null);
        const status = polled.status as string;
        if (status === "completed" || status === "failed") {
          const view = (await (await fetch(`/api/runs/${runId}`)).json()) as RunView;
          setRun(view);
          if (status === "failed") {
            setError(view.errorMessage ?? "The provider reported a failure.");
            setPhase("failed");
          } else {
            setPhase("completed");
          }
          onRunCompleted?.();
          return;
        }
      }
      throw new Error(
        `Still transcribing after ${(MAX_POLLS * POLL_INTERVAL_MS) / 60000} minutes. The run is not lost — its provider job id is stored, so polling can resume.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("failed");
      onRunCompleted?.();
    }
  }, [file, onRunCompleted]);

  const reset = useCallback(() => {
    setFile(null);
    setPhase("idle");
    setProgress(0);
    setError(null);
    setRun(null);
    setProviderStatus(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const stepState = (step: Phase): "done" | "active" | "todo" => {
    if (phase === "failed") {
      return PHASE_ORDER.indexOf(step) < PHASE_ORDER.indexOf("transcribing") ? "done" : "todo";
    }
    const here = PHASE_ORDER.indexOf(phase);
    const there = PHASE_ORDER.indexOf(step);
    if (here > there) return "done";
    if (here === there) return "active";
    return "todo";
  };

  return (
    <div className="space-y-6">
      {phase === "idle" || phase === "failed" ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_MIME_TYPES.join(",")}
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700 dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
          <p className="mt-4 text-xs text-zinc-500">
            Audio only, up to {formatBytes(FILE_SIZE_LIMIT_BYTES)}. Public lecture
            recordings only — no classroom audio until the consent position exists.
          </p>
        </div>
      ) : null}

      {file ? (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate font-medium">{file.name}</span>
            <span className="shrink-0 text-sm text-zinc-500">{formatBytes(file.size)}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{file.type}</p>
        </div>
      ) : null}

      {file && (phase === "idle" || phase === "failed") ? (
        <button
          onClick={process}
          className="w-full rounded-md bg-zinc-900 px-4 py-3 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Process Lecture
        </button>
      ) : null}

      {busy || phase === "completed" ? (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          {phase === "hashing" || phase === "creating" ? (
            <p className="text-sm text-zinc-500">
              {phase === "hashing" ? "Checksumming the file…" : "Creating the run…"}
            </p>
          ) : null}
          <ol className="space-y-2">
            {PHASE_STEPS.map(({ phase: step, label }) => {
              const state = stepState(step);
              return (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      state === "done"
                        ? "h-2 w-2 shrink-0 rounded-full bg-green-600"
                        : state === "active"
                          ? "h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-600"
                          : "h-2 w-2 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700"
                    }
                  />
                  <span className={state === "todo" ? "text-zinc-400" : ""}>{label}</span>
                  {step === "uploading" && phase === "uploading" ? (
                    <span className="ml-auto tabular-nums text-zinc-500">{progress}%</span>
                  ) : null}
                  {step === "transcribing" && providerStatus ? (
                    <span className="ml-auto text-xs text-zinc-500">{providerStatus}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {phase === "uploading" ? (
            <div className="h-1 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          {phase === "transcribing" ? (
            <p className="text-xs text-zinc-500">
              Sarvam&apos;s Batch API is asynchronous. Polling every {POLL_INTERVAL_MS / 1000}s;
              the provider job id is stored, so this survives a refresh.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-medium">Failed</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      ) : null}

      {run ? <RunDetails run={run} /> : null}

      {phase === "completed" || phase === "failed" ? (
        <button
          onClick={reset}
          className="w-full rounded-md border border-zinc-300 px-4 py-3 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Process another lecture
        </button>
      ) : null}
    </div>
  );
}
