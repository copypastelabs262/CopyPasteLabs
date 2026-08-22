"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CandidateReview, { type Candidate, type Review } from "./CandidateReview";
import LectureProgress from "./LectureProgress";
import { mmss } from "./KnowledgePanel";
import { formatBytes, STATUS_LABEL } from "./Input";

interface Segment { startMs: number; endMs: number; charStart: number; charEnd: number; text: string }
interface Lecture {
  id: string; courseId: string; title: string; status: string;
  providerStatus: string | null; originalFilename: string; fileSizeBytes: number;
  languageCode: string | null;
  provenance: { engine?: string; modelSnapshot?: string; processingTimeMs?: number;
    language?: string; limitations?: string[] } | null;
  errorMessage: string | null; createdAt: string; completedAt: string | null;
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
  const [segments, setSegments] = useState<Segment[]>([]);
  const [rawFallback, setRawFallback] = useState<unknown>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [highlight, setHighlight] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

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
        setCandidates(b.candidates ?? []); setReviews(b.reviews ?? []);
        setAudioUrl(b.audioUrl ?? null); setError(null);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lectureId, version]);

  // Seek audio and scroll the transcript to a moment. This is the durable
  // anchor from Capture Contract Article 7 made clickable.
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
    if (audioRef.current) {
      // The audio seeks to the moment asked for, not to the snapped one: the
      // segment is a reading position, the timestamp is the evidence.
      audioRef.current.currentTime = ms / 1000;
      void audioRef.current.play().catch(() => undefined);
    }
    document.getElementById(`seg-${anchor}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [segments]);

  useEffect(() => {
    if (jumpTo === null || !Number.isFinite(jumpTo) || !segments.length) return;
    // A beat after the transcript renders, so there is something to scroll to.
    const timer = setTimeout(() => seek(jumpTo), 250);
    return () => clearTimeout(timer);
  }, [jumpTo, segments, seek]);

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!lecture) return null;

  return (
    <div className="space-y-8">
      <header>
        <Link href={`/courses/${courseId}`} className="text-sm text-zinc-500 hover:underline">
          ← Back to course
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{lecture.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {STATUS_LABEL[lecture.status] ?? lecture.status}
          {lecture.providerStatus ? ` · ${lecture.providerStatus}` : ""} ·{" "}
          {formatBytes(lecture.fileSizeBytes)}
          {lecture.languageCode ? ` · sent as ${lecture.languageCode}` : ""}
          {lecture.provenance?.language ? ` · detected ${lecture.provenance.language}` : ""}
        </p>
        {lecture.errorMessage ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{lecture.errorMessage}</p>
        ) : null}
        {/* Owner only: both routes behind this are owner-guarded, and a student
            has nothing to advance anyway. */}
        {isOwner ? (
          <LectureProgress lectureId={lectureId} status={lecture.status} onAdvanced={refresh} />
        ) : null}
      </header>

      {audioUrl ? (
        <audio ref={audioRef} controls src={audioUrl} className="w-full" preload="none" />
      ) : null}

      {lecture.provenance?.limitations?.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Provenance limitations recorded with this transcript</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {lecture.provenance.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
      ) : null}

      {isOwner ? (
        <CandidateReview
          candidates={candidates} reviews={reviews}
          onSeek={seek} onReviewed={() => setVersion((v) => v + 1)}
        />
      ) : null}

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Transcript</h2>
        {segments.length ? (
          <div className="mt-3 rounded-lg border border-zinc-200 p-5 leading-8 dark:border-zinc-800">
            {segments.map((s, i) => (
              <span key={`${s.startMs}-${i}`} id={`seg-${s.startMs}`}>
                <button
                  onClick={() => seek(s.startMs)}
                  className="mr-1 select-none font-mono text-xs text-zinc-400 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                >
                  [{mmss(s.startMs)}]
                </button>
                <span className={highlight === s.startMs ? "bg-yellow-200 dark:bg-yellow-900" : ""}>
                  {s.text}
                </span>{" "}
              </span>
            ))}
          </div>
        ) : rawFallback ? (
          <>
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              The transcript could not be normalized — this provider response shape is not one
              the normalizer recognises. Shown raw rather than as an empty transcript.
            </p>
            <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-zinc-200 p-4 text-xs dark:border-zinc-800">
              {JSON.stringify(rawFallback, null, 2)}
            </pre>
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No transcript yet.</p>
        )}
      </section>
    </div>
  );
}
