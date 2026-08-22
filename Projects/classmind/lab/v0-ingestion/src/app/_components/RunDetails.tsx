"use client";

import { useCallback } from "react";
import { formatMarker } from "@/lib/runs/normalize";
import {
  formatBytes,
  formatDuration,
  formatWhen,
  stripExtension,
  type RunView,
} from "./shared";

// Presentational view of one completed (or failed) run. Shared by the upload
// flow and the Lecture Library so both show the same thing.
export default function RunDetails({ run }: { run: RunView }) {
  // Built from the normalized transcript already on screen -- never from the
  // raw provider JSON, and with no server round-trip: the text exists in the
  // client, so a Blob is the whole implementation.
  const download = useCallback(() => {
    if (!run.transcript) return;
    const blob = new Blob([run.transcript.text], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stripExtension(run.originalFilename)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [run]);

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="col-span-2">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Filename</dt>
          <dd className="mt-0.5 break-all">{run.originalFilename}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Status</dt>
          <dd className="mt-0.5">
            {run.status}
            {run.providerStatus ? (
              <span className="text-zinc-500"> · {run.providerStatus}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Size</dt>
          <dd className="mt-0.5">{formatBytes(run.fileSizeBytes)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Uploaded</dt>
          <dd className="mt-0.5">{formatWhen(run.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Engine</dt>
          <dd className="mt-0.5">
            {run.provenance
              ? `${run.provenance.engine} · ${run.provenance.modelSnapshot}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Processing time</dt>
          <dd className="mt-0.5">
            {run.provenance ? formatDuration(run.provenance.processingTimeMs) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Language</dt>
          <dd className="mt-0.5">
            {run.provenance?.language ?? "—"}
            {run.provenance?.decodingParams?.mode ? (
              <span className="text-zinc-500">
                {" "}· mode {String(run.provenance.decodingParams.mode)}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {run.errorMessage ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-medium">Run failed</p>
          <p className="mt-1 break-words">{run.errorMessage}</p>
        </div>
      ) : null}

      {run.provenance?.limitations?.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Provenance limitations recorded with this run</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {run.provenance.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {run.transcript ? (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Transcript
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {run.transcript.segments.length} timed markers
              </span>
              <button
                onClick={download}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Download Transcript
              </button>
            </div>
          </div>
          {/* Continuous prose with inline [mm:ss] markers -- never pre-cut
              rows. See v0-ingestion/README.md: pre-segmented rows would make
              annotators anchor on ASR boundaries and corrupt the walkthrough's
              boundary-agreement measure. */}
          <div className="rounded-lg border border-zinc-200 p-5 leading-8 dark:border-zinc-800">
            {run.transcript.segments.map((segment, i) => (
              <span key={`${segment.startMs}-${i}`}>
                <span className="mr-1 select-none font-mono text-xs text-zinc-400">
                  {formatMarker(segment.startMs)}
                </span>
                <span lang="hi">{segment.text}</span>{" "}
              </span>
            ))}
          </div>
        </div>
      ) : run.rawTranscriptionResponse ? (
        <div>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Raw provider response
          </h2>
          <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
            The transcript could not be normalized — this response shape is not one
            the normalizer recognises. Shown raw rather than as an empty transcript.
            Fix <code>src/lib/runs/normalize.ts</code>; no re-run is needed.
          </p>
          <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 p-4 text-xs dark:border-zinc-800">
            {JSON.stringify(run.rawTranscriptionResponse, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
