"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnswerView, Looking, SUGGESTIONS, type Answer } from "./AskPanel";
import type { EvidenceNav } from "./KnowledgeUnit";
import { useClassData } from "./shell/ClassContext";
import { Button, cx } from "./ui";
import { BookIcon } from "./ui/icons";

// ASK, AS A PLACE — v4's conversation-first working surface.
//
// The grammar change from v3's panel: the conversation is the page. Questions
// and answers accumulate down the surface in the order they were asked, every
// answer keeps its citations and its "not specified" gaps, and the composer
// stays fixed at the bottom of the viewport no matter how long the
// conversation gets — the one thing the operator asked for by name.
//
// ONE SURFACE, TWO SCOPES. Bare, it is the course Ask tab. Given a
// `lectureId`, it becomes the lecture page's conversation: questions scope to
// that lecture and citations seek the on-page player through `nav.onSeek`
// instead of navigating away. Same turns, same composer, same rules.
//
// THE CONVERSATION NOW TRAVELS. Each ask POSTs the visible exchange so far, so
// "give me an example" and "I didn't understand" land in context — the model
// is shown exactly what the student can see on screen, nothing more. Nothing
// on the server stores a conversation yet, and the intro says so; pretending
// otherwise would be a lie the first refresh exposes.
//
// DEGRADED MODE stays named. When no reasoning model is configured, the route
// answers with the retrieved notes themselves (`degraded: true`) and that is
// said, calmly, above the notes — because "here is what the lectures say" and
// "here is an answer written for you" are different promises, and a student
// is owed the difference.
//
// One question is in flight at a time. A conversation is sequential by
// nature, and every ask can be a paid call — the composer disables while one
// runs rather than racing and aborting like the single-answer panel had to.

interface Turn {
  id: number;
  question: string;
  state: "asking" | "done" | "failed";
  answer?: Answer;
  error?: string;
}

// How much of the visible conversation rides along with each ask. Four
// exchanges keeps follow-ups grounded without growing the prompt without
// bound; the server caps again regardless.
const HISTORY_EXCHANGES = 4;

export default function AskWorkspace({
  lectureId,
  nav: navOverride,
  intro,
  suggestions,
  bottomInset = 0,
}: {
  /** Present on the lecture page: scopes every ask to this lecture. */
  lectureId?: string;
  /** Present on the lecture page: carries onSeek so citations move the player. */
  nav?: EvidenceNav;
  intro?: { title: string; description: string };
  suggestions?: string[];
  /** Height of any bar pinned below this surface (the engaged audio player),
   *  so the composer sits above it instead of underneath it. */
  bottomInset?: number;
} = {}) {
  // Rendered only inside the class shell, whose provider is the one source of
  // which class this is — the same identity the header and rail display.
  const { courseId } = useClassData();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const inputId = useId();
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Each new turn brings itself into view; instant, because the smooth scroll
  // fights the page's own layout shift while the skeleton renders.
  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || asking) return;
    const id = nextId.current++;
    // The conversation so far, oldest first, built from the turns on screen —
    // the same exchange the student can see is exactly what the model is
    // shown, nothing more. The server caps length again regardless.
    const history = turns
      .filter((t) => t.state === "done" && t.answer)
      .slice(-HISTORY_EXCHANGES)
      .flatMap((t) => [
        { role: "student" as const, text: t.question },
        { role: "classmind" as const, text: t.answer!.answer },
      ]);
    setTurns((t) => [...t, { id, question: text, state: "asking" }]);
    setDraft("");
    setAsking(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history, ...(lectureId ? { lectureId } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as (Partial<Answer> & { error?: string }) | null;
      if (!res.ok) {
        const message =
          res.status < 500 && typeof body?.error === "string" && body.error
            ? body.error
            : "Something went wrong looking that up. Try asking again.";
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, state: "failed", error: message } : x)));
        return;
      }
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, state: "done", answer: body as Answer } : x)));
    } catch {
      setTurns((t) =>
        t.map((x) =>
          x.id === id
            ? {
                ...x,
                state: "failed",
                error: "Could not reach your lectures just now. Check your connection and try again.",
              }
            : x,
        ),
      );
    } finally {
      setAsking(false);
      inputRef.current?.focus();
    }
  }

  const nav: EvidenceNav = navOverride ?? { courseId };
  const scope = lectureId ? "lecture" : "course";
  const chips = suggestions ?? SUGGESTIONS;

  return (
    // The column claims enough viewport for the composer's sticky bottom edge
    // to mean something -- the full tab on the course Ask page, a calmer share
    // on the lecture page, where other sections live below. The empty state
    // centers in that room instead of leaving a hollow gap above the composer,
    // and everything keeps clearance so nothing renders UNDER the sticky bar
    // at first paint.
    <div className={cx("flex flex-col", lectureId ? "min-h-[44vh]" : "min-h-[62vh]")}>
      {/* aria-live so a screen reader hears the answer arrive without having
          to re-walk the page; polite, because the student just asked for it. */}
      <div
        className={cx("flex-1 pb-6", turns.length === 0 && "flex flex-col justify-center")}
        aria-live="polite"
      >
        {turns.length === 0 ? (
          <Intro
            onAsk={(q) => void ask(q)}
            disabled={asking}
            intro={intro}
            suggestions={chips}
          />
        ) : (
          <ol className="space-y-12">
            {turns.map((t) => (
              <li key={t.id}>
                {/* The question, said the way the asker said it. Right-set and
                    quiet: the answer is the content, the question is context. */}
                <div className="flex justify-end">
                  <p className="max-w-[42ch] rounded-2xl rounded-br-md bg-surface-raised px-4 py-2.5 text-[15px] leading-relaxed text-ink">
                    {t.question}
                  </p>
                </div>

                <div className="mt-6">
                  {t.state === "asking" ? (
                    <Looking scope={scope} />
                  ) : t.state === "failed" ? (
                    <p className="max-w-[52ch] text-[15px] leading-relaxed text-danger">{t.error}</p>
                  ) : t.answer ? (
                    <>
                      {t.answer.degraded && t.answer.knowledgeUnitsAvailable > 0 ? (
                        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-soft">
                          <BookIcon size={13} />
                          Showing the matching lecture notes directly — a composed answer
                          isn&rsquo;t available right now.
                        </p>
                      ) : t.answer.route === "direct" ? (
                        /* The $0 path, named. Same calm register as the degraded
                           chip: this is provenance, not a boast — the answer came
                           straight from the stored knowledge, nothing composed it. */
                        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-soft">
                          <BookIcon size={13} />
                          Answered straight from the stored lecture knowledge.
                        </p>
                      ) : null}
                      <AnswerView answer={t.answer} nav={nav} scope={scope} />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} aria-hidden="true" />
      </div>

      {/* The composer. Fixed to the viewport's bottom edge by position:sticky
          — the page scrolls beneath it, it never moves. Solid surface, no new
          blur: the material budget (two backdrop-filters app-wide) is spent.
          `bottomInset` lifts it above the lecture page's pinned player. */}
      <div
        className="sticky z-10 -mx-2 mt-10 border-t border-line bg-surface px-2 pb-4 pt-4"
        style={{ bottom: bottomInset }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
          className="flex items-center gap-3"
        >
          <label htmlFor={inputId} className="sr-only">Your question</label>
          <input
            id={inputId}
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={lectureId ? "Ask anything about this lecture" : "Ask anything about this class"}
            autoComplete="off"
            disabled={asking}
            className={cx(
              "min-w-0 flex-1 rounded-xl border border-line bg-surface-raised px-4 py-3.5",
              "text-[16px] leading-normal text-ink transition-colors",
              "placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-accent",
              "disabled:opacity-60",
            )}
          />
          <Button
            type="submit"
            tone={draft.trim() ? "primary" : "secondary"}
            size="lg"
            disabled={asking || !draft.trim()}
          >
            {asking ? "Asking…" : "Ask"}
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-ink-faint">
          Answers come only from what was said in this class&rsquo;s lectures. This
          conversation isn&rsquo;t saved yet.
        </p>
      </div>
    </div>
  );
}

// The empty conversation: what this place is, and a few ways in. Centered and
// generous — the intro is the one moment this surface is allowed to breathe
// before content takes over.
function Intro({
  onAsk,
  disabled,
  intro,
  suggestions,
}: {
  onAsk: (q: string) => void;
  disabled: boolean;
  intro?: { title: string; description: string };
  suggestions: string[];
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start pt-6 sm:pt-14">
      <p className="eyebrow-mono">Ask</p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {intro?.title ?? "Ask this class anything"}
      </h2>
      <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
        {intro?.description ??
          "Every answer is built only from what was actually said in the lectures, cited down to the second it was said — so you can hear it for yourself."}
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(s)}
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
    </div>
  );
}
