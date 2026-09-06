"use client";

import { useEffect, useState } from "react";
import AskSidebar from "./AskSidebar";
import AskWorkspace from "./AskWorkspace";
import { cx } from "./ui";
import { ChatIcon, CloseIcon } from "./ui/icons";

// THE GLOBAL CHAT WORKSPACE — two layers, one screen.
//
//   conversation history (this sidebar)  ·  the conversation itself (the pane)
//
// It is deliberately separate from the app's global navigation (the top-left
// drawer): navigation moves between PLACES, this moves between CONVERSATIONS.
// The pane is the same AskWorkspace the course and lecture surfaces use, in its
// sidebar-driven mode, so the intelligence, grounding, citations and cost
// routing are exactly what was already built and tested — only the shell around
// them is new.
//
// On a phone the sidebar can't stay open, so it becomes an overlay reached from
// a "Conversations" control; the app nav stays the hamburger, a distinct layer.

const INTRO = {
  title: "What are we working on?",
  description:
    "Ask across everything you're learning. Every answer is built only from what your lectures actually recorded — cited to the second, so you can check it. Follow up freely; this conversation remembers the thread.",
};

const SUGGESTIONS = [
  "What do I need to work on?",
  "What assignments do I have?",
  "What topics have we covered?",
  "What am I behind on?",
];

export default function AskChat() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-10">
      {/* Desktop: the sidebar is a persistent, quietly-scrolling column. */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 h-[calc(100vh-7.5rem)]">
          <AskSidebar />
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile/tablet: open the history as an overlay. */}
        <div className="mb-5 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink"
          >
            <ChatIcon size={16} />
            Conversations
          </button>
        </div>

        <AskWorkspace global withSidebar intro={INTRO} suggestions={SUGGESTIONS} />
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-[rgba(6,9,16,0.6)] motion-fade"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Conversations"
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
              <AskSidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
