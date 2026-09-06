"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton, cx } from "./ui";
import { PenIcon } from "./ui/icons";
import { agoLabel } from "./CoursesClient";

// THE CONVERSATION SIDEBAR — history for the global chat workspace.
//
// It is NOT navigation (that is the app drawer, a different layer). It is the
// list of a student's own conversations, newest first, grouped by when they
// were last touched, with the one action that belongs to a chat: start a new
// one. Switching is URL-driven (?c=<id>); the pane (AskWorkspace) reacts. The
// list refreshes when the pane reports a new/updated thread, so a question just
// asked appears here without a reload.
//
// Global scope only for now. Built to take a scope filter later so a course or
// lecture workspace can show the same sidebar narrowed to that context.

interface Convo {
  id: string;
  title: string;
  lastMessageAt: string;
}

type Group = { label: string; items: Convo[] };

function groupByRecency(convos: Convo[]): Group[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const t0 = startOfToday.getTime();
  const dayMs = 86_400_000;
  const buckets: Record<string, Convo[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const c of convos) {
    const t = new Date(c.lastMessageAt).getTime();
    if (Number.isNaN(t) || t >= t0) buckets.Today.push(c);
    else if (t >= t0 - dayMs) buckets.Yesterday.push(c);
    else if (t >= t0 - 7 * dayMs) buckets["Previous 7 days"].push(c);
    else buckets.Older.push(c);
  }
  return (["Today", "Yesterday", "Previous 7 days", "Older"] as const)
    .map((label) => ({ label, items: buckets[label] }))
    .filter((g) => g.items.length > 0);
}

export default function AskSidebar({
  listEndpoint = "/api/ask/conversations",
  newHref = "/ask",
  itemHref = (id: string) => `/ask?c=${id}`,
  onNavigate,
}: {
  // Scope is expressed by which list + hrefs the sidebar is given, so the SAME
  // component serves Global Ask (/api/ask/conversations, /ask) and a course's
  // Ask (/api/courses/<id>/conversations, /courses/<id>) with no branching. A
  // course sidebar shows only that course's conversations because its endpoint
  // returns only those — the scope boundary is the server's, not the URL's.
  listEndpoint?: string;
  newHref?: string;
  itemHref?: (id: string) => string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");
  const [convos, setConvos] = useState<Convo[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(listEndpoint);
        const body = (await res.json().catch(() => null)) as
          | { state?: string; conversations?: Convo[] }
          | null;
        if (cancelled) return;
        if (!res.ok || !body || body.state !== "ok") {
          setState("unavailable");
          return;
        }
        setConvos(body.conversations ?? []);
        setState("ok");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    };
    void load();
    // A question asked in the pane (a new thread, or a follow-up that bumps a
    // thread to the top) fires this so the list stays current without a reload.
    const onChanged = () => void load();
    window.addEventListener("cm:conversations-changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("cm:conversations-changed", onChanged);
    };
  }, [listEndpoint]);

  const groups = groupByRecency(convos);

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => {
          router.push(newHref);
          onNavigate?.();
        }}
        className={cx(
          "flex items-center gap-2.5 rounded-xl border border-line bg-surface-raised px-3.5 py-2.5",
          "text-[14px] font-medium text-ink transition-colors hover:border-ink-faint/60",
        )}
      >
        <PenIcon size={16} className="shrink-0 text-ink-soft" />
        New chat
      </button>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {state === "loading" ? (
          <div className="space-y-2 px-1" aria-hidden="true">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-5/6" />
            <Skeleton className="h-8 w-4/6" />
          </div>
        ) : state === "unavailable" ? (
          <p className="px-2 text-[13px] leading-relaxed text-ink-faint">
            Your conversations aren&rsquo;t loading right now. You can still ask — answers just
            won&rsquo;t be saved here until it recovers.
          </p>
        ) : convos.length === 0 ? (
          <p className="px-2 text-[13px] leading-relaxed text-ink-faint">
            No conversations yet. Ask something and it&rsquo;ll show up here to pick up later.
          </p>
        ) : (
          <nav aria-label="Your conversations" className="space-y-5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                  {group.label}
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {group.items.map((c) => {
                    const active = c.id === activeId;
                    return (
                      <li key={c.id}>
                        <Link
                          href={itemHref(c.id)}
                          onClick={() => onNavigate?.()}
                          aria-current={active ? "page" : undefined}
                          title={c.title}
                          className={cx(
                            "block rounded-lg px-2.5 py-2 text-[13px] leading-snug transition-colors",
                            active
                              ? "bg-accent-soft font-medium text-accent"
                              : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
                          )}
                        >
                          <span className="block truncate">{c.title}</span>
                          <span
                            className={cx(
                              "mt-0.5 block text-[11px]",
                              active ? "text-accent/70" : "text-ink-faint",
                            )}
                          >
                            {agoLabel(c.lastMessageAt)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
