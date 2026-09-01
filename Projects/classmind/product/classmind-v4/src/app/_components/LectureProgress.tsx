"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner, cx } from "./ui";
import { AlertIcon, ChevronRightIcon } from "./ui/icons";

const POLL_MS = 5000;

// How many consecutive poll failures we absorb before saying anything. A single
// dropped request is normal on a phone in a corridor; printing an error next to
// the status on the first one -- which is what this used to do -- turns a
// healthy lecture into a screen that looks broken. Polling never stops either
// way, so the only question is when to admit the connection is unhappy.
const QUIET_FAILURES = 2;

// The same two sentences the upload widget uses, so a lecture that finishes in
// the background is described exactly as it was while the teacher watched it.
const TRANSCRIBING = { title: "Transcribing", detail: "turning the lecture into searchable text." };
const UNDERSTANDING = {
  title: "Understanding the lecture",
  detail: "connecting concepts and identifying important information.",
};

// The provider's own status string and the raw error, one click away and never
// in the normal flow. Deliberately a local copy rather than an import from the
// upload widget: this file must not have to load that one to render a line
// under a list row.
//
// The readiness code lives here and ONLY here. `no_knowledge_found` is a
// precise, useful thing to be able to quote in a support thread and a terrible
// thing to show a lecturer in the flow of their day.
function TechnicalDetails({
  providerStatus,
  error,
  readinessCode,
  readinessReason,
}: {
  providerStatus?: string | null;
  error?: string | null;
  readinessCode?: string | null;
  readinessReason?: string | null;
}) {
  if (!providerStatus && !error && !readinessCode && !readinessReason) return null;
  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-ink-soft [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon size={13} className="transition-transform duration-150 group-open:rotate-90" />
        Technical details
      </summary>
      <dl className="mt-2 space-y-1.5 border-l border-line pl-3 text-xs leading-relaxed text-ink-faint">
        {providerStatus ? (
          <div>
            <dt className="inline">Provider status: </dt>
            <dd className="inline font-mono break-all">{providerStatus}</dd>
          </div>
        ) : null}
        {readinessCode ? (
          <div>
            <dt className="inline">Outcome: </dt>
            <dd className="inline font-mono break-all">{readinessCode}</dd>
          </div>
        ) : null}
        {readinessReason ? (
          <div>
            <dt className="inline">Reason: </dt>
            <dd className="inline break-words">{readinessReason}</dd>
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

// What the extract route actually answers with. Read narrowly and defensively:
// every field below is optional because a response that has lost one of them
// must degrade to a vaguer sentence rather than to a confident wrong one.
interface ExtractResponse {
  published?: boolean;
  readiness?: { code?: string | null; reason?: string | null } | null;
  // A StoreResult. `pending` counts what THIS pass added to the review queue,
  // which is not the same as the size of the queue -- see reviewQueueSize.
  knowledge?: { pending?: number } | null;
  error?: string;
}

// THE FOUR WAYS A FINISHED PASS CAN LEAVE A LECTURE UNPUBLISHED.
//
// A 200 from the extract route is not success. It means the pipeline ran to
// completion and reached a verdict, and the verdict is `published`. This
// component used to treat any 200 as "Ready — your lecture is now searchable",
// which announced a published lecture to a teacher whose lecture was sitting
// unpublished with a reason attached to it.
//
// The route's own `reason` is written for a faculty member but still reaches
// for the machinery -- "no reasoning model is configured", "the reasoning pass
// failed" -- so what a lecturer reads is written here, and the route's sentence
// and its code go in the disclosure.
const NOT_PUBLISHED: Record<string, string> = {
  reasoning_unavailable:
    "We could not read this lecture for what it taught, so it has not been published. " +
    "The recording and its transcript are safe — try again.",
  nothing_to_read:
    "There is no speech we could read in this recording, so there is nothing to publish. " +
    "If this is not the right file, upload the lecture again.",
  reconstruction_incomplete:
    "Reading this lecture did not finish, so nothing was published. " +
    "The transcript is safe — try again.",
  no_knowledge_found:
    "This recording was read all the way through, and nothing taught or set was found in it. " +
    "Nothing was lost — there is simply nothing to publish.",
};

const NOT_PUBLISHED_FALLBACK =
  "This lecture was not published. The transcript is safe — try again.";

// What the last extract actually did, in the words the reader gets.
interface ExtractOutcome {
  published: boolean;
  message: string;
  readinessCode: string | null;
  readinessReason: string | null;
}

// HOW MANY ITEMS ARE ACTUALLY IN THE REVIEW QUEUE.
//
// This line used to print `candidateCount` -- the number of Layer-1 raw
// signals, around thirty on a real lecture -- under the words "waiting for your
// review". The review queue is a different and far smaller thing: knowledge
// items still marked pending, which only ever covers gated actionable kinds and
// is typically one or two. Promising a teacher thirty items of work that do not
// exist is the number that stops them opening the page at all.
//
// The stored count is preferred over the pass's own, because the extract
// response's `knowledge.pending` counts what THIS pass inserted: a re-run that
// preserved existing knowledge writes nothing and would report zero while items
// sit in the queue. The pass's number is the fallback when that request does
// not come back.
async function reviewQueueSize(lectureId: string, fromThisPass: number): Promise<number> {
  try {
    const r = await fetch(`/api/lectures/${lectureId}/knowledge`);
    if (r.ok) {
      const b = (await r.json()) as { awaitingReview?: number };
      if (typeof b.awaitingReview === "number") return b.awaitingReview;
    }
  } catch {
    // A count we could not read is not worth an error message. Fall through.
  }
  return fromThisPass;
}

function readyLine(waiting: number): string {
  if (waiting === 0) return "Ready — your lecture is now searchable. Nothing needs your review.";
  return waiting === 1
    ? "Ready — your lecture is now searchable. 1 item is waiting for your review."
    : `Ready — your lecture is now searchable. ${waiting} items are waiting for your review.`;
}

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
//
// `variant` changes nothing about the engine, only how much room the result
// takes: "list" is one line under a row in a list of lectures, "detail" is a
// block on the lecture's own page where it is the main thing on screen.
export default function LectureProgress({
  lectureId, status, onAdvanced, variant = "list",
}: {
  lectureId: string;
  status: string;
  onAdvanced: () => void;
  variant?: "list" | "detail";
}) {
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ExtractOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The last transport error, kept for the disclosure even while the line above
  // it stays quiet.
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollTrouble, setPollTrouble] = useState(false);
  // A ref, not state: the counter must not re-render anything on its way to
  // QUIET_FAILURES, and it must not participate in the effect's dependencies or
  // the timer would restart on every failed tick.
  const pollFailures = useRef(0);

  const extract = useCallback(async () => {
    setBusy(true); setError(null); setOutcome(null);
    try {
      const r = await fetch(`/api/lectures/${lectureId}/extract`, { method: "POST" });
      const b = (await r.json()) as ExtractResponse;
      if (!r.ok) throw new Error(b.error ?? "Extraction failed.");

      // 200 IS NOT THE SAME AS PUBLISHED. The pipeline ran and reached a
      // verdict; `published` is the verdict, and there are four documented ways
      // for it to be false with the request having gone perfectly.
      if (b.published === true) {
        const waiting = await reviewQueueSize(lectureId, b.knowledge?.pending ?? 0);
        setOutcome({
          published: true,
          message: readyLine(waiting),
          readinessCode: null,
          readinessReason: null,
        });
      } else {
        const code = b.readiness?.code ?? null;
        setOutcome({
          published: false,
          message: (code ? NOT_PUBLISHED[code] : null) ?? NOT_PUBLISHED_FALLBACK,
          readinessCode: code,
          readinessReason: b.readiness?.reason ?? null,
        });
      }
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
        setProviderStatus((b.providerStatus as string) ?? null);
        pollFailures.current = 0;
        setPollTrouble(false); setPollError(null);
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
        // reason, so keep asking. The first couple are absorbed in silence;
        // after that the reader gets one quiet line, and never a claim that the
        // lecture failed.
        if (!cancelled) {
          pollFailures.current += 1;
          setPollError(err instanceof Error ? err.message : String(err));
          if (pollFailures.current > QUIET_FAILURES) setPollTrouble(true);
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [lectureId, status, extract, onAdvanced]);

  const detail = variant === "detail";

  if (status === "transcribing") {
    // `busy` here means the poll came back transcribed and extraction is
    // already running -- the lecture has moved on to the third step even though
    // the row this component was handed still says `transcribing`.
    const step = busy ? UNDERSTANDING : TRANSCRIBING;
    return (
      <div
        className={cx(
          detail
            ? "mt-3 rounded-xl border border-line bg-surface-sunken p-4"
            : "mt-1.5",
        )}
      >
        <p
          className={cx(
            "flex items-start gap-2.5 leading-relaxed",
            detail ? "text-sm text-ink-soft" : "text-xs text-ink-soft",
          )}
        >
          <Spinner size={detail ? 16 : 13} className="mt-0.5 shrink-0 text-accent" />
          <span>
            <span className="font-medium text-ink">{step.title}</span>
            {" — "}
            {step.detail}
          </span>
        </p>
        {detail ? (
          <p className="mt-1.5 pl-[26px] text-xs leading-relaxed text-ink-faint">
            This keeps running while the page is open, and picks up where it left off if you come
            back later.
          </p>
        ) : null}
        {pollTrouble ? (
          <p
            className={cx(
              "text-ink-faint",
              detail ? "mt-1.5 pl-[26px] text-xs" : "mt-1 text-xs",
            )}
          >
            Still checking — the connection is slow just now.
          </p>
        ) : null}
        {/* On the lecture's own page there is room for the disclosure at all
            times. In a list it only appears once the connection has actually
            been misbehaving, so a healthy row stays a single quiet line. */}
        {detail || pollTrouble ? (
          <TechnicalDetails providerStatus={providerStatus} error={pollError} />
        ) : null}
      </div>
    );
  }

  // `transcribed` with no extraction is the state a closed tab leaves behind.
  // It is not an error and it is not finished, so it gets an action rather than
  // a label.
  if (status === "transcribed") {
    return (
      <div className={detail ? "mt-3 rounded-xl border border-line bg-surface-sunken p-4" : "mt-2"}>
        {detail ? (
          <p className="mb-3 max-w-md text-sm leading-relaxed text-ink-soft">
            The recording has been written out. One more step reads it for what was taught and for
            anything your students have to act on.
          </p>
        ) : null}
        {/* The retry affordance, and it is the only action here. A lecture that
            came back unpublished is not finished, so the button that finishes
            it stays exactly where it was rather than being replaced by a
            message about why it did not work. */}
        <Button tone="secondary" size="sm" onClick={extract} disabled={busy}>
          {busy ? (
            <>
              <Spinner size={14} />
              Working…
            </>
          ) : outcome && !outcome.published ? (
            "Try again"
          ) : (
            "Finish processing"
          )}
        </Button>

        {/* What the last run actually did. An unpublished lecture gets the
            reason in plain words; the code that produced it stays in the
            disclosure, where a support thread can quote it and a lecturer
            never has to read it. */}
        {outcome ? (
          <>
            {/* Amber, never red. An unpublished lecture is a stall a lecturer
                can clear, not a failure and not data lost -- the same reading
                the status pill already gives `transcribed`. */}
            <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
              {outcome.published ? null : (
                <AlertIcon size={14} className="mt-0.5 shrink-0 text-warn" />
              )}
              <span>{outcome.message}</span>
            </p>
            {outcome.published ? null : (
              <TechnicalDetails
                readinessCode={outcome.readinessCode}
                readinessReason={outcome.readinessReason}
              />
            )}
          </>
        ) : null}

        {error ? (
          <>
            <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
              <AlertIcon size={14} className="mt-0.5 shrink-0 text-danger" />
              <span>That step did not finish. The transcript is safe — try it again.</span>
            </p>
            <TechnicalDetails error={error} />
          </>
        ) : null}
      </div>
    );
  }

  // Everything else -- ready, failed, quarantined, pending_upload, uploaded --
  // is a settled state the parent already renders a label and a note for.
  // Adding a second voice here is how two parts of the same row end up
  // disagreeing about what a lecture is doing.
  return null;
}
