"use client";

import { useEffect, useState } from "react";
import AskSidebar from "./AskSidebar";
import AskWorkspace from "./AskWorkspace";
import type { EvidenceNav } from "./KnowledgeUnit";
import { cx } from "./ui";
import { ChatIcon, CloseIcon } from "./ui/icons";

// THE LECTURE'S CONVERSATION — the SAME chat as Global and Course Ask (one
// AskWorkspace, one AskSidebar, one composer, one message design), scoped to
// this lecture. Only the presentation adapts to where it lives: on /ask and the
// course tab the history sidebar is a permanent rail, because the page IS the
// chat; here it is a DRAWER, because the lecture page's column belongs to the
// recording, the transcript and the extracted knowledge — a rail would crowd
// out the very things a student came to the lecture to see. New chat and the
// grouped thread list live inside the drawer, identical to the other scopes.
//
// ONE DELIBERATE DIFFERENCE: opening a lecture RESUMES its most recent thread,
// where Global/Course open an empty new chat. A single lecture is a narrow,
// continuous context — "pick up where I left off with this lecture" is the
// expected move, not "start over." A fresh thread and older ones stay one tap
// away in the drawer. The server enforces the scope; this only picks endpoints.

const INTRO = {
  title: "Learn this lecture",
  description:
    "Ask for an explanation, an example, or the whole thing step by step. Every answer is grounded in what the lecturer actually said — cited down to the second, so you can hear it for yourself.",
};
const SUGGESTIONS = [
  "What was taught in this lecture?",
  "Explain the main concept simply",
  "What assignment was given?",
  "Give me an example",
];

export default function LectureConversation({
  courseId,
  lectureId,
  title,
  nav,
  bottomInset,
}: {
  courseId: string;
  lectureId: string;
  /** The lecture's title, so the drawer names the scope these threads belong to
   *  ("Asking · <lecture>") the way the course sidebar names its course. */
  title: string;
  /** Carries onSeek so an answer's citations move the on-page player. */
  nav: EvidenceNav;
  /** Lifts the composer above the engaged audio player pinned below it. */
  bottomInset: number;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // The scope is a lecture, expressed by the endpoints the shared sidebar reads:
  // this lecture's threads only (the server filters by lecture_id AND course_id
  // under the caller's own id), a new chat that stays on this lecture, and item
  // links that resume a thread here via ?c=.
  const sidebarProps = {
    listEndpoint: `/api/courses/${courseId}/conversations?lectureId=${encodeURIComponent(lectureId)}`,
    newHref: `/courses/${courseId}/lectures/${lectureId}`,
    itemHref: (id: string) => `/courses/${courseId}/lectures/${lectureId}?c=${id}`,
    scopeLabel: title,
  };

  return (
    <div>
      {/* The way to another conversation about THIS lecture: history + New chat,
          in a drawer so the lecture workspace keeps its column. Right-set and
          quiet — the conversation is the surface; this is just the way back to
          another one. */}
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChatIcon size={16} />
          Conversations
        </button>
      </div>

      <AskWorkspace
        lectureId={lectureId}
        nav={nav}
        bottomInset={bottomInset}
        withSidebar
        resumeLatest
        intro={INTRO}
        suggestions={SUGGESTIONS}
      />

      {drawerOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-[rgba(6,9,16,0.6)] motion-fade"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Conversations for this lecture"
            className="motion-drawer-in absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col border-r border-line bg-surface-raised p-4 shadow-lift"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Conversations</span>
              <button
                type="button"
                aria-label="Close conversations"
                onClick={() => setDrawerOpen(false)}
                className={cx(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft",
                  "transition-colors hover:bg-surface-sunken hover:text-ink",
                )}
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <AskSidebar {...sidebarProps} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
