"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Section, Spinner, StatusPill, TextArea, TextInput, cx } from "./ui";
import { AlertIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon } from "./ui/icons";
import { EvidenceSpans, KindBadge, UnitBody, type KnowledgeUnit } from "./KnowledgeUnit";

// The only review surface left.
//
// Sentence-level review is gone. A lecturer used to be handed ~32 cards -- every
// topic, every definition, every aside -- and asked to rule on each one; the
// predictable result was that nobody read past the first screen, so the items
// that actually mattered got the least attention. Now teaching enters the base
// automatically and only work with a consequence reaches this queue: an
// assignment, a deadline, an exam instruction, an announcement.
//
// One card per reconstructed item, not per sentence. The four fragments that
// together describe one assignment are one decision here, with the fragments
// shown underneath as evidence.
//
// The section renders NOTHING when the queue is empty. An empty queue is the
// normal state after every lecture that set no work, and a panel announcing
// that nothing is waiting is a panel a teacher has to read and dismiss every
// single time to learn that there was nothing to do. Absence says it faster.

type Ruling = "confirmed" | "rejected";

// A verdict applied here and now, before the parent's refetch lands.
//
// The card has to LEAVE the queue the moment the write succeeds. Waiting for
// the refetch is what made the old queue look broken: the counter dropped to
// zero while the card sat exactly where it was, and "it worked" was
// indistinguishable from "it did nothing".
//
// This is a latency cover, not a second source of truth -- see the reconcile
// effect below, which tears an entry down the instant the server reports the
// same thing.
interface Verdict {
  status: KnowledgeUnit["status"];
  title?: string;
  summary?: string;
  steps?: string[];
}

interface ReviewBody {
  action: "confirm" | "reject" | "edit";
  title?: string;
  summary?: string;
  steps?: string[];
}

interface Draft {
  title: string;
  summary: string;
  steps: string;
}

const EMPTY_DRAFT: Draft = { title: "", summary: "", steps: "" };

// Long enough that the card is seen resolving, short enough that a teacher
// ruling on three items in a row never waits for the interface. Matched to the
// CSS duration below by hand; both are 200ms and both are here.
const EXIT_MS = 200;

// Failure, in words a teacher can act on.
//
// A fetch that never reached the server throws a TypeError whose message is
// "Failed to fetch", which tells the reader nothing and reads like a bug in
// their own work. Everything else here is already a sentence written by the
// review route.
function humanError(err: unknown): string {
  if (err instanceof TypeError) {
    return "Could not reach ClassMind. Check your connection and try again.";
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.trim() || "The verdict could not be saved.";
}

export default function ActionableReview({
  units,
  onSeek,
  onReviewed,
}: {
  units: KnowledgeUnit[];
  onSeek: (ms: number) => void;
  onReviewed: () => void;
}) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  // Cards mid-exit, and which way they went. Separate from `verdicts` because a
  // card is still IN the queue while it animates out -- it has to be, or there
  // would be nothing on screen to animate.
  const [leaving, setLeaving] = useState<Record<string, Ruling>>({});
  // Keyed by id rather than held as a single "which one is busy". Two verdicts
  // can genuinely be in flight at once -- a teacher clicking down a short queue
  // is faster than a round trip -- and a single slot would report the second
  // one as busy while quietly re-enabling the first mid-request.
  const [busy, setBusy] = useState<Record<string, true>>({});
  // Per card, not per section. A failure on one item must not put an error
  // banner above two others that are fine.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showReviewed, setShowReviewed] = useState(false);

  // Exit timers, cancelled on unmount. Navigating away mid-animation would
  // otherwise fire `onReviewed` into a parent that is no longer listening.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Hand authority back to the server the moment it has it.
  //
  // This is what stops the overlay from becoming stale state. Once a refetched
  // unit is no longer `pending`, the row already says everything the overlay
  // was covering for, so the overlay entry is dropped -- an edited title is
  // then read from the row rather than from a memory of what was typed. An id
  // that has disappeared entirely (a re-extraction replaced the item) is
  // dropped for the same reason: there is nothing left for it to overlay.
  //
  // Because `merged` maps over `units` rather than concatenating anything, a
  // resurrected or duplicated card is not merely unlikely here, it is not
  // representable: one server row renders exactly once, in exactly one list.
  useEffect(() => {
    setVerdicts((current) => {
      const ids = Object.keys(current);
      if (ids.length === 0) return current;
      const next: Record<string, Verdict> = {};
      for (const id of ids) {
        const server = units.find((u) => u.id === id);
        if (server && server.status === "pending") next[id] = current[id];
      }
      // Same object when nothing was dropped, so this cannot loop.
      return Object.keys(next).length === ids.length ? current : next;
    });
  }, [units]);

  const merged = units.map((u) => (verdicts[u.id] ? { ...u, ...verdicts[u.id] } : u));
  const pending = merged.filter((u) => u.status === "pending");
  // Only actionable items are ever gated, so filtering on the verdict rather
  // than on the category is enough -- and stays right if the gate widens.
  const reviewed = merged.filter((u) => u.status === "confirmed" || u.status === "rejected");

  // One shape for "drop this id from that map", used for busy, errors and the
  // exit register alike.
  function without<T>(map: Record<string, T>, id: string): Record<string, T> {
    if (!(id in map)) return map;
    const next = { ...map };
    delete next[id];
    return next;
  }

  function clearError(id: string) {
    setErrors((e) => without(e, id));
  }

  async function act(id: string, body: ReviewBody) {
    setBusy((b) => ({ ...b, [id]: true }));
    clearError(id);
    try {
      const r = await fetch(`/api/knowledge/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = (await r.json()) as { item?: { status?: string }; error?: string };
      if (!r.ok) throw new Error(b.error ?? "The verdict could not be saved.");

      const ruling: Ruling = body.action === "reject" ? "rejected" : "confirmed";
      const verdict: Verdict = {
        status: (b.item?.status as KnowledgeUnit["status"] | undefined) ?? ruling,
        // Spread conditionally: writing `title: undefined` for a plain confirm
        // would erase the item's own title when the overlay is merged.
        ...(body.action === "edit"
          ? { title: body.title, summary: body.summary, steps: body.steps }
          : {}),
      };

      setBusy((b) => without(b, id));
      // The editor closes and the draft is dropped on the verdict, not on the
      // unmount. If the same card ever came back -- a retry, a re-extraction --
      // a half-typed edit reopening under it would be the teacher's words
      // attached to something they never agreed to.
      if (editing === id) {
        setEditing(null);
        setDraft(EMPTY_DRAFT);
      }

      // Resolve, then leave. The card states its verdict for a beat and fades,
      // so the interaction reads as finished rather than as a card that went
      // missing while the teacher was looking at it.
      setLeaving((l) => ({ ...l, [id]: ruling }));
      const timer = setTimeout(() => {
        setLeaving((l) => without(l, id));
        setVerdicts((v) => ({ ...v, [id]: verdict }));
        // The lecture page still refetches: everything above is a latency fix.
        onReviewed();
      }, EXIT_MS);
      timers.current.push(timer);
    } catch (err) {
      // Nothing local changed, so the card is still exactly where it was and
      // every action on it still works. That is the whole recovery story.
      setBusy((b) => without(b, id));
      setErrors((e) => ({ ...e, [id]: humanError(err) }));
    }
  }

  function reviewCard(u: KnowledgeUnit) {
    const isEditing = editing === u.id;
    const inFlight = busy[u.id] === true;
    const ruling = leaving[u.id];
    const settling = ruling !== undefined;
    const error = errors[u.id];

    return (
      <li
        key={u.id}
        className={cx(
          "transition-[opacity,transform] duration-200 ease-out",
          settling ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100",
        )}
        // Nothing in a card on its way out is worth tabbing into. `inert`
        // rather than `aria-hidden`: the card still holds focusable timecodes,
        // and hiding a focusable subtree from the accessibility tree without
        // also removing it from the tab order strands a keyboard user on a
        // control a screen reader can no longer describe.
        inert={settling}
      >
        <Card>
          <KindBadge kind={u.kind} />
          <h3 className="mt-3 text-lg leading-snug font-semibold tracking-[-0.012em] text-balance text-ink sm:text-xl">
            {u.title}
          </h3>

          <UnitBody unit={u} />
          <EvidenceSpans evidence={u.evidence} onSeek={onSeek} />

          {/* Confidence is engineering output. It reads as a grade on the
              teacher's own lecture, and there is no action they can take on
              0.82 -- so it is available, and it is not in the way. */}
          {u.confidence != null ? (
            <details className="mt-5">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-ink-faint transition-colors select-none hover:text-ink-soft [&::-webkit-details-marker]:hidden">
                <ChevronRightIcon size={13} />
                Technical details
              </summary>
              <p className="mt-2 pl-[1.15rem] font-mono text-xs text-ink-faint">
                confidence {u.confidence.toFixed(2)} · {u.kind}
              </p>
            </details>
          ) : null}

          {settling ? (
            <p
              className={cx(
                "mt-6 flex items-center gap-2 text-sm font-medium",
                ruling === "rejected" ? "text-ink-soft" : "text-ok",
              )}
            >
              {ruling === "rejected" ? <CloseIcon size={16} /> : <CheckIcon size={16} />}
              {ruling === "rejected"
                ? "Rejected. Students never see this."
                : "Confirmed. Students can see this now."}
            </p>
          ) : isEditing ? (
            <EditForm
              draft={draft}
              setDraft={setDraft}
              busy={inFlight}
              error={error}
              onCancel={() => {
                setEditing(null);
                setDraft(EMPTY_DRAFT);
                clearError(u.id);
              }}
              onSave={() =>
                act(u.id, {
                  action: "edit",
                  title: draft.title,
                  summary: draft.summary,
                  // One step per line. A structured multi-input editor would be
                  // more precise and far more friction for a three-step task.
                  steps: draft.steps
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          ) : (
            <>
              {error ? <ReviewError message={error} /> : null}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  tone="primary"
                  disabled={inFlight}
                  onClick={() => act(u.id, { action: "confirm" })}
                >
                  {inFlight ? <Spinner size={16} /> : <CheckIcon size={16} />}
                  Confirm
                </Button>
                <Button
                  tone="secondary"
                  disabled={inFlight}
                  onClick={() => {
                    clearError(u.id);
                    setEditing(u.id);
                    setDraft({ title: u.title, summary: u.summary, steps: u.steps.join("\n") });
                  }}
                >
                  Edit wording
                </Button>
                <Button
                  tone="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger sm:ml-auto"
                  disabled={inFlight}
                  onClick={() => act(u.id, { action: "reject" })}
                >
                  Reject
                </Button>
              </div>
            </>
          )}
        </Card>
      </li>
    );
  }

  // The one hard rule of this surface: nothing waiting, nothing rendered.
  // Deliberately placed after every hook, so the hook order is identical on the
  // render where the queue empties and the render where it was already empty.
  if (pending.length === 0) return null;

  return (
    <Section
      title="Needs your attention"
      description="Assignments, deadlines and announcements stay invisible to students until you confirm them — everything else this lecture taught was published automatically."
      action={
        <StatusPill tone="warn">
          {pending.length} waiting
        </StatusPill>
      }
    >
      <ul className="space-y-4">{pending.map(reviewCard)}</ul>

      {/* History, and only that. It is folded away because it answers a
          question nobody has asked yet, and it lives inside this section
          because the section is the only place it belongs -- once the queue
          empties there is no review surface at all, by design. */}
      {reviewed.length > 0 ? (
        <div className="mt-8 border-t border-line pt-5">
          <button
            type="button"
            onClick={() => setShowReviewed((s) => !s)}
            aria-expanded={showReviewed}
            className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
          >
            {showReviewed ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
            Recently reviewed ({reviewed.length})
          </button>
          {showReviewed ? (
            <ul className="motion-fade mt-4 space-y-3">
              {reviewed.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <KindBadge kind={u.kind} />
                  <span className="min-w-0 flex-1 text-sm leading-snug text-ink">{u.title}</span>
                  <StatusPill tone={u.status === "rejected" ? "neutral" : "ok"}>
                    {u.status === "rejected" ? "Rejected" : "Confirmed"}
                  </StatusPill>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

// Said once, the same way, wherever a verdict fails. The second sentence is the
// load-bearing one: a failed write leaves the item exactly as it was, and the
// reader needs to know that before they decide whether to press it again.
function ReviewError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-5 flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm leading-relaxed text-danger"
    >
      <AlertIcon size={16} className="mt-0.5 shrink-0" />
      <span>{message} Nothing was changed — you can try again.</span>
    </p>
  );
}

// An edit is a confirmation in the lecturer's own words: the same route, the
// same single verdict, just different text. It never becomes a second concept,
// and it never touches the evidence -- the quotes are what was said, and
// rewriting those would make the citation a lie.
function EditForm({
  draft,
  setDraft,
  busy,
  error,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  const valid = draft.title.trim().length > 0 && draft.summary.trim().length > 0;

  return (
    <div className="mt-6 border-t border-line pt-6">
      <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
        Say it the way you would say it to the class. Saving your wording confirms this item —
        it does not create a second one, and the quotes above stay exactly as they were spoken.
      </p>

      <div className="mt-5 space-y-5">
        <TextInput
          label="Title"
          value={draft.title}
          onChange={(title) => setDraft({ ...draft, title })}
          placeholder="What students have to do, in a few words"
          disabled={busy}
          required
          autoFocus
        />
        <TextArea
          label="Description"
          value={draft.summary}
          onChange={(summary) => setDraft({ ...draft, summary })}
          placeholder="The task, the deadline, anything they need to know"
          rows={3}
          disabled={busy}
          required
        />
        <TextArea
          label="Steps"
          value={draft.steps}
          onChange={(steps) => setDraft({ ...draft, steps })}
          hint="One per line. Leave this empty if there are no separate steps."
          rows={4}
          disabled={busy}
        />
      </div>

      {error ? <ReviewError message={error} /> : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button tone="primary" disabled={busy || !valid} onClick={onSave}>
          {busy ? <Spinner size={16} /> : <CheckIcon size={16} />}
          Save and confirm
        </Button>
        <Button tone="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        {!valid ? (
          <span className="text-sm text-ink-faint sm:ml-2">
            A title and a description are both needed.
          </span>
        ) : null}
      </div>
    </div>
  );
}
