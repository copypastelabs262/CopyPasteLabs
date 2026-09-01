"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Spinner, TextInput } from "./ui";
import { AlertIcon, TrashIcon } from "./ui/icons";

// Deleting a recording. Deliberately awkward, because it is irreversible.
//
// The confirmation asks the teacher to type the lecture's title rather than
// clicking "yes". A dialog that can be dismissed by reflex is not a
// confirmation, and the one failure this guards against -- deleting the wrong
// lecture -- is precisely the one a reflexive click produces. The friction is
// the feature; it is also the only friction, so the rest of this stays quiet.
//
// What the route actually destroys, read out of
// `src/app/api/lectures/[id]/route.ts` and the migrations rather than assumed:
//
//   * the audio object in the lecture bucket, removed first;
//   * the `lectures` row, which carries the raw transcript -- every readable
//     transcript in the app is re-derived from that column, so it goes too;
//   * `extraction_candidates`, cascading from the lecture, and
//     `candidate_reviews`, cascading from those candidates;
//   * `knowledge_items`, cascading from the lecture, along with the review
//     verdicts stored on those rows, and `knowledge_evidence`, which cascades
//     from both the lecture and the item.
//
// Nothing outside this lecture is touched: the course, the enrolments and every
// other lecture in it are untouched by any of those cascades.

// The two half-failures the DELETE route reports by name. Matched on the
// route's own wording rather than on a status code, because a 500 can also
// arrive from the generic handler and the two mean opposite things to the
// reader -- one says the recording is untouched, the other says the recording
// is already gone.
const AUDIO_FAILED = "Could not delete the audio, so nothing was deleted";
const ROW_FAILED = "The audio was deleted but the lecture record was not";

interface Failure {
  message: string;
  // Whether pressing Delete again is the right next move. It is for the
  // half-deleted case; it is also for a transient storage error.
  retry: boolean;
}

// Route wording, translated. The server sentences carry a Supabase error string
// on the end -- accurate, and meaningless to a teacher -- so the shape of the
// failure is kept and the driver's words are dropped.
function readFailure(status: number, serverMessage: string): Failure {
  if (serverMessage.startsWith(AUDIO_FAILED)) {
    return {
      message:
        "The audio file could not be removed from storage, so nothing was deleted. " +
        "The lecture is exactly as it was.",
      retry: true,
    };
  }
  if (serverMessage.startsWith(ROW_FAILED)) {
    return {
      message:
        "The audio has been deleted, but the lecture record has not. " +
        "The recording itself is already gone and cannot be recovered. " +
        "Deleting again will finish removing the lecture.",
      retry: true,
    };
  }
  if (status === 403) {
    return { message: "You are not the owner of this course, so you cannot delete this lecture.", retry: false };
  }
  return { message: serverMessage || "The lecture could not be deleted.", retry: true };
}

export default function DeleteLecture({
  lectureId,
  lectureTitle,
  courseId,
  candidateCount,
}: {
  lectureId: string;
  lectureTitle: string;
  courseId: string;
  candidateCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Survives the dialog closing, because the page it belongs to is on its way
  // out and the trigger must not offer to delete the lecture a second time.
  const [leaving, setLeaving] = useState(false);

  const matches = typed.trim() === lectureTitle.trim();

  // One door in and one door out, both of which reset everything. A typed title
  // or a stale error left behind by a cancelled attempt is exactly the state
  // that makes the next attempt confusing.
  function setDialog(next: boolean) {
    if (busy) return;
    setOpen(next);
    setTyped("");
    setFailure(null);
  }

  async function remove() {
    setBusy(true);
    setFailure(null);
    try {
      const r = await fetch(`/api/lectures/${lectureId}`, { method: "DELETE" });
      // Parsed defensively. A framework-level failure answers with an HTML
      // error page, and letting that throw would land in the catch below --
      // which promises the lecture is untouched, a promise it could not keep.
      const b = (await r.json().catch(() => ({}))) as { error?: string };

      // Already gone. Not an error to report -- the lecture the reader is
      // looking at does not exist, so the only correct thing to do is stop
      // showing it to them.
      if (r.status === 404) {
        leave();
        return;
      }
      if (!r.ok) {
        setFailure(readFailure(r.status, b.error ?? ""));
        setBusy(false);
        return;
      }
      leave();
    } catch {
      setFailure({
        message:
          "Could not reach ClassMind, so nothing was deleted. " +
          "The lecture is exactly as it was.",
        retry: true,
      });
      setBusy(false);
    }
  }

  // Close the dialog, then go. `busy` and `leaving` both stay set: the lecture
  // page is still mounted until the navigation commits, and re-enabling a
  // delete button on a lecture that no longer exists is the orphaned state this
  // is here to avoid.
  function leave() {
    setOpen(false);
    setTyped("");
    setFailure(null);
    setLeaving(true);
    // Back to the course, and refresh so the lecture list re-reads rather than
    // showing a row that no longer exists.
    router.push(`/courses/${courseId}`);
    router.refresh();
  }

  return (
    <>
      <Button
        tone="ghost"
        size="sm"
        className="text-danger hover:bg-danger-soft hover:text-danger"
        disabled={leaving}
        onClick={() => setDialog(true)}
      >
        {leaving ? <Spinner size={16} /> : <TrashIcon size={16} />}
        {leaving ? "Removing…" : "Delete this recording"}
      </Button>

      <Dialog
        open={open}
        onClose={() => setDialog(false)}
        title={<>Delete &ldquo;{lectureTitle}&rdquo;?</>}
        description="This cannot be undone, and no other lecture in the course is affected."
        footer={
          <>
            <Button tone="secondary" disabled={busy} onClick={() => setDialog(false)}>
              Cancel
            </Button>
            {/* A failure the teacher cannot fix by pressing the button again
                takes the button away rather than inviting a second identical
                refusal. */}
            <Button
              tone="danger"
              disabled={!matches || busy || failure?.retry === false}
              onClick={remove}
            >
              {busy ? <Spinner size={16} /> : null}
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
          </>
        }
      >
        {/* What goes, stated as things rather than as tables. A teacher's
            question is "do I lose the recording", not "does knowledge_evidence
            cascade". */}
        <ul className="space-y-2.5 text-sm leading-relaxed text-ink-soft">
          <li className="flex gap-3">
            <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
            <span>The audio recording, deleted from storage.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
            <span>The transcript, and every quote in ClassMind that cites this lecture.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
            <span>
              {"Everything read out of it — the topics students can already see, the assignments " +
                "and deadlines, and every review decision you made on them, confirmed or rejected" +
                (candidateCount > 0
                  ? `, along with the ${candidateCount} detection ` +
                    `${candidateCount === 1 ? "signal" : "signals"} underneath them.`
                  : ".")}
            </span>
          </li>
        </ul>

        {/* No autoFocus. Dialog moves focus to the panel in an effect, which
            runs after the commit that would have focused this field, so asking
            for it here would describe something that does not happen. Focus
            starting on the panel is also the right place for a destructive
            dialog: the first thing to happen should be reading it. */}
        <div className="mt-6">
          <TextInput
            label="Type the lecture title to confirm"
            value={typed}
            onChange={setTyped}
            placeholder={lectureTitle}
            disabled={busy}
            autoComplete="off"
          />
        </div>

        {failure ? (
          <p
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm leading-relaxed text-danger"
          >
            <AlertIcon size={16} className="mt-0.5 shrink-0" />
            <span>{failure.message}</span>
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
