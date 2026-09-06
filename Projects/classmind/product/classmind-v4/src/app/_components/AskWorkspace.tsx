"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnswerView, Looking, SUGGESTIONS, type Answer } from "./AskPanel";
import type { EvidenceNav } from "./KnowledgeUnit";
import { useClassDataMaybe } from "./shell/ClassContext";
import { CARRIED_QUESTION_KEY } from "./ask-carry";
import { Button, Skeleton, cx } from "./ui";
import { BookIcon, ChevronDownIcon, PlusIcon } from "./ui/icons";
import { agoLabel } from "./CoursesClient";

// ASK, AS A PLACE — and now a place that REMEMBERS (2026-09-06).
//
// The conversation is the page, and since persistent conversations landed it
// is also real: stored on the server, owned by the student, resumable after a
// refresh, a navigation, a week away. Opening this surface resumes the most
// recent conversation in its scope (or the one named by ?c=); "New" starts a
// fresh thread; "Recent" lists the others. A conversation is created by its
// FIRST QUESTION, never by a page visit.
//
// CONTINUITY LIVES ON THE SERVER. Each ask sends only the question plus the
// conversation id — the server loads the stored thread as the model's
// conversational context. The client-held history blob remains only as the
// fallback shape for when the conversations migration is not applied yet, in
// which case this surface honestly says answers aren't being saved and runs
// exactly as it did before.
//
// ONE SURFACE, TWO SCOPES. Bare, it is the course Ask tab (scope 'course').
// Given a `lectureId`, it is the lecture page's conversation (scope
// 'lecture'), and citations seek the on-page player through `nav.onSeek`.
// The two scopes never see each other's threads — the server enforces it,
// this component just benefits.
//
// DEGRADED MODE stays named, and one question is in flight at a time — every
// ask can be a paid call, so the composer disables while one runs.

interface Turn {
  id: number;
  question: string;
  state: "asking" | "done" | "failed";
  answer?: Answer;
  error?: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  lastMessageAt: string;
}

interface StoredMessage {
  id: string;
  role: "student" | "classmind";
  content: string;
  payload: {
    route?: Answer["route"];
    degraded?: boolean;
    knowledgeUnitsAvailable?: number;
    sources?: Answer["sources"];
  } | null;
}

// How many of the visible exchanges ride along in EPHEMERAL fallback mode
// only; the persistent path sends none (the server holds the thread).
const HISTORY_EXCHANGES = 4;

// A stored message pair, rendered exactly as it was shown live: the persisted
// payload carries the route chip, the degraded notice and the cited sources.
function messagesToTurns(messages: StoredMessage[]): Turn[] {
  const turns: Turn[] = [];
  let counter = -1_000_000; // below the live counter, so keys never collide
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    if (m.role !== "student") continue;
    const reply = messages[i + 1]?.role === "classmind" ? messages[i + 1] : null;
    turns.push({
      id: counter++,
      question: m.content,
      state: reply ? "done" : "failed",
      error: reply ? undefined : "This answer didn't get saved. Ask again.",
      answer: reply
        ? {
            question: m.content,
            answered: true,
            answer: reply.content,
            sources: reply.payload?.sources ?? [],
            degraded: reply.payload?.degraded === true,
            route: reply.payload?.route,
            knowledgeUnitsAvailable: reply.payload?.knowledgeUnitsAvailable ?? 1,
          }
        : undefined,
    });
  }
  return turns;
}

export default function AskWorkspace({
  global = false,
  lectureId,
  nav: navOverride,
  intro,
  suggestions,
  bottomInset = 0,
  withSidebar = false,
}: {
  /** The STUDENT scope: the whole accessible academic world, from /ask. The
   *  server enumerates the boundary from the session; this flag only picks
   *  the endpoints and the wording. */
  global?: boolean;
  /** The chat-first workspace (global /ask): an AskSidebar drives the active
   *  conversation through the URL (?c=), so this pane hides its own Recent/New
   *  bar, reacts to ?c= changes to switch or start fresh, and opens to an empty
   *  new chat rather than auto-resuming the most recent thread. Course and
   *  lecture Ask keep their embedded, mount-only behavior (withSidebar=false). */
  withSidebar?: boolean;
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
  // Inside the class shell the provider names the class; on /ask there is no
  // shell and no class — the global boundary is the server's to enumerate.
  const classData = useClassDataMaybe();
  const courseId = global ? null : (classData?.courseId ?? null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("c");
  // A question carried in from another surface (the home hero): asked once,
  // as a FRESH thread — the student typed something new, not a continuation.
  // It arrives via sessionStorage (see CARRIED_QUESTION_KEY), read once here
  // and removed on mount below, so it can never fire twice.
  const [carriedQuestion] = useState<string | null>(() => {
    if (!global || requestedId || typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(CARRIED_QUESTION_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.removeItem(CARRIED_QUESTION_KEY);
    } catch {
      /* nothing to consume */
    }
  }, []);
  const autoAsked = useRef(false);

  const askEndpoint = global ? "/api/ask" : `/api/courses/${courseId}/ask`;
  const listEndpoint = global
    ? "/api/ask/conversations"
    : `/api/courses/${courseId}/conversations${lectureId ? `?lectureId=${encodeURIComponent(lectureId)}` : ""}`;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);

  // The persistence layer's honest states: probing on mount, running with the
  // store, or running ephemeral because the store is not there.
  const [storeState, setStoreState] = useState<"loading" | "ok" | "unavailable">("loading");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);

  const inputId = useId();
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recentRef = useRef<HTMLDivElement | null>(null);

  // Each new turn brings itself into view; instant, because the smooth scroll
  // fights the page's own layout shift while the skeleton renders.
  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  // Reflect the active conversation in the URL, so a refresh, a shared tab, a
  // back-navigation all land on THIS thread rather than merely the most
  // recent one. replace, not push: switching threads is not history.
  const syncUrl = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("c", id);
      else params.delete("c");
      // ?q= no longer does anything (the carried question rides
      // sessionStorage); scrub it from old links so they stay clean.
      params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const loadConversation = useCallback(async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
    if (!res.ok) return false;
    const body = (await res.json()) as {
      state: string;
      conversation?: { id: string; title: string };
      messages?: StoredMessage[];
    };
    if (body.state !== "ok" || !body.conversation) return false;
    setConversationId(body.conversation.id);
    setConversationTitle(body.conversation.title);
    setTurns(messagesToTurns(body.messages ?? []));
    return true;
  }, []);

  // Mount: find this scope's conversations and resume. ?c= wins; otherwise the
  // most recent thread here; otherwise a fresh intro. A failed probe degrades
  // to the ephemeral surface rather than blocking the student from asking.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(listEndpoint);
        const body = (await res.json().catch(() => null)) as {
          state?: string;
          conversations?: ConversationSummary[];
        } | null;
        if (cancelled) return;
        if (!res.ok || !body || body.state !== "ok") {
          setStoreState("unavailable");
          return;
        }
        const list = body.conversations ?? [];
        setRecent(list);
        setStoreState("ok");
        // A carried-in question means the student is STARTING something: no
        // auto-resume — the fresh thread is created by the ask itself.
        const target = carriedQuestion ? null : (requestedId ?? list[0]?.id);
        if (target) {
          const loaded = await loadConversation(target);
          if (cancelled) return;
          if (!loaded && requestedId) {
            setResumeError("That conversation could not be opened. Starting fresh.");
            syncUrl(null);
          }
        }
      } catch {
        if (!cancelled) setStoreState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately mount-only per scope: resuming re-runs when the surface
    // (course/lecture/global) changes, not when the ?c= we ourselves write
    // changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lectureId, global]);

  // The Recent popover closes on outside pointerdown and Escape, same manners
  // as the user menu.
  useEffect(() => {
    if (!recentOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!recentRef.current?.contains(e.target as Node)) setRecentOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecentOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [recentOpen]);

  function startFresh() {
    if (asking) return;
    setConversationId(null);
    setConversationTitle(null);
    setTurns([]);
    setResumeError(null);
    setRecentOpen(false);
    syncUrl(null);
    inputRef.current?.focus();
  }

  async function openConversation(id: string) {
    if (asking || id === conversationId) {
      setRecentOpen(false);
      return;
    }
    setRecentOpen(false);
    setResumeError(null);
    const loaded = await loadConversation(id);
    if (loaded) syncUrl(id);
    else setResumeError("That conversation could not be opened.");
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || asking) return;
    // A class surface without its provider is a wiring bug; refuse quietly
    // rather than fetch /api/courses/null/ask.
    if (!global && !courseId) return;
    const id = nextId.current++;
    const persistent = storeState === "ok";
    // Ephemeral fallback only: the visible exchange rides along, exactly the
    // pre-persistence contract. The persistent path sends none of it — the
    // server's stored thread is the truth.
    const history = persistent
      ? []
      : turns
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
      const res = await fetch(askEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          ...(!global && lectureId ? { lectureId } : {}),
          ...(persistent
            ? conversationId
              ? { conversationId }
              : { persist: true }
            : { history }),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | (Partial<Answer> & {
            error?: string;
            conversation?: { id: string | null; title: string | null; state: string } | null;
          })
        | null;
      if (!res.ok) {
        const message =
          res.status < 500 && typeof body?.error === "string" && body.error
            ? body.error
            : "Something went wrong looking that up. Try asking again.";
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, state: "failed", error: message } : x)));
        return;
      }
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, state: "done", answer: body as Answer } : x)));
      const convo = body?.conversation as
        | { id: string | null; title: string | null; state: string; note?: string | null }
        | null
        | undefined;
      if (persistent && convo) {
        if (convo.state === "ok" && convo.id) {
          if (convo.id !== conversationId) {
            setConversationId(convo.id);
            syncUrl(convo.id);
          }
          if (convo.title) setConversationTitle(convo.title);
          setRecent((r) => {
            const rest = r.filter((c) => c.id !== convo.id);
            return [
              { id: convo.id!, title: convo.title ?? "New conversation", lastMessageAt: new Date().toISOString() },
              ...rest,
            ];
          });
        } else if (convo.note?.includes("20260906150000")) {
          // The store is genuinely gone (migration state): run ephemeral from
          // here and say so. A TRANSIENT write failure does not latch -- the
          // answer is on screen, this one exchange wasn't saved, and the next
          // ask simply tries persistence again.
          setStoreState("unavailable");
        }
      }
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

  const nav: EvidenceNav = navOverride ?? (courseId ? { courseId } : {});
  const scope = lectureId ? "lecture" : "course";
  const chips = suggestions ?? SUGGESTIONS;
  const showBar = storeState === "ok" && (turns.length > 0 || recent.length > 0);

  // The question carried in from the home hero: asked exactly once, after the
  // store probe settles, as this surface's first turn.
  useEffect(() => {
    if (!carriedQuestion || autoAsked.current) return;
    if (storeState === "loading" || asking || turns.length > 0) return;
    autoAsked.current = true;
    void ask(carriedQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carriedQuestion, storeState]);

  return (
    // The column claims enough viewport for the composer's sticky bottom edge
    // to mean something -- the full tab on the course Ask page, a calmer share
    // on the lecture page, where other sections live below.
    <div className={cx("flex flex-col", lectureId ? "min-h-[44vh]" : "min-h-[62vh]")}>
      {/* --- The conversation bar: where am I, and where else could I be ---- */}
      {showBar ? (
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-3">
          <p className="chip-mono min-w-0 truncate text-[12px] text-ink-soft" title={conversationTitle ?? undefined}>
            {conversationTitle ?? "New conversation"}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {recent.length > 0 ? (
              <div ref={recentRef} className="relative">
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => setRecentOpen((o) => !o)}
                  aria-expanded={recentOpen}
                  aria-haspopup="listbox"
                >
                  Recent
                  <ChevronDownIcon size={14} className={cx("transition-transform", recentOpen && "rotate-180")} />
                </Button>
                {recentOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-72 max-w-[80vw] rounded-xl border border-line bg-surface-raised p-1.5 shadow-lift">
                    <ul role="listbox" aria-label="Recent conversations" className="max-h-72 overflow-y-auto">
                      {recent.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={c.id === conversationId}
                            onClick={() => void openConversation(c.id)}
                            className={cx(
                              "w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-sunken",
                              c.id === conversationId && "bg-surface-sunken",
                            )}
                          >
                            <span className="block truncate text-[13px] text-ink">{c.title}</span>
                            <span className="mt-0.5 block text-[11px] text-ink-faint">
                              {agoLabel(c.lastMessageAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button tone="ghost" size="sm" onClick={startFresh} disabled={asking}>
              <PlusIcon size={14} />
              New
            </Button>
          </div>
        </div>
      ) : null}

      {resumeError ? (
        <p className="mb-4 text-[13px] text-warn">{resumeError}</p>
      ) : null}

      {/* aria-live so a screen reader hears the answer arrive without having
          to re-walk the page; polite, because the student just asked for it. */}
      <div
        className={cx(
          "flex-1 pb-6",
          storeState !== "loading" && turns.length === 0 && !lectureId && "flex flex-col justify-center",
        )}
        aria-live="polite"
      >
        {storeState === "loading" ? (
          <div role="status" aria-busy="true" className="space-y-6 pt-4">
            <span className="sr-only">Loading your conversation.</span>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-56 rounded-2xl" />
            </div>
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : turns.length === 0 ? (
          <Intro onAsk={(q) => void ask(q)} disabled={asking} intro={intro} suggestions={chips} />
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
                      <AnswerView answer={t.answer} nav={nav} scope={scope} collapsibleSources />
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
            placeholder={
              global
                ? "Ask about anything across your subjects"
                : lectureId
                  ? "Ask anything about this lecture"
                  : "Ask anything about this class"
            }
            autoComplete="off"
            disabled={asking || storeState === "loading"}
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
            disabled={asking || storeState === "loading" || !draft.trim()}
          >
            {asking ? "Asking…" : "Ask"}
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-ink-faint">
          {global
            ? storeState === "unavailable"
              ? "Answers come only from what was recorded in your subjects' lectures. This conversation isn't being saved right now."
              : "Answers come only from what was recorded in your subjects' lectures. Your conversations are saved — pick up any of them where you left off."
            : storeState === "unavailable"
              ? "Answers come only from what was said in this class's lectures. This conversation isn't being saved right now."
              : "Answers come only from what was said in this class's lectures. Your conversations are saved — pick up any of them where you left off."}
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
    <div className="mx-auto flex w-full max-w-xl flex-col items-start py-6">
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
