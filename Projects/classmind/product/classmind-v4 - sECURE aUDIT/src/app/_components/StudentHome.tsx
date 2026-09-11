"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CARRIED_QUESTION_KEY } from "./ask-carry";
import { Button, Card, EmptyState, Page, Section, cx } from "@/app/_components/ui";
import { ChevronRightIcon, KeyIcon, SearchIcon } from "@/app/_components/ui/icons";
import { agoLabel, type RecentConversation, type StudentOverview } from "./CoursesClient";

// THE STUDENT HOME — Ask-first (Phase 2).
//
// Opening ClassMind is opening a conversation with your academic self, so the
// home is a greeting and one large place to ask — not a dashboard. What used to
// be here (a to-do feed, a courses grid, a "recently added" list) either lives
// in its own destination now (My Classes, a course's Assignments tab) or is
// answered BY asking ("Do I have anything to do?"). The only thing kept beside
// the composer is a short list of recent conversations, because continuing a
// thought is the one thing a returning student most wants to do next.
//
// The composer carries its question into the global Ask flow through a
// consumed-once sessionStorage key (never the URL), so nothing is asked — and
// no money spent — on a page load or a crafted link. Preserved from Phase 1.

interface Props {
  eyebrow: string;
  data: StudentOverview;
  onJoinCourse: () => void;
}

const PROMPTS = [
  "Do I have anything to do?",
  "What is due next?",
  "What should I study first?",
  "Summarise my last lecture",
];

export default function StudentHome({ eyebrow, data, onJoinCourse }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const hasCourses = data.courses.length > 0;
  const recent = data.recentConversations ?? [];

  function askGlobal(question: string) {
    const q = question.trim();
    if (q) {
      try {
        sessionStorage.setItem(CARRIED_QUESTION_KEY, q);
      } catch {
        /* open /ask empty */
      }
    }
    router.push("/ask");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    askGlobal(draft);
  }

  return (
    <Page>
      {/* The greeting + the one thing to do here: ask. This block is the whole
          top of the page on purpose — nothing competes with it. */}
      <div className="mx-auto max-w-3xl pt-4 sm:pt-8">
        <p className="eyebrow-mono">{eyebrow}</p>
        <h1 className="font-display mt-3 text-[2rem] leading-[1.1] font-medium tracking-[-0.015em] text-ink sm:text-[2.6rem]">
          What are we working on?
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          Ask across everything you&rsquo;re learning — assignments, deadlines, what a lecture
          covered. Every answer is grounded in what was actually recorded.
        </p>

        {hasCourses ? (
          <>
            <form onSubmit={onSubmit} className="mt-6">
              <div className="relative">
                <SearchIcon
                  size={20}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <label htmlFor="home-ask" className="sr-only">
                  Ask ClassMind anything
                </label>
                <input
                  id="home-ask"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask ClassMind anything…"
                  autoComplete="off"
                  className={cx(
                    "w-full rounded-2xl border border-line bg-surface-raised py-4 pl-12 pr-24",
                    "text-[16px] leading-normal text-ink shadow-soft transition-colors",
                    "placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-accent focus:outline-none",
                  )}
                />
                <Button
                  type="submit"
                  tone="primary"
                  size="md"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  Ask
                </Button>
              </div>
            </form>

            <div className="mt-3.5 flex flex-wrap gap-2">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => askGlobal(p)}
                  className={cx(
                    "rounded-full border border-line px-3.5 py-1.5 text-[13px] text-ink-soft",
                    "transition-colors hover:border-ink-faint/60 hover:text-ink",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        ) : (
          // A student with no classes has nothing recorded to ask about, so the
          // honest first step is joining one — the composer would only answer
          // "you're not in any classes yet".
          <div className="mt-6">
            <EmptyState
              icon={<KeyIcon size={18} />}
              title="Join your first class to get started."
              description="Your teacher hands out one join code per class. Once you're in, ask ClassMind anything about what was taught."
              action={
                <Button tone="primary" onClick={onJoinCourse}>
                  <KeyIcon size={16} />
                  Enter a join code
                </Button>
              }
            />
          </div>
        )}
      </div>

      {/* Continue where you left off — the only secondary content, and only
          when there is genuinely something to continue. */}
      {hasCourses && recent.length > 0 ? (
        <div className="mx-auto mt-14 max-w-3xl">
          <Section title="Recent conversations" description="Pick up a thread where you left off.">
            <Card padded={false}>
              <ul className="divide-y divide-line">
                {recent.slice(0, 4).map((thread) => (
                  <li key={thread.id}>
                    <ConversationRow thread={thread} />
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        </div>
      ) : null}
    </Page>
  );
}

// One saved conversation, linking straight back into its own surface with the
// thread pre-opened (?c=): a global thread reopens on /ask, a lecture thread on
// that lecture's page, a course thread on the course's Ask surface.
function ConversationRow({ thread }: { thread: RecentConversation }) {
  const href =
    thread.scope === "global" || thread.courseId === null
      ? `/ask?c=${thread.id}`
      : thread.scope === "lecture" && thread.lectureId
        ? `/courses/${thread.courseId}/lectures/${thread.lectureId}?c=${thread.id}`
        : `/courses/${thread.courseId}?c=${thread.id}`;
  const where = [thread.courseCode, thread.lectureTitle].filter(Boolean).join(" · ");
  return (
    <Link href={href} className="row-hover flex items-center gap-4 p-4 sm:p-5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{thread.title}</span>
        <span className="mt-1 block truncate text-[13px] text-ink-faint">
          {where ? `${where} · ` : ""}
          {agoLabel(thread.lastMessageAt)}
        </span>
      </span>
      <ChevronRightIcon size={18} className="shrink-0 text-ink-faint" />
    </Link>
  );
}
