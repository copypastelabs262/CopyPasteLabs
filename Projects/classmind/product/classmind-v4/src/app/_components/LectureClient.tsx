"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ActionableReview from "./ActionableReview";
import LectureProgress from "./LectureProgress";
import DeleteLecture from "./DeleteLecture";
import AskPanel from "./AskPanel";
import AudioPlayer, { type AudioPlayerHandle } from "./AudioPlayer";
import LectureTranscript, { type TranscriptSegment } from "./LectureTranscript";
import { LectureKnowledge, StillWorking } from "./KnowledgePanel";
import type { EvidenceNav, KnowledgeUnit } from "./KnowledgeUnit";
import { formatBytes } from "./Input";
import {
  Button, Card, Page, PageHeader, Section, Skeleton, Spinner, StatusPill, cx,
  lectureStatusLabel, lectureStatusTone,
} from "./ui";
import { AlertIcon, ChevronDownIcon, ChevronRightIcon, UploadIcon } from "./ui/icons";

// ONE LECTURE, IN THE ORDER A LECTURER READS IT.
//
//   title · date · duration · course     who and when, quietly
//   Key content                          what the lecture actually contained
//   Needs your attention                 the two or three things only they can settle
//   Ask ClassMind                        the question box
//   Full lecture                         the recording and the transcript, as evidence
//
// The recording sits at the BOTTOM. Putting it at the top said "this product
// gives you a transcript" -- it does not; it gives you what the lecture meant,
// and the transcript is how you check that.
//
// Nothing here prints a provider status, a job id, a model name or a raw API
// response in the normal flow. All of it is real and all of it is kept: it
// lives behind "Technical details", which is the one place a lecturer should
// ever have to look at the machinery.

interface Lecture {
  id: string; courseId: string; title: string; status: string;
  providerStatus: string | null; originalFilename: string; fileSizeBytes: number;
  languageCode: string | null;
  provenance: { engine?: string; modelSnapshot?: string; processingTimeMs?: number;
    language?: string; limitations?: string[] } | null;
  errorMessage: string | null; createdAt: string; completedAt: string | null;
  recordedOn: string | null;
}
interface CourseHead { id: string; code: string; title: string }

// A bare `YYYY-MM-DD` is parsed as UTC midnight by the Date constructor, which
// renders as the previous day for anyone west of Greenwich. A date with no time
// is the lecturer's local calendar date, so it is read as one.
function parseWhen(value: string | null): Date | null {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: string | null): string | null {
  const d = parseWhen(value);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
}

// Duration comes from the transcript, because that is the only place the app
// knows it: the lecture row stores a byte count, and bytes are not minutes.
// Absent until there is a transcript, and absent is fine -- a metadata line with
// one fewer fact still reads.
function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

// The one sanctioned way to show machinery: collapsed, quiet, and never the
// thing a lecturer has to open in order to understand what happened -- whatever
// sits above it has already said that in words.
function TechnicalDetails({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-6">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-ink-soft">
        <ChevronRightIcon size={13} className="transition-transform group-open:rotate-90" />
        Technical details
      </summary>
      <div className="mt-3 space-y-1.5 rounded-xl border border-line bg-surface-sunken p-4 font-mono text-[11px] leading-relaxed break-words text-ink-soft">
        {children}
      </div>
    </details>
  );
}

// The states LectureProgress does NOT speak for.
//
// It owns `transcribing` (it is the thing polling) and `transcribed` (it offers
// the action that finishes the job), and renders nothing for the rest. The rest
// still have to say something, and each of them means something different: a
// lecture with no audio is not a lecture that is busy.
const WAITING_COPY: Record<string, { title: string; note: string }> = {
  pending_upload: {
    title: "This lecture has no recording yet",
    note: "The upload never finished, so there is nothing to process. Upload the recording again from the course page.",
  },
  uploaded: {
    title: "This lecture is waiting to be processed",
    note: "The recording is stored safely. Transcription has not started yet.",
  },
  extracting: {
    title: "Understanding the lecture",
    note: "Connecting concepts and identifying important information.",
  },
};

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p>
      <span className="text-ink-faint">{label}: </span>
      {value}
    </p>
  );
}

export default function LectureClient({
  courseId, lectureId,
}: { courseId: string; lectureId: string }) {
  const searchParams = useSearchParams();
  // Absent must stay absent. `Number("")` is 0, which is a finite, seekable
  // millisecond -- reading it that way made every plain visit jump to the top
  // of the transcript and start the audio playing on its own.
  const tParam = searchParams.get("t");
  const jumpTo = tParam === null || tParam === "" ? null : Number(tParam);

  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [course, setCourse] = useState<CourseHead | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [rawFallback, setRawFallback] = useState<unknown>(null);
  // Layer-1 detections are no longer a review surface, and no longer a line on
  // the page either -- only a number inside Technical details. Nothing acts on
  // them.
  const [signalCount, setSignalCount] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // THE PLAYER FOLLOWS THE READER, BUT ONLY ONCE THEY HAVE ASKED IT TO.
  //
  // The recording belongs at the bottom of this page -- it is the evidence, not
  // the headline. That ordering breaks the one interaction the page exists for:
  // a citation clicked up in "Key content" seeks a player that is two screens
  // below, so the audio starts and the control the reader just pressed is
  // nowhere to be seen. Nothing appears to have happened.
  //
  // So the player leaves the flow and pins to the bottom of the viewport the
  // first time it is engaged -- a press of play, or any citation seeking it --
  // and not before. A bar that is already there on a page nobody has played is
  // exactly the persistent chrome this design is trying not to have.
  //
  // One element, moved. Rendering a second compact player would mean two
  // <audio> elements and two playheads, which is the same recording playing
  // over itself.
  const [engaged, setEngaged] = useState(false);
  const [slotHeight, setSlotHeight] = useState<number | null>(null);
  const playerSlot = useRef<HTMLDivElement>(null);

  // Layer 3, fetched once for the whole page.
  //
  // Both the read-only panel and the review queue read the same units, so they
  // share one request: two independent fetches of the same endpoint could
  // disagree for a second after a verdict, and an item vanishing from one panel
  // while still sitting in the other is exactly the confusion this rework
  // exists to remove.
  const [units, setUnits] = useState<KnowledgeUnit[]>([]);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [unitsLoading, setUnitsLoading] = useState(true);
  // How many actionable items are still with the lecturer. For a student this
  // is a COUNT ONLY and never content -- it is what lets them tell "nothing was
  // assigned" from "your lecturer has not looked yet". Without it this page was
  // the one student surface that stayed silent while the course page and the
  // home both disclosed it.
  const [awaitingReview, setAwaitingReview] = useState(0);

  // The player, not the <audio> element. Every citation on this page moves the
  // recording through this one handle, so there is a single definition of what
  // "jump to 12:04" does.
  const audioRef = useRef<AudioPlayerHandle>(null);

  // Stable, because LectureProgress schedules its poll timer against it -- an
  // identity that changed every render would restart the timer every render
  // and the lecture would never actually be polled.
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lectures/${lectureId}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok) throw new Error(b.error ?? "Could not load the lecture.");
        setLecture(b.lecture); setIsOwner(Boolean(b.isOwner));
        setSegments(b.transcript?.segments ?? []);
        setRawFallback(b.rawTranscriptionResponse ?? null);
        setSignalCount((b.candidates ?? []).length);
        setAudioUrl(b.audioUrl ?? null); setError(null);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lectureId, version]);

  // The course this lecture belongs to, for the metadata line and the way back.
  // Deliberately non-fatal: a lecture page that cannot name its course is worse
  // for having refused to render.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses/${courseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!cancelled && b?.course) setCourse(b.course as CourseHead); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lectures/${lectureId}/knowledge`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok) throw new Error(b.error ?? "Could not load the lecture knowledge.");
        setUnits(b.units ?? []); setAwaitingReview(Number(b.awaitingReview ?? 0)); setUnitsError(null);
      })
      .catch((e: unknown) => { if (!cancelled) setUnitsError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setUnitsLoading(false); });
    return () => { cancelled = true; };
    // `version` is the refresh signal: a verdict or a re-extraction changes
    // what is stored, so this re-reads rather than going stale.
  }, [lectureId, version]);

  // Seek the recording and scroll the transcript to a moment. This is the
  // durable anchor from Capture Contract Article 7 made clickable, and it is
  // the single implementation -- knowledge units, answer citations and
  // transcript timestamps all call this.
  //
  // The requested moment is snapped to the nearest segment before anything is
  // looked up. An evidence span carries its own start time, which is under no
  // obligation to fall exactly on a segment boundary, and an unsnapped id
  // lookup fails silently -- the audio would move and the transcript would sit
  // there, which reads as a broken link rather than a near miss.
  const seek = useCallback((ms: number) => {
    const nearest = segments.length
      ? segments.reduce((best, s) =>
          Math.abs(s.startMs - ms) < Math.abs(best.startMs - ms) ? s : best, segments[0])
      : null;
    const anchor = nearest?.startMs ?? ms;
    setHighlight(anchor);
    // The transcript is evidence, so it is collapsed until something needs it.
    // A citation is exactly that, and it has to open the transcript before it
    // can scroll anywhere in it. The player is NOT inside the collapsible part,
    // so the handle below is valid either way.
    setTranscriptOpen(true);
    // Seeking IS engaging the player, and it is the case the pinned bar exists
    // for: the citation that was just pressed is far above the recording.
    setEngaged(true);
    // The audio seeks to the moment asked for, not to the snapped one: the
    // segment is a reading position, the timestamp is the evidence.
    audioRef.current?.seek(ms);
    // A beat later, so a transcript that was just un-collapsed exists to be
    // scrolled to.
    window.setTimeout(() => {
      document.getElementById(`seg-${anchor}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [segments]);

  // One nav object for every citation on the page. Spans from THIS lecture move
  // the player below; a span an answer cited from a different lecture becomes a
  // deep link instead, because the recording for it is not on screen.
  const nav: EvidenceNav = { courseId, lectureId, onSeek: seek };

  // The height the player occupies while it is still in the flow, remembered so
  // that pinning it does not collapse the page under the reader. Measured only
  // while it is in the flow -- once it is fixed, its box is out of the layout
  // and would measure as nothing.
  useEffect(() => {
    if (engaged || !audioUrl) return;
    const measure = () => {
      const h = playerSlot.current?.offsetHeight ?? 0;
      if (h > 0) setSlotHeight(h);
    };
    measure();
    // The player is shorter on a narrow screen: it drops the skip button and the
    // scrub row reflows, so the reserved height has to follow the breakpoint.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [engaged, audioUrl]);

  // `play` does not bubble, but it does propagate through the CAPTURE phase, so
  // one listener on the slot catches the player's own play button without
  // AudioPlayer having to grow a callback for it.
  useEffect(() => {
    const node = playerSlot.current;
    if (!node) return;
    const onPlay = () => setEngaged(true);
    node.addEventListener("play", onPlay, true);
    return () => node.removeEventListener("play", onPlay, true);
  }, [audioUrl]);

  // The deep link fires once per `?t=`, not once per fetch. Polling and every
  // review verdict refetch hand back a fresh `segments` array -- without this
  // the page would jump back and restart the audio under the reader every time
  // something else on it changed.
  const jumped = useRef<number | null>(null);

  useEffect(() => {
    if (jumpTo === null || !Number.isFinite(jumpTo) || !segments.length) return;
    if (jumped.current === jumpTo) return;
    jumped.current = jumpTo;
    // A beat after the transcript renders, so there is something to scroll to.
    const timer = setTimeout(() => seek(jumpTo), 250);
    return () => clearTimeout(timer);
  }, [jumpTo, segments, seek]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  // A lecture a student reached before it finished processing is not an error,
  // and must not be reported as one. The route says "not published yet"; what a
  // student needs to hear is what the product is doing about it.
  if (error) {
    const stillProcessing = /not published yet/i.test(error);
    return (
      <div className="space-y-6">
        <Link href={`/courses/${courseId}`} className="text-sm text-ink-soft hover:text-ink">
          &larr; Back to course
        </Link>
        {stillProcessing ? (
          <StillWorking>
            This lecture is still being processed. Once it is done you will find everything that
            was taught in it here, alongside the recording.
          </StillWorking>
        ) : (
          <div className="rounded-2xl border border-danger px-6 py-10 text-center">
            <p className="text-[15px] text-ink">We could not open this lecture.</p>
            <p className="mt-1.5 text-sm text-ink-soft">{error}</p>
          </div>
        )}
      </div>
    );
  }

  if (!lecture) return null;

  const durationMs = segments.length ? segments[segments.length - 1].endMs : 0;
  // Date, duration, course. Quiet, factual, and in the lecturer's units -- no
  // byte counts, no language codes, no status column.
  const meta = [
    formatDate(lecture.recordedOn ?? lecture.createdAt),
    formatDuration(durationMs),
    course ? `${course.code} · ${course.title}` : null,
  ].filter(Boolean).join("  ·  ");

  const isProblem = lecture.status === "quarantined" || lecture.status === "failed";
  const isWorking = ["pending_upload", "uploaded", "transcribing", "transcribed", "extracting"]
    .includes(lecture.status);
  // Nothing has been heard yet, so "Key content" would announce that the
  // product is busy understanding a recording it does not have. The card above
  // already says what actually happened.
  const noAudioYet = lecture.status === "pending_upload" || lecture.status === "uploaded";

  const technical = (
    <TechnicalDetails>
      <Detail label="Lecture id" value={lecture.id} />
      <Detail label="Status" value={lecture.status} />
      <Detail label="Provider status" value={lecture.providerStatus ?? "—"} />
      <Detail
        label="Source file"
        value={`${lecture.originalFilename} · ${formatBytes(lecture.fileSizeBytes)}`}
      />
      <Detail label="Language sent" value={lecture.languageCode ?? "—"} />
      <Detail label="Language detected" value={lecture.provenance?.language ?? "—"} />
      <Detail
        label="Engine"
        value={lecture.provenance?.modelSnapshot ?? lecture.provenance?.engine ?? "—"}
      />
      <Detail label="Transcript segments" value={String(segments.length)} />
      <Detail label="Detection signals" value={String(signalCount)} />
      <Detail label="Knowledge units" value={String(units.length)} />
      {lecture.errorMessage ? (
        <div>
          <p className="text-ink-faint">Reason recorded with this lecture:</p>
          <p className="mt-1">{lecture.errorMessage}</p>
        </div>
      ) : null}
      {lecture.provenance?.limitations?.length ? (
        <div>
          <p className="text-ink-faint">Provenance limitations recorded with this transcript:</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {lecture.provenance.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
      ) : null}
    </TechnicalDetails>
  );

  return (
    // Room under the last section for the pinned player, so it never covers the
    // delete control or the end of the transcript.
    <Page className={engaged ? "pb-28" : undefined}>
      <PageHeader
        eyebrow={
          <Link
            href={`/courses/${courseId}`}
            className="inline-flex items-center gap-1 text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronRightIcon size={14} className="rotate-180" />
            {course ? `${course.code} — ${course.title}` : "Back to course"}
          </Link>
        }
        title={lecture.title}
        subtitle={meta || undefined}
        action={
          // The pill is for a lecture that is not simply finished. "Published"
          // on every healthy lecture is a badge that says nothing.
          isOwner && lecture.status !== "ready" ? (
            <StatusPill tone={lectureStatusTone(lecture.status)}>
              {lectureStatusLabel(lecture.status)}
            </StatusPill>
          ) : null
        }
      />

      {/* --- Something went wrong with this recording ---------------------- */}
      {isProblem ? (
        <ProblemState lecture={lecture} courseId={courseId} isOwner={isOwner} technical={technical} />
      ) : null}

      {/* --- Still being processed ----------------------------------------
          The owner is the only one who can advance a lecture, and the only one
          this concerns. LectureProgress does the polling; this says why the
          page is not finished yet. */}
      {isWorking && isOwner ? (
        <Card>
          <div className="flex items-start gap-3.5">
            <Spinner size={18} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {WAITING_COPY[lecture.status]?.title ?? "This lecture is still being processed"}
              </p>
              {WAITING_COPY[lecture.status] ? (
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">
                  {WAITING_COPY[lecture.status].note}
                </p>
              ) : null}
              <LectureProgress
                lectureId={lectureId}
                status={lecture.status}
                onAdvanced={refresh}
                variant="detail"
              />
            </div>
          </div>
        </Card>
      ) : null}

      {/* --- Key content ---------------------------------------------------
          The knowledge panel renders this. It owns its own layout and its own
          empty and loading states; this page's job is to give it a clean slot
          at the top of the reading order and then stay out of it. */}
      {!isProblem && !noAudioYet ? (
        <Section
          title="Key content"
          description="What this lecture covered. Every line can be checked against the recording."
        >
          <LectureKnowledge units={units} loading={unitsLoading} error={unitsError} nav={nav} />
          {!isOwner && !unitsLoading && !unitsError && awaitingReview > 0 && (
            <p className="mt-4 text-sm text-ink-soft">
              {awaitingReview === 1
                ? "1 item from this lecture is waiting for your lecturer to confirm, and will appear here once they have."
                : `${awaitingReview} items from this lecture are waiting for your lecturer to confirm, and will appear here once they have.`}
            </p>
          )}
        </Section>
      ) : null}

      {/* --- Needs your attention -------------------------------------------
          Renders NOTHING when nothing is pending. An empty review box is a
          standing accusation that the lecturer is behind on work they do not
          actually have. */}
      {isOwner && !isProblem ? (
        <ActionableReview units={units} onSeek={seek} onReviewed={refresh} />
      ) : null}

      {/* --- Ask ClassMind ---------------------------------------------------
          Scoped to this lecture, with the player on screen below it, so an
          answer's citations move the recording rather than navigating away. */}
      {!isProblem ? <AskPanel courseId={courseId} lectureId={lectureId} onSeek={seek} /> : null}

      {/* --- Full lecture ----------------------------------------------------
          Evidence, not content. The player stays mounted whether or not the
          transcript is open, because a citation has to be able to seek it. */}
      <Section
        title="Full lecture"
        description="The recording and the transcript it produced."
        action={
          segments.length || rawFallback ? (
            <Button
              tone="ghost"
              size="sm"
              onClick={() => setTranscriptOpen((o) => !o)}
              aria-expanded={transcriptOpen}
            >
              {transcriptOpen ? "Hide transcript" : "Show transcript"}
              <ChevronDownIcon
                size={15}
                className={cx("transition-transform", transcriptOpen && "rotate-180")}
              />
            </Button>
          ) : null
        }
      >
        {/* The slot keeps the recording's place in the document; the inner box
            is what leaves the flow once the player has been engaged. */}
        <div
          ref={playerSlot}
          style={engaged && slotHeight ? { height: slotHeight } : undefined}
          className={cx(engaged && "min-h-[76px]")}
        >
          <div
            className={cx(
              engaged &&
                "motion-rise fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 px-4 pt-3 backdrop-blur sm:px-6",
              // Above the home indicator on a phone, and a plain 0.75rem
              // everywhere the inset is zero.
              engaged && "[padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]",
            )}
          >
            <div className={cx(engaged && "mx-auto max-w-5xl")}>
              {/* The title only appears in the pinned bar. In place, it sits
                  under a heading that already says which lecture this is. */}
              <AudioPlayer
                ref={audioRef}
                src={audioUrl}
                label={engaged ? lecture.title : undefined}
              />
            </div>
          </div>
        </div>

        {transcriptOpen ? (
          <div className="motion-fade mt-8">
            <LectureTranscript
              segments={segments}
              highlightMs={highlight}
              onSeek={seek}
              raw={rawFallback}
              showRaw={isOwner}
            />
          </div>
        ) : null}

        {isOwner ? technical : null}
      </Section>

      {/* --- Removing a mistake --------------------------------------------- */}
      {isOwner ? (
        <div className="border-t border-line pt-8">
          <DeleteLecture
            lectureId={lectureId}
            lectureTitle={lecture.title}
            courseId={courseId}
            candidateCount={signalCount}
          />
        </div>
      ) : null}
    </Page>
  );
}

// A LECTURE THAT DID NOT WORK, EXPLAINED AS A PROBLEM RATHER THAN A VERDICT.
//
// `quarantined` is the interesting one. It means the recording WAS transcribed
// and the transcript was then judged not to be a language this product serves
// -- in practice: the audio was too quiet, too short, or the transcription
// service returned something that was not this lecture at all. The lecturer
// needs three things, and none of them is the validation record: what happened,
// whether anything reached their students, and what to do next.
function ProblemState({
  lecture, courseId, isOwner, technical,
}: {
  lecture: Lecture; courseId: string; isOwner: boolean; technical: ReactNode;
}) {
  const quarantined = lecture.status === "quarantined";
  return (
    <Card className={quarantined ? "border-warn/40" : "border-danger/40"}>
      <div className="flex items-start gap-3.5">
        <AlertIcon
          size={22}
          className={cx("mt-0.5 shrink-0", quarantined ? "text-warn" : "text-danger")}
        />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-[-0.012em] text-ink">
            {quarantined
              ? "Something went wrong with this recording's transcription"
              : "This recording could not be processed"}
          </h2>

          <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            {quarantined
              ? "The audio was transcribed, but the text that came back does not read as a lecture in English or Hindi. That usually means the recording was very quiet, very short, or that the transcription service returned the wrong audio."
              : "The recording never got as far as a transcript, so there is nothing to read from it."}
          </p>

          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            <span className="font-medium text-ink">Nothing from this lecture reached your students.</span>{" "}
            It was held back automatically, and no course knowledge was built from it.
          </p>

          <div className="mt-5">
            <p className="text-sm font-medium text-ink">What to do</p>
            <ul className="mt-2 max-w-2xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
              <li>Play the recording below and check the lecture is audible.</li>
              <li>Upload it again from the course page — a clearer copy usually processes fine.</li>
              <li>If the course is taught in another language, change the course language first.</li>
            </ul>
          </div>

          {isOwner ? (
            <Link
              href={`/courses/${courseId}`}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink shadow-soft transition-colors hover:bg-accent-strong"
            >
              <UploadIcon size={16} />
              Upload this lecture again
            </Link>
          ) : null}

          {isOwner ? technical : null}
        </div>
      </div>
    </Card>
  );
}
