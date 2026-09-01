"use client";

import { useCallback, useId, useRef, useState, type DragEvent } from "react";
import {
  AUDIO_ACCEPT, FILE_SIZE_LIMIT_BYTES, isAllowedAudio, canonicalAudioContentType,
} from "@/lib/storage";
import { formatBytes } from "./Input";
import { Button, Card, Spinner, TextInput, buttonClass, cx } from "./ui";
import { AlertIcon, AudioIcon, CheckIcon, ChevronRightIcon, UploadIcon } from "./ui/icons";

type Phase =
  | "idle"
  | "hashing"
  | "creating"
  | "uploading"
  | "submitting"
  | "transcribing"
  | "extracting"
  | "done"
  | "failed"
  | "quarantined";

// Where a run stopped, in the teacher's terms rather than the pipeline's. The
// raw error is always kept -- this only decides which sentence sits above it
// and whether re-running the same file is a sensible thing to offer.
type FailureKind = "upload" | "transcribe" | "timeout" | "understand" | "quarantine" | "authorize";

const POLL_MS = 5000;
const MAX_POLLS = 240;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The whole pipeline, in four sentences a teacher can hold in their head. Six
// internal phases collapse onto these four: the difference between hashing and
// uploading is real to the code and meaningless to the person waiting.
//
// Rendered as a list rather than one swapping line, because "what is happening"
// and "how much is left" are different questions and a single line can only
// ever answer the first.
const STEPS = [
  { title: "Uploading lecture", detail: "your recording is being saved." },
  { title: "Transcribing", detail: "turning the lecture into searchable text." },
  {
    title: "Understanding the lecture",
    detail: "connecting concepts and identifying important information.",
  },
  { title: "Ready", detail: "your lecture is now searchable." },
] as const;

function stepForPhase(phase: Phase): number {
  switch (phase) {
    case "submitting":
    case "transcribing":
      return 1;
    case "extracting":
      return 2;
    case "done":
      return 3;
    default:
      return 0;
  }
}

// What the teacher-developer reads instead of a failure when the money guard
// declines locally. Shown before anything is created (pre-flight) and, should
// the flow get as far as the transcribe route's own refusal, after upload too.
const SPEND_GUIDE =
  "This development server starts with paid transcription switched off, so nothing spends " +
  "money by accident. To transcribe a real recording: stop the dev server, start it with " +
  "`npm run dev:spend`, and upload the recording again. That server permits live " +
  "transcription only until you stop it.";

// One sentence per way this can end badly. Every one of them names what
// survived and what to do next -- a teacher who cannot tell whether their
// recording still exists will re-record the lecture rather than retry.
const FAILURE_COPY: Record<FailureKind, string> = {
  upload:
    "Your recording could not be saved. Check your connection and try again — nothing has been lost.",
  transcribe:
    "This lecture could not be transcribed. The recording itself is fine, so it is worth trying again.",
  timeout:
    "Transcription is taking longer than twenty minutes. It is still running — open the lecture in a few minutes and it will carry on from where it got to.",
  understand:
    "The lecture was transcribed, but the step that reads it for what was taught did not finish. The transcript is safe: open the lecture and run it again.",
  quarantine:
    "The recording was transcribed, but the transcript did not look like a lecture — so nothing was read out of it. This usually means the audio was too quiet, too noisy, or in a different language from the course. Upload a clearer recording.",
  authorize: `Your recording is uploaded and safe, and nothing was charged. ${SPEND_GUIDE}`,
};

// Re-running the whole sequence only helps when the failure was in getting the
// audio there or getting it transcribed. For the other three, a second upload
// would create a second lecture and fix nothing.
const RETRYABLE: ReadonlySet<FailureKind> = new Set<FailureKind>(["upload", "transcribe"]);

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// XHR rather than fetch: fetch cannot report upload progress, and a 40 MB upload
// with no feedback is indistinguishable from a hang.
function upload(url: string, file: File, contentType: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`Storage upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Storage upload failed: network error"));
    xhr.send(file);
  });
}

// Carries the server's machine-readable refusal code alongside the human
// message, so the catch below can tell a policy refusal from a real failure.
class ApiError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

async function post(url: string, body?: unknown) {
  const r = await fetch(url, {
    method: "POST",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ApiError(b.error ?? `${url} failed: ${r.status}`, typeof b.code === "string" ? b.code : null);
  }
  return b as Record<string, unknown>;
}

// True unless this server SAYS live transcription is off. Any doubt -- the
// endpoint missing, a network blip -- resolves to true and lets the normal
// flow run into the transcribe route's own guard, which is the protection;
// this pre-flight only exists so a refusal can arrive BEFORE a lecture row
// and a full upload that the refusal would orphan.
async function liveTranscriptionAllowed(): Promise<boolean> {
  try {
    const r = await fetch("/api/transcription/authorization");
    if (!r.ok) return true;
    const b = (await r.json()) as { liveTranscriptionAllowed?: boolean };
    return b.liveTranscriptionAllowed !== false;
  } catch {
    return true;
  }
}


/* ---------------------------------------------------------------------------
   Technical details

   Everything the pipeline knows and the teacher does not need: the lecture id,
   the provider's own status string, the raw error. None of it belongs in the
   normal flow -- a job id on screen is how a working product starts looking
   broken -- but all of it belongs one click away, or a support conversation
   becomes a guessing game.
--------------------------------------------------------------------------- */

function TechnicalDetails({
  lectureId,
  providerStatus,
  error,
}: {
  lectureId?: string | null;
  providerStatus?: string | null;
  error?: string | null;
}) {
  if (!lectureId && !providerStatus && !error) return null;
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-ink-soft [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon size={13} className="transition-transform duration-150 group-open:rotate-90" />
        Technical details
      </summary>
      <dl className="mt-2.5 space-y-1.5 border-l border-line pl-3 text-xs leading-relaxed text-ink-faint">
        {lectureId ? (
          <div>
            <dt className="inline">Lecture id: </dt>
            <dd className="inline font-mono break-all">{lectureId}</dd>
          </div>
        ) : null}
        {providerStatus ? (
          <div>
            <dt className="inline">Provider status: </dt>
            <dd className="inline font-mono break-all">{providerStatus}</dd>
          </div>
        ) : null}
        {error ? (
          <div>
            <dt className="inline">Error: </dt>
            <dd className="inline break-words">{error}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

/* ---------------------------------------------------------------------------
   Upload
--------------------------------------------------------------------------- */

export default function LectureUpload({
  courseId, onComplete,
}: { courseId: string; onComplete: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  // The money guard's pre-flight verdict, rendered in the idle card. Not an
  // error: nothing failed, nothing was created, the server simply is not
  // authorized to spend yet.
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [failedStep, setFailedStep] = useState(0);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  // dragenter/dragleave fire for every child element the pointer crosses, so a
  // boolean set from them flickers the whole time the file is over the zone.
  // Counting entries against leaves is the only version that stays steady.
  const dragDepth = useRef(0);

  const choose = useCallback((picked: File | null) => {
    setPickError(null); setError(null); setAuthNotice(null); setPhase("idle");
    setProgress(0); setProviderStatus(null); setLectureId(null); setFailure(null);
    if (!picked) { setFile(null); return; }
    // Judged on type OR extension -- Windows hands over many real recordings
    // (.m4a, .opus, .amr) with no type at all, and those must not be refused.
    if (!isAllowedAudio(picked.type, picked.name)) {
      setFile(null);
      setPickError(
        `${picked.name} is not an audio recording ClassMind can read. Upload an audio file — MP3, M4A, WAV, AAC, FLAC, OGG/Opus, AMR, WMA, WebM and more are all fine.`,
      );
      return;
    }
    if (picked.size > FILE_SIZE_LIMIT_BYTES) {
      setFile(null);
      setPickError(
        `${picked.name} is ${formatBytes(picked.size)}, and the limit is ${formatBytes(FILE_SIZE_LIMIT_BYTES)}. Re-export the recording at 64 kbps mono and it will fit comfortably.`,
      );
      return;
    }
    setFile(picked);
    // Only fills an empty title, so a teacher who has already typed one does
    // not lose it by swapping the file.
    setTitle((t) => t || picked.name.replace(/\.[^.]+$/, ""));
  }, []);

  const reset = useCallback(() => {
    setFile(null); setTitle(""); setPhase("idle"); setProgress(0);
    setProviderStatus(null); setLectureId(null);
    setError(null); setPickError(null); setAuthNotice(null); setFailure(null); setFailedStep(0);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const run = useCallback(async () => {
    if (!file) return;
    setError(null); setFailure(null); setProgress(0);
    setProviderStatus(null); setLectureId(null);

    // PRE-FLIGHT: would this server be allowed to transcribe for real? Asked
    // while there is still nothing to orphan -- a refusal after create+upload
    // leaves a pending_upload row nothing can resume. The transcribe route
    // keeps its own guard either way; this only moves the answer earlier.
    if (!(await liveTranscriptionAllowed())) {
      setAuthNotice(SPEND_GUIDE);
      return;
    }
    setAuthNotice(null);
    // Which sentence the teacher gets if this throws. Moved forward as the run
    // advances, so the catch does not have to reverse-engineer the phase.
    let stage: FailureKind = "upload";
    try {
      setPhase("hashing");
      const checksumSha256 = await sha256Hex(file);

      setPhase("creating");
      // Canonicalised once and used for BOTH the row and the storage PUT: the
      // bucket admits only audio/*, so a browser that reported no type (or
      // application/octet-stream) must not put its own guess on the wire.
      const contentType = canonicalAudioContentType(file.type, file.name);
      const created = await post(`/api/courses/${courseId}/lectures`, {
        title, originalFilename: file.name, fileSizeBytes: file.size,
        contentType, checksumSha256,
      });
      const id = created.lectureId as string;
      setLectureId(id);

      setPhase("uploading");
      await upload(created.signedUrl as string, file, contentType, setProgress);

      stage = "transcribe";
      setPhase("submitting");
      const submitted = await post(`/api/lectures/${id}/transcribe`);
      setProviderStatus((submitted.providerStatus as string) ?? null);

      setPhase("transcribing");
      for (let i = 0; i < MAX_POLLS; i += 1) {
        await sleep(POLL_MS);
        const polled = await post(`/api/lectures/${id}/poll`);
        setProviderStatus((polled.providerStatus as string) ?? null);
        const s = polled.status as string;

        // Transcribed but rejected: the recording arrived, the transcript came
        // back, and the guard refused to let anything be built on it. Not a
        // failure of the upload and not a lecture the teacher can rescue by
        // retrying -- the only fix is better audio.
        if (s === "quarantined") {
          const validation = polled.validation as { reason?: string } | undefined;
          setError(validation?.reason ?? "The transcript did not pass validation.");
          setFailure("quarantine");
          setFailedStep(1);
          setPhase("quarantined");
          onComplete();
          return;
        }

        // ALREADY PROCESSED -- STOP, DO NOT EXTRACT AGAIN.
        //
        // `ready` means something else already extracted this lecture and
        // published it: the lecture page's progress row, a second open tab, or
        // an earlier pass of this very loop. This branch used to fall through
        // into extraction, and that is how the same lecture was reconstructed
        // twice on 2026-08-30 -- 63s then 62s, full price, byte-identical
        // output at temperature 0.
        //
        // The server-side ledger now refuses to pay for that a second time, but
        // this stays regardless. That guard is off until its migration is
        // applied, and a client that avoids the pointless call is better than
        // one that relies on the server to forgive it.
        if (s === "ready") { setPhase("done"); onComplete(); return; }

        if (s === "transcribed") {
          // Extraction runs immediately after transcription. It produces
          // CANDIDATES only -- nothing is visible to a student until a human
          // rules on it.
          stage = "understand";
          setPhase("extracting");
          try {
            // Publication is CONDITIONAL. A 200 from extract does not mean the
            // lecture is readable: reconstruction can complete with nothing to
            // store, or fail partway, and `decideReadiness` then deliberately
            // withholds publication. Treating any non-throw as success is how
            // the old code announced "Ready -- your lecture is now searchable"
            // over a lecture containing no knowledge, which is the same
            // confident-success-over-an-empty-result failure the readiness gate
            // was built to remove. Undoing it at the last inch is worse than
            // never having built it.
            const extracted = await post(`/api/lectures/${id}/extract`);
            if (extracted.published === false) {
              const readiness = extracted.readiness as { reason?: string } | undefined;
              setPhase("failed");
              setError(
                readiness?.reason
                  ? `Transcribed, but no knowledge could be captured. ${readiness.reason} Open the lecture to try again.`
                  : "Transcribed, but no knowledge could be captured from this recording. Open the lecture to try again.",
              );
              onComplete();
              return;
            }
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
      stage = "timeout";
      throw new Error("Still transcribing after 20 minutes. The job id is stored, so polling can resume.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // The transcribe route refusing to spend is not a transcription failure:
      // the upload completed, nothing broke, and "worth trying again" would be
      // false -- retrying without authorization refuses identically and mints
      // another orphaned lecture row. Reached only when authorization changed
      // mid-flow (the pre-flight above answers the common case first).
      if (err instanceof ApiError && err.code === "live_transcription_disabled") {
        setFailure("authorize");
        setFailedStep(1);
      } else {
        setFailure(stage);
        setFailedStep(stage === "upload" ? 0 : stage === "understand" ? 2 : 1);
      }
      setPhase("failed");
      onComplete();
    }
  }, [file, title, courseId, onComplete]);

  const idle = phase === "idle";
  const busy = !["idle", "done", "failed", "quarantined"].includes(phase);
  const stopped = phase === "failed" || phase === "quarantined";
  const activeStep = stopped ? failedStep : stepForPhase(phase);

  /* ---- drag and drop ---------------------------------------------------- */

  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    if (!idle) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!idle) return;
    // Without preventDefault on dragover the browser refuses the drop and opens
    // the file in a new tab instead.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!idle) return;
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); }
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!idle) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) choose(dropped);
  };

  /* ---- render ----------------------------------------------------------- */

  return (
    <Card>
      <h2 className="text-lg font-semibold tracking-[-0.012em] text-ink">Add a lecture</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">
        Upload a recording. ClassMind writes it out, reads it, and turns it into something your
        students can search.
      </p>

      {idle ? (
        <div
          className="mt-6 space-y-5"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* Kept as a direct sibling of the drop zone so `peer-focus-visible`
              can put a ring on the zone when the (visually hidden) input has
              keyboard focus. A hidden control with an invisible focus state is
              a control a keyboard user cannot find. */}
          <input
            id={fileInputId}
            ref={inputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            // Clearing on open makes re-picking the SAME file fire `change`.
            // Without it, choosing the file you just replaced does nothing.
            onClick={(e) => { e.currentTarget.value = ""; }}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            className="peer sr-only"
          />

          {file ? (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-sunken px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-soft">
                  <AudioIcon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{file.name}</span>
                  <span className="block text-xs text-ink-faint">{formatBytes(file.size)}</span>
                </span>
                {/* A real button, not a second label: a label nested inside
                    this row would still open the picker, but it would have no
                    focus ring of its own. */}
                <Button tone="ghost" size="sm" onClick={() => inputRef.current?.click()}>
                  Replace
                </Button>
              </div>

              <TextInput
                label="Lecture title"
                value={title}
                onChange={setTitle}
                placeholder="Week 4 — Transport layer"
                hint="Taken from the filename. Change it to whatever your students would search for."
              />

              <Button tone="primary" size="lg" onClick={run} className="w-full">
                Process lecture
              </Button>
            </>
          ) : (
            // A label rather than a div with a click handler: the whole zone
            // opens the picker, keyboard reaches the real input, and screen
            // readers get the description for free.
            <label
              htmlFor={fileInputId}
              className={cx(
                "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center transition-colors duration-150",
                "peer-focus-visible:border-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                dragging
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface-sunken hover:border-ink-faint/60",
              )}
            >
              <span
                className={cx(
                  "flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-150",
                  dragging ? "bg-accent text-accent-ink" : "bg-surface-raised text-ink-soft",
                )}
              >
                <UploadIcon size={22} />
              </span>
              <span className="text-[17px] leading-snug font-medium tracking-[-0.012em] text-ink">
                {dragging ? "Drop it here" : "Drop a lecture recording here"}
              </span>
              <span className="max-w-xs text-sm leading-relaxed text-ink-soft">
                Any audio format — MP3, M4A, AAC, WAV, FLAC, OGG and more — up to{" "}
                {formatBytes(FILE_SIZE_LIMIT_BYTES)}.
              </span>
              <span className={buttonClass("secondary", "md", "mt-2 pointer-events-none")}>
                Choose a file
              </span>
            </label>
          )}

          {pickError ? (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-danger">
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <span>{pickError}</span>
            </p>
          ) : null}

          {authNotice ? (
            <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-sunken px-4 py-3 text-sm leading-relaxed text-ink-soft">
              <AlertIcon size={16} className="mt-0.5 shrink-0 text-ink-faint" />
              <span>{authNotice}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {!idle ? (
        <div className="mt-7">
          {/* The list is decorative to a screen reader -- four sentences read
              out on every tick would be unbearable. One live line carries the
              state instead. */}
          <p className="sr-only" role="status">
            {stopped
              ? (failure ? FAILURE_COPY[failure] : "Processing stopped.")
              : `${STEPS[activeStep].title} — ${STEPS[activeStep].detail}`}
          </p>

          <ol className="space-y-4">
            {STEPS.map((step, i) => {
              const state: "done" | "active" | "failed" | "todo" =
                phase === "done" ? "done"
                  : i < activeStep ? "done"
                  : i > activeStep ? "todo"
                  : stopped ? "failed" : "active";
              return (
                <li key={step.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    {state === "done" ? <CheckIcon size={16} className="text-ok" />
                      : state === "active" ? <Spinner size={16} className="text-accent" />
                      : state === "failed" ? <AlertIcon size={16} className="text-danger" />
                      : <span className="h-1.5 w-1.5 rounded-full bg-ink-faint/40" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cx(
                        "block text-sm leading-relaxed",
                        state === "todo" ? "text-ink-faint" : "text-ink-soft",
                      )}
                    >
                      <span
                        className={cx(
                          "font-medium",
                          state === "failed" ? "text-danger"
                            : state === "todo" ? "text-ink-faint" : "text-ink",
                        )}
                      >
                        {step.title}
                      </span>
                      {" — "}
                      {step.detail}
                    </span>

                    {state === "active" && i === 0 ? (
                      <span className="mt-2.5 flex items-center gap-3">
                        <span
                          role="progressbar"
                          aria-label="Upload progress"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
                        >
                          <span
                            className="block h-full rounded-full bg-accent transition-[width] duration-200"
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-faint">
                          {progress}%
                        </span>
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>

          {stopped && failure ? (
            <p className="mt-6 flex items-start gap-2 text-sm leading-relaxed text-ink">
              <AlertIcon size={16} className="mt-0.5 shrink-0 text-danger" />
              <span>{FAILURE_COPY[failure]}</span>
            </p>
          ) : null}

          {phase === "done" ? (
            <p className="mt-6 text-sm leading-relaxed text-ink-soft">
              Anything your students have to act on is waiting for your review before it reaches
              them.
            </p>
          ) : null}

          {busy ? (
            <p className="mt-6 text-xs leading-relaxed text-ink-faint">
              This keeps running while the page is open, and picks up where it left off if you come
              back later.
            </p>
          ) : null}

          <div className="mt-6">
            <TechnicalDetails lectureId={lectureId} providerStatus={providerStatus} error={error} />
          </div>

          {phase === "done" || stopped ? (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {failure && RETRYABLE.has(failure) ? (
                <>
                  <Button tone="primary" size="md" onClick={run} className="w-full sm:w-auto">
                    Try again
                  </Button>
                  <Button tone="ghost" size="md" onClick={reset} className="w-full sm:w-auto">
                    Choose a different recording
                  </Button>
                </>
              ) : (
                <Button tone="secondary" size="md" onClick={reset} className="w-full sm:w-auto">
                  Upload another lecture
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
