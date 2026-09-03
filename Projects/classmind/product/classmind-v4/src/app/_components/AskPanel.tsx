"use client";

import { Fragment, useEffect, useId, useRef, useState, type ReactElement } from "react";
import {
  EvidenceList,
  KindBadge,
  Steps,
  type EvidenceNav,
  type KnowledgeUnit,
} from "./KnowledgeUnit";
import { Button, EmptyState, Section, Skeleton, cx } from "./ui";
import { AlertIcon, BookIcon } from "./ui/icons";

// LAYER 4 -- a student asks the course's memory a question.
//
// The order of this screen is the whole argument. The answer comes first and in
// reading type, because a student asked a question and everything else on the
// page is footnotes to it. Underneath sit the exact things the answer was built
// from, each opening onto the seconds of audio where the lecturer said them --
// an answer nobody can check is worth less than no answer. Last, and only when
// there is something to say, comes what the lecturer never specified, which is
// usually the thing the student actually needed to know.
//
// What is deliberately NOT here: any account of how the answer was produced. A
// student is not choosing a model, and a banner explaining which pipeline ran
// asks them to grade the machinery instead of reading the answer. The route
// still reports `degraded`; this component reads it and shows nothing, because
// in that mode the prose is a plain listing of the matching lecture knowledge,
// which is a worse answer -- not a less trustworthy one.

// A cited unit: the stored shape minus the two fields the route does not send,
// plus the citation number the prose refers back to.
export type Source = Omit<KnowledgeUnit, "courseId" | "confidence"> & { ref: number };

export interface Answer {
  question: string;
  answered: boolean;
  answer: string;
  sources: Source[];
  /** On the wire and deliberately never rendered -- see the note above. */
  degraded: boolean;
  /** How the answer was produced: "direct" cost nothing (answered from stored
   *  fields, no model call), "model" was one billed call. Optional so an older
   *  server shape still renders. */
  route?: "model" | "direct" | "degraded" | "no_knowledge";
  knowledgeUnitsAvailable: number;
}

// The four questions the product exists to answer, in the words a student would
// use. A blank box invites a blank stare; these say what kind of thing can be
// asked here without anyone having to write instructions.
export const SUGGESTIONS = [
  "What was taught?",
  "What assignment was given?",
  "Was there a deadline?",
  "What did I miss?",
];

export default function AskPanel({
  courseId,
  lectureId,
  onSeek,
}: {
  courseId: string;
  /** When present, ask is scoped to this lecture AND the player is on screen. */
  lectureId?: string;
  /** Present only on the lecture page: moves the audio player + highlights transcript. */
  onSeek?: (ms: number) => void;
}): ReactElement {
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputId = useId();

  // Impatience, handled. A student who types a second question before the first
  // lands must not have the older answer land on top of the newer one, and
  // fetch gives no ordering guarantee at all. The counter decides which
  // response is still wanted; the abort merely stops the loser wasting a model
  // call and a round trip.
  const seq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setQ(text);

    const mine = ++seq.current;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setAsking(true);
    setError(null);

    // Lecture scope when the student is looking at a lecture: "what did I miss"
    // is a question about one recording, and answering it from the whole course
    // drags in material they did not ask about.
    const url =
      `/api/courses/${courseId}/ask?q=${encodeURIComponent(text)}` +
      (lectureId ? `&lectureId=${encodeURIComponent(lectureId)}` : "");

    try {
      const res = await fetch(url, { signal: controller.signal });
      const body = (await res.json().catch(() => null)) as
        | (Partial<Answer> & { error?: string })
        | null;

      if (mine !== seq.current) return;

      if (!res.ok) {
        setAnswer(null);
        // Below 500 the message was written for a person by the route itself
        // ("That lecture is not part of this course."). At 500 it is whatever
        // threw -- a driver string, a stack -- and a student should never be
        // handed that to interpret.
        setError(
          res.status < 500 && typeof body?.error === "string" && body.error
            ? body.error
            : "Something went wrong looking that up. Try asking again.",
        );
        return;
      }

      setAnswer(body as Answer);
    } catch {
      // Reached on a dropped connection and on our own abort. The abort case is
      // filtered out by the sequence check, so anything left is a real failure.
      if (mine !== seq.current) return;
      setAnswer(null);
      setError("Could not reach your lectures just now. Check your connection and try again.");
    } finally {
      if (mine === seq.current) setAsking(false);
    }
  }

  const scope = lectureId ? "lecture" : "course";

  // Built once and handed down. Every timecode decides for itself whether to
  // move the player or open the lecture, based on which lecture ITS span came
  // from -- an answer read on one lecture page can cite another, and those
  // citations have to be links even though a player is on screen.
  const nav: EvidenceNav = { courseId, lectureId, onSeek };

  return (
    // `Section` rather than a hand-rolled heading: the ask panel is one band of
    // a page that has other bands, and a heading a few pixels off from theirs is
    // exactly the drift the shared kit exists to prevent.
    <Section
      title="Ask ClassMind"
      description={`Every answer comes from what was actually said in ${
        scope === "lecture" ? "this lecture" : "your lectures"
      }, down to the second it was said.`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <label htmlFor={inputId} className="sr-only">
          Your question
        </label>
        <input
          id={inputId}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={scope === "lecture" ? "Ask anything about this lecture" : "Ask anything about this course"}
          autoComplete="off"
          className={cx(
            "min-w-0 flex-1 rounded-xl border border-line bg-surface-raised px-4 py-3.5",
            "text-[16px] leading-normal text-ink transition-colors",
            "placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-accent",
          )}
        />
        {/* One dominant action, and it is full width where a thumb has to reach
            it. `size="lg"` matches the input's height so the pair reads as one
            control on a wide screen.

            Quiet until there is a question. A half-faded primary is ambiguous
            between disabled and broken; a secondary that turns into the
            glowing primary the moment text exists says what the state is and
            what typing buys — and the disabled guard stays, because an empty
            ask is still a paid call refused. */}
        <Button
          type="submit"
          tone={q.trim() ? "primary" : "secondary"}
          size="lg"
          disabled={asking || !q.trim()}
          className="w-full sm:w-auto"
        >
          {asking ? "Asking…" : "Ask"}
        </Button>
      </form>

      <div className="mt-3.5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={asking}
            onClick={() => void ask(s)}
            className={cx(
              "rounded-full border border-line px-3.5 py-1.5 text-[13px] text-ink-soft",
              "transition-colors hover:border-ink-faint/60 hover:text-ink",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* One live region across every state, so a screen reader hears the wait,
          the failure and the answer from the same place rather than being told
          three separate regions appeared. */}
      <div aria-live="polite" aria-busy={asking} className="mt-8">
        {asking ? (
          <Looking scope={scope} />
        ) : error ? (
          <p className="max-w-[52ch] text-[15px] leading-relaxed text-danger">{error}</p>
        ) : answer ? (
          <AnswerView answer={answer} nav={nav} scope={scope} />
        ) : null}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------------------
   Waiting
--------------------------------------------------------------------------- */

// A sentence about what is happening and three grey lines where the answer will
// be. No spinner: a spinner says "something is running", which the student can
// already see, whereas the skeleton says how much text is about to arrive and
// keeps the page from jumping when it does.
export function Looking({ scope }: { scope: "lecture" | "course" }) {
  return (
    <div className="motion-fade">
      <p className="text-[15px] leading-relaxed text-ink-soft">
        {scope === "lecture" ? "Looking through the lecture…" : "Looking through your lectures…"}
      </p>
      <div className="mt-5 space-y-3">
        <Skeleton className="h-4 w-full max-w-[38rem]" />
        <Skeleton className="h-4 w-full max-w-[34rem]" />
        <Skeleton className="h-4 w-3/5 max-w-[20rem]" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The answer
--------------------------------------------------------------------------- */

const SECTION_HEADING =
  "text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint";

export function AnswerView({
  answer,
  nav,
  scope,
}: {
  answer: Answer;
  nav: EvidenceNav;
  scope: "lecture" | "course";
}) {
  // Which source is briefly lit up after a citation was clicked. Held here
  // rather than on each source so only one can be highlighted at a time.
  const [flashed, setFlashed] = useState<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const sourceEls = useRef(new Map<number, HTMLLIElement>());
  const domId = useId();

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  function goToSource(ref: number) {
    const el = sourceEls.current.get(ref);
    if (!el) return;
    // Focus first, scroll second: a keyboard or screen-reader user has to be
    // MOVED to the source, not merely have it scrolled past them. `preventScroll`
    // stops the browser's instant jump from fighting the smooth one below.
    el.focus({ preventScroll: true });
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });

    setFlashed(ref);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashed(null), 1800);
  }

  // Nothing has been reconstructed for this course or lecture yet, so there is
  // no memory to question. Said as a state of the world, not as a failure of the
  // question the student just typed.
  if (answer.knowledgeUnitsAvailable === 0) {
    return (
      <EmptyState
        icon={<BookIcon size={20} />}
        title={scope === "lecture" ? "This lecture has no notes yet" : "There is nothing to answer from yet"}
        description={
          scope === "lecture"
            ? "Once the recording has been read for what was taught, you can ask anything about it and get the moment it was said."
            : "Once a lecture has been recorded and read for what was taught, you can ask anything about it here."
        }
      />
    );
  }

  const gaps = aggregateGaps(answer.sources);

  return (
    <div className="motion-rise">
      {/* `prose-reading` is the one type scale in this product meant for reading
          rather than scanning; `whitespace-pre-wrap` because the answer can come
          back as one line per item, and collapsing that turns a list into a
          paragraph. */}
      <div className="prose-reading whitespace-pre-wrap">
        <Cited text={answer.answer} sources={answer.sources} onGo={goToSource} />
      </div>

      {answer.sources.length ? (
        <div className="mt-12">
          <h3 className={SECTION_HEADING}>From the lecture</h3>
          <ol className="mt-6 space-y-10">
            {answer.sources.map((s) => (
              <li
                key={s.id}
                id={`${domId}-source-${s.ref}`}
                tabIndex={-1}
                ref={(el) => {
                  if (el) sourceEls.current.set(s.ref, el);
                  else sourceEls.current.delete(s.ref);
                }}
                className={cx(
                  "-mx-3 rounded-xl px-3 py-2 transition-colors duration-500",
                  flashed === s.ref && "bg-accent-soft",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* The same number the prose used, so walking from a sentence
                      to the thing it came from needs no guessing. */}
                  <span className="font-mono text-[11px] tabular-nums text-ink-faint">
                    [{s.ref}]
                  </span>
                  <KindBadge kind={s.kind} />
                </div>

                <h4 className="mt-2.5 max-w-[62ch] text-[17px] leading-snug font-semibold tracking-[-0.012em] text-ink">
                  {s.title}
                </h4>

                {/* On a course page every source needs naming; on a lecture page
                    only the ones that came from somewhere else do -- saying "this
                    lecture" under every item on the page you are already on is
                    noise that hides the one item that is not from here. */}
                {!nav.lectureId || s.lectureId !== nav.lectureId ? (
                  <p className="mt-1 text-[13px] text-ink-faint">{s.lectureTitle}</p>
                ) : null}

                {s.summary ? (
                  <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
                    {s.summary}
                  </p>
                ) : null}

                <Steps steps={s.steps} id={s.id} />
                <EvidenceList evidence={s.evidence} nav={nav} heading="What was said" />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {gaps.length ? (
        <div className="mt-12">
          <h3 className={cx(SECTION_HEADING, "flex items-center gap-1.5 text-warn")}>
            <AlertIcon size={13} />
            Not specified in the lecture
          </h3>
          {/* Written as its own section rather than reusing `NotSpecified`,
              which is a per-unit treatment: repeated once under each source, the
              same missing deadline would be stated three times. The amber rule
              and the calm wording are kept, because a gap is information about
              the lecture -- nobody did anything wrong. */}
          <ul className="mt-4 max-w-[62ch] space-y-2 border-l-2 border-warn/50 pl-4 text-[15px] leading-relaxed text-ink-soft">
            {gaps.map((g, i) => (
              <li key={`gap-${i}`}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Citations
--------------------------------------------------------------------------- */

// The split keeps its delimiters, so the prose survives intact and every `[n]`
// arrives as its own fragment. Two digits is the ceiling because the route
// numbers the units it actually used, and an answer built from more than a
// couple of dozen of them is not an answer.
const CITATION = /(\[\d{1,2}\])/g;

function Cited({
  text,
  sources,
  onGo,
}: {
  text: string;
  sources: Source[];
  onGo: (ref: number) => void;
}) {
  const known = new Set(sources.map((s) => s.ref));
  const parts = text.split(CITATION);

  return (
    <>
      {parts.map((part, i) => {
        const n = /^\[(\d{1,2})\]$/.exec(part);
        // A marker pointing at a source that was not sent stays plain text. A
        // chip that scrolls nowhere is worse than a visible bracket, because it
        // looks like the interface is broken rather than the citation.
        //
        // Wrapped in a keyed Fragment because a bare string in an array cannot
        // carry a key, and the array is rebuilt every time an answer arrives.
        if (!n || !known.has(Number(n[1]))) {
          return <Fragment key={`part-${i}`}>{part}</Fragment>;
        }
        const ref = Number(n[1]);
        return (
          <button
            key={`part-${i}`}
            type="button"
            onClick={() => onGo(ref)}
            aria-label={`Jump to source ${ref}`}
            className={cx(
              "relative -top-[0.35em] mx-0.5 inline-flex items-center rounded-md border border-line",
              "px-1.5 py-0.5 align-baseline font-mono text-[10px] leading-none tabular-nums text-ink-faint",
              "transition-colors hover:border-accent hover:text-accent",
            )}
          >
            {ref}
          </button>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Gaps
--------------------------------------------------------------------------- */

// What the lecturer never said, gathered across every source the answer used.
//
// De-duplicated on a normalised form because two units built from the same
// spoken passage routinely record the same gap in slightly different words of
// punctuation; the student should be told once that no submission date was
// given, not once per citation.
function aggregateGaps(sources: Source[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    for (const raw of s.unspecified) {
      const text = raw.trim();
      const key = text.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
  }
  return out;
}
