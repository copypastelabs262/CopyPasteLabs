"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { AudioIcon, PlayIcon } from "./ui/icons";
import { mmss } from "./KnowledgeUnit";

// The recording, and the one control every citation on the page reaches for.
//
// Article 7 makes time in the audio the durable anchor for everything the
// system claims. This component is what turns that anchor into something a
// student can press: it exposes `seek(ms)` on a ref so a knowledge unit, an
// answer citation and a transcript paragraph all move the same player rather
// than each owning a copy of it.
//
// The native controls are deliberately not used. They are a different visual
// language in every browser, they cannot be styled to sit quietly under a
// heading, and their scrub bar is the wrong size for a thumb on a phone -- and
// this is the one control on the page that has to work on a phone.

export interface AudioPlayerHandle {
  /** Move the recording to a moment and start playing from it. */
  seek: (ms: number) => void;
  play: () => void;
  pause: () => void;
  /** Where the recording is now, in milliseconds. */
  currentMs: () => number;
}

// A pause glyph, drawn here rather than added to the shared set: it exists only
// as the other half of this one button, and a set grows by need, not by pairs.
function PauseGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" aria-hidden="true" focusable="false"
    >
      <path d="M9.5 5.5v13M14.5 5.5v13" />
    </svg>
  );
}

function SkipBackGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      <path d="M11 8.5 5.5 12 11 15.5v-7Z" />
      <path d="M18.5 8.5 13 12l5.5 3.5v-7Z" />
    </svg>
  );
}

const AudioPlayer = forwardRef<AudioPlayerHandle, { src: string | null; label?: string }>(
  function AudioPlayer({ src, label }, ref) {
    const el = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [currentMs, setCurrentMs] = useState(0);
    const [durationMs, setDurationMs] = useState(0);
    // A recording that will not load is a fact worth stating once, quietly. It
    // does not stop the rest of the page working -- the transcript still reads
    // and every citation still scrolls to its line.
    const [failed, setFailed] = useState(false);
    // Dragging the scrubber must not fight the playhead: while a thumb is down,
    // time updates are ignored and the handle follows the finger.
    const [scrubbing, setScrubbing] = useState(false);

    const move = useCallback((ms: number) => {
      const audio = el.current;
      if (!audio) return;
      audio.currentTime = Math.max(0, ms / 1000);
      setCurrentMs(Math.max(0, ms));
    }, []);

    useImperativeHandle(ref, () => ({
      seek(ms) {
        move(ms);
        // Playing on seek is the point: a student pressing a timestamp wants to
        // HEAR it. A rejected promise means autoplay was blocked, which is the
        // browser's call to make and not an error to report.
        void el.current?.play().catch(() => undefined);
      },
      play() { void el.current?.play().catch(() => undefined); },
      pause() { el.current?.pause(); },
      currentMs: () => (el.current ? Math.floor(el.current.currentTime * 1000) : 0),
    }), [move]);

    // A new signed URL for the same lecture is still the same recording; the
    // failure flag must not survive it, or one expired URL would permanently
    // mark the audio as broken.
    //
    // Adjusted DURING render rather than in an effect. A setState inside an
    // effect runs after the browser has already been handed a paint, so the
    // stale value is shown for a frame and every consumer re-renders a second
    // time; React re-runs this component before committing anything, so the
    // reset is invisible. Nothing outside this component is touched, which is
    // what makes it safe to do here.
    const [srcShown, setSrcShown] = useState(src);
    if (src !== srcShown) {
      setSrcShown(src);
      setFailed(false);
    }

    if (!src || failed) {
      return (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-5 py-4">
          <AudioIcon size={18} className="shrink-0 text-ink-faint" />
          <p className="text-sm text-ink-soft">
            The recording is not available right now. The transcript below is complete, and every
            timestamp still jumps to the right line.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-line bg-surface-raised/85 px-4 py-3.5 backdrop-blur sm:px-5">
        <audio
          ref={el}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            setDurationMs(Number.isFinite(d) ? Math.floor(d * 1000) : 0);
          }}
          onTimeUpdate={(e) => {
            if (!scrubbing) setCurrentMs(Math.floor(e.currentTarget.currentTime * 1000));
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setFailed(true)}
        />

        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => {
              const audio = el.current;
              if (!audio) return;
              if (audio.paused) void audio.play().catch(() => undefined);
              else audio.pause();
            }}
            aria-label={playing ? "Pause the recording" : "Play the recording"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform hover:scale-105 active:scale-95"
          >
            {playing ? <PauseGlyph size={18} /> : <PlayIcon size={18} className="ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => move(Math.max(0, currentMs - 10_000))}
            aria-label="Back ten seconds"
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink sm:flex"
          >
            <SkipBackGlyph size={17} />
          </button>

          <div className="min-w-0 flex-1">
            {label ? (
              <p className="mb-1 truncate text-xs text-ink-soft">{label}</p>
            ) : null}
            <input
              type="range"
              min={0}
              max={durationMs || 1}
              step={500}
              value={Math.min(currentMs, durationMs || 1)}
              disabled={durationMs === 0}
              onPointerDown={() => setScrubbing(true)}
              onPointerUp={() => setScrubbing(false)}
              onChange={(e) => move(Number(e.target.value))}
              aria-label="Position in the recording"
              aria-valuetext={mmss(currentMs)}
              // `accent-color` paints the thumb AND the filled portion of the
              // track natively, which is one fewer element to keep in sync with
              // the playhead than a hand-drawn progress bar would be.
              className="h-1.5 w-full cursor-pointer rounded-full accent-accent disabled:cursor-default"
            />
          </div>

          <p className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
            {mmss(currentMs)}
            <span className="text-ink-faint">
              {durationMs ? ` / ${mmss(durationMs)}` : ""}
            </span>
          </p>
        </div>
      </div>
    );
  },
);

export default AudioPlayer;
