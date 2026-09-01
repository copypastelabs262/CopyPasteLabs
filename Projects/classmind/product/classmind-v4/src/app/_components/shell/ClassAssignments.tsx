"use client";

import { useState } from "react";
import { useClassData } from "./ClassContext";
import { actionableUnits, useCourseKnowledge } from "../KnowledgePanel";
import { AssignmentCard, type KnowledgeUnit } from "../KnowledgeUnit";
import { Button, Card, EmptyState, Page, Section, Skeleton } from "@/app/_components/ui";
import { CheckIcon, ClipboardIcon } from "@/app/_components/ui/icons";

// ASSIGNMENTS — work with a consequence, as a destination.
//
// The owner sees two bands: the queue (found in lectures, awaiting their
// confirmation — the "posting" moment of this product: nobody typed the
// assignment, the lecture did) and what the class already has. A student sees
// only what has been confirmed, plus an honest count of what is still waiting
// — never its content, which is the product's central safety rule.
//
// The queue's verdict actions reuse the exact review contract the lecture page
// uses (`POST /api/knowledge/:id/review`); wording edits stay on the lecture
// page beside the evidence, and the card links there.
//
// No due dates are rendered anywhere, because the data model does not carry
// them — an assignment's date lives in `unspecified` when the lecturer never
// said one. Inventing a dates column would be decoration lying about data.

export default function ClassAssignments() {
  const { courseId, isOwner, lectures, loading } = useClassData();
  const readyIds = lectures.filter((l) => l.status === "ready").map((l) => l.id).join(",");
  const knowledge = useCourseKnowledge(courseId, readyIds);

  if (loading || knowledge.loading) {
    return (
      <Page>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </Page>
    );
  }

  const all = actionableUnits(knowledge.units);
  const pending = all.filter((u) => u.status === "pending");
  const confirmed = all.filter((u) => u.status === "auto" || u.status === "confirmed");

  if (isOwner) {
    return (
      <Page>
        {pending.length ? (
          <Section
            title="Waiting for your confirmation"
            description="Found in your lectures. Students cannot see an item until you confirm it — confirming is what posts it to the class."
          >
            <div className="space-y-4">
              {pending.map((u) => (
                <PendingCard key={u.id} unit={u} courseId={courseId} onDone={() => knowledge.units.splice(0)} />
              ))}
            </div>
          </Section>
        ) : null}

        <Section title={pending.length ? "Posted to the class" : "Assignments"}>
          {confirmed.length ? (
            <div className="space-y-4">
              {confirmed.map((u) => (
                <AssignmentCard key={u.id} unit={u} nav={{ courseId }} showLecture />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ClipboardIcon size={20} />}
              title="Nothing has been set in this class yet."
              description="When a lecture sets work, it is reconstructed from the recording and lands here for your confirmation — you never have to type it in."
            />
          )}
        </Section>
      </Page>
    );
  }

  return (
    <Page>
      <Section
        title="What you have to do"
        description="Everything set across this class, with the moment it was said."
      >
        {confirmed.length ? (
          <div className="space-y-4">
            {confirmed.map((u) => (
              <AssignmentCard key={u.id} unit={u} nav={{ courseId }} showLecture />
            ))}
          </div>
        ) : knowledge.awaitingReview ? (
          <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
            Nothing to do right now.{" "}
            {knowledge.awaitingReview === 1
              ? "1 item is waiting for your lecturer to confirm"
              : `${knowledge.awaitingReview} items are waiting for your lecturer to confirm`}
            , and will appear here once they have.
          </p>
        ) : (
          <EmptyState
            icon={<ClipboardIcon size={20} />}
            title="Nothing has been set from these lectures yet."
            description="Anything your lecturer gives out will appear here, with the moment it was said."
          />
        )}
      </Section>
    </Page>
  );
}

// A queue card: the assignment exactly as students would see it, plus the two
// verdicts. Optimistic exit on success; the error stays on the card that
// caused it. Editing the wording lives on the lecture page beside the
// transcript — the card says so rather than half-duplicating that form here.
function PendingCard({
  unit, courseId, onDone,
}: { unit: KnowledgeUnit; courseId: string; onDone: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "gone">("idle");
  const [error, setError] = useState<string | null>(null);

  async function act(action: "confirm" | "reject") {
    setState("busy");
    setError(null);
    try {
      const r = await fetch(`/api/knowledge/${unit.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? "The verdict could not be saved.");
      setState("gone");
      onDone();
    } catch (e) {
      setState("idle");
      setError(
        e instanceof TypeError
          ? "Could not reach ClassMind. Check your connection and try again."
          : e instanceof Error ? e.message : String(e),
      );
    }
  }

  if (state === "gone") return null;

  return (
    <Card className="shadow-soft">
      <AssignmentCard unit={unit} nav={{ courseId }} showLecture />
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button tone="primary" size="sm" disabled={state === "busy"} onClick={() => void act("confirm")}>
          <CheckIcon size={14} />
          {state === "busy" ? "Saving…" : "Confirm & post"}
        </Button>
        <Button tone="ghost" size="sm" disabled={state === "busy"} onClick={() => void act("reject")}>
          Reject
        </Button>
        <a
          href={`/courses/${courseId}/lectures/${unit.lectureId}`}
          className="text-[13px] text-ink-soft transition-colors hover:text-ink"
        >
          Edit the wording on the lecture page &rarr;
        </a>
        {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
      </div>
    </Card>
  );
}
