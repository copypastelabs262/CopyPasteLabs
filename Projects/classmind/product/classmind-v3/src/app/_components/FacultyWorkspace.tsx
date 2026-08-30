"use client";

import { useId, useState } from "react";
import Link from "next/link";
import LectureUpload from "./LectureUpload";
import LectureProgress from "./LectureProgress";
import { CourseKnowledgePanel, useCourseKnowledge } from "./KnowledgePanel";
import { formatBytes, formatWhen } from "./Input";
import {
  Button,
  ButtonLink,
  Card,
  Dialog,
  EmptyState,
  Section,
  SelectInput,
  StatusPill,
  TechnicalDisclosure,
  TextArea,
  TextInput,
  cx,
  friendlyLectureError,
  lectureStatusLabel,
  lectureStatusNote,
  lectureStatusTone,
} from "@/app/_components/ui";
import { AudioIcon, PlusIcon } from "@/app/_components/ui/icons";
import type { CourseContextDoc, CourseLecture } from "./CourseClient";

const CONTEXT_KINDS = ["syllabus", "policy", "schedule", "note"] as const;

// Capitalised for reading, lowercase on the wire: the route validates against
// the lowercase set, so the label is presentation and the value is the
// contract.
const KIND_OPTIONS = CONTEXT_KINDS.map((k) => ({
  value: k,
  label: `${k[0].toUpperCase()}${k.slice(1)}`,
}));

// WHAT A LECTURE ACTUALLY YIELDED.
//
// A status can only say that a recording finished. It cannot say whether it
// produced twelve topics or nothing at all, and "Published" on a row that
// yielded nothing is the most misleading thing this list could print. The
// course payload has no room for it -- knowledge lives in a different table --
// so the finished rows are decorated from the course's knowledge after the list
// has already rendered.
interface Captured { taught: number; actionable: number; pending: number }

// A calendar date, not a timestamp. `formatWhen` prints the clock as well,
// which is nine characters of noise on a row whose question is "which week was
// this". A bare `YYYY-MM-DD` is parsed as UTC midnight by the Date constructor
// and would render as the previous day west of Greenwich, so a date carrying no
// time is read as a local one.
function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function capturedLine(c: Captured): string {
  if (!c.taught && !c.actionable) return "Nothing was read out of this recording.";
  const parts: string[] = [];
  if (c.taught) parts.push(`${c.taught} ${c.taught === 1 ? "topic" : "topics"} captured`);
  if (c.pending) {
    parts.push(`${c.pending} waiting for you`);
  } else if (c.actionable) {
    parts.push(`${c.actionable} actionable ${c.actionable === 1 ? "item" : "items"}, all reviewed`);
  }
  return parts.join(" · ");
}

// The course as the person who teaches it works on it.
//
// The order is the answer to "what am I here to do": put a recording in, watch
// what it became, and only then the material that shapes future extractions.
// The old layout sat the upload and the context form side by side, which said
// they were equally the point. They are not -- one of them is the reason this
// screen exists.
//
// No outer wrapper: a fragment, so every section is a direct child of the
// `Page` above and inherits its rhythm. A `space-y` here would be a second
// opinion about the same gap.
export default function FacultyWorkspace({
  courseId, lectures, context, onChanged,
}: {
  courseId: string; lectures: CourseLecture[]; context: CourseContextDoc[]; onChanged: () => void;
}) {
  const [kind, setKind] = useState<string>("syllabus");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const formId = useId();

  // ONE request for the whole course, not one per finished lecture.
  //
  // This list used to open a request per ready lecture to decorate its rows,
  // and each of those cost about nine database round trips -- a twenty-lecture
  // course spent roughly a hundred and eighty queries drawing a page that needs
  // a few counts. The grouping it was really after is a loop over one payload.
  //
  // Keyed on the published ids, never on `lectures` itself. That array is
  // rebuilt by every course refetch, and LectureProgress refetches the course
  // every five seconds for as long as one lecture is transcribing -- so keying
  // on its identity would reopen this request on each of those ticks, for the
  // whole length of a transcription. What the knowledge actually depends on is
  // which lectures are published, so that is what it watches.
  const readyIds = lectures.filter((l) => l.status === "ready").map((l) => l.id).join(",");
  const knowledge = useCourseKnowledge(courseId, readyIds);

  // Seeded with zeros for every published lecture, so a recording that yielded
  // nothing says so rather than silently falling back to its status note. Only
  // once the knowledge has actually landed: before that, "nothing was read out
  // of this" would be a claim about a request still in flight.
  const captured = new Map<string, Captured>();
  if (!knowledge.loading && !knowledge.error) {
    for (const l of lectures) {
      if (l.status === "ready") captured.set(l.id, { taught: 0, actionable: 0, pending: 0 });
    }
    for (const u of knowledge.units) {
      const row = captured.get(u.lectureId);
      if (!row) continue;
      if (u.category === "teaching") row.taught += 1;
      if (u.category === "actionable") row.actionable += 1;
      if (u.status === "pending") row.pending += 1;
    }
  }

  return (
    <>
      {/* Unwrapped on purpose. LectureUpload draws its own surface and its own
          heading, so a Card or a Section title here would double both -- and it
          is owned elsewhere, which means chrome added around it goes stale the
          moment that component is restyled. */}
      <LectureUpload courseId={courseId} onComplete={onChanged} />

      {/* The queue, said once for the whole course. The per-row pills below say
          which lecture each one came from; this is the number a lecturer wants
          before they decide whether to open anything at all. */}
      <Section
        title="Lectures"
        description={
          knowledge.awaitingReview
            ? `${knowledge.awaitingReview} ${knowledge.awaitingReview === 1 ? "item is" : "items are"} waiting for your review. Students cannot see them until you confirm them.`
            : undefined
        }
      >
        {lectures.length === 0 ? (
          <EmptyState
            icon={<AudioIcon size={20} />}
            title="No lectures in this course yet."
            description="Upload a recording above and it will appear here while it is transcribed."
          />
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {lectures.map((l) => {
                const tone = lectureStatusTone(l.status);
                const note = lectureStatusNote(l.status, l.error_message);
                // What the recording yielded, once that is known. Until then --
                // and for every lecture that has not finished -- the status note
                // is the honest answer.
                const summary = l.status === "ready" ? captured.get(l.id) : undefined;
                const line = summary ? capturedLine(summary) : note;
                return (
                  <li key={l.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5 sm:flex-nowrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Link
                          href={`/courses/${courseId}/lectures/${l.id}`}
                          className="text-[15px] font-medium tracking-[-0.008em] text-ink transition-colors hover:text-accent"
                        >
                          {l.title}
                        </Link>
                        <StatusPill tone={tone}>{lectureStatusLabel(l.status)}</StatusPill>
                        {/* The only thing on this screen that is genuinely
                            addressed to the lecturer. It appears on a finished
                            lecture, which is exactly the row a status pill has
                            already declared to be fine. */}
                        {summary?.pending ? (
                          <StatusPill tone="warn">{summary.pending} waiting for you</StatusPill>
                        ) : null}
                      </div>

                      <p className="mt-1 text-xs text-ink-faint">
                        {formatDay(l.recorded_on ?? l.created_at) ?? formatWhen(l.created_at)} ·{" "}
                        {formatBytes(l.file_size_bytes)}
                      </p>

                      {line ? (
                        <p
                          className={cx(
                            "mt-2 max-w-[62ch] text-sm leading-relaxed",
                            tone === "danger" ? "text-danger" : "text-ink-soft",
                          )}
                        >
                          {line}
                        </p>
                      ) : null}

                      {/* The sentence above is the human reading of the row's
                          error. What remains splits by voice: a stored message
                          that is itself a human sentence (the reason a
                          transcribed lecture was not published, say) prints as
                          text when the sentence above did not already say it;
                          a raw provider payload never prints as body copy --
                          it collapses into the technical disclosure, mono,
                          one click away, with the request id extracted. */}
                      {(() => {
                        if (!l.error_message) return null;
                        const err = friendlyLectureError(l.error_message);
                        return (
                          <>
                            {err.raw === null && err.message !== note ? (
                              <p
                                className={cx(
                                  "mt-1.5 text-sm leading-relaxed",
                                  tone === "danger" ? "text-danger" : "text-ink-soft",
                                )}
                              >
                                {err.message}
                              </p>
                            ) : null}
                            <TechnicalDisclosure error={err} />
                          </>
                        );
                      })()}

                      {/* Renders nothing for a lecture that is already done, so the
                          list keeps polling only for the one that is still moving. */}
                      <LectureProgress lectureId={l.id} status={l.status} onAdvanced={onChanged} />
                    </div>

                    <ButtonLink
                      href={`/courses/${courseId}/lectures/${l.id}`}
                      size="sm"
                      tone="secondary"
                      aria-label={`Open ${l.title}`}
                      className="shrink-0"
                    >
                      Open
                    </ButtonLink>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </Section>

      <Section
        title="Course context"
        description="Syllabus, policies and schedules. Context informs extraction only — it never touches transcription, so it cannot alter what the recording says."
        action={
          <Button size="sm" tone="secondary" onClick={() => setOpen(true)}>
            <PlusIcon size={15} />
            Add context
          </Button>
        }
      >
        {context.length ? (
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {context.map((c) => (
                <li key={c.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-[11px] font-medium tracking-[0.06em] text-ink-faint uppercase">
                      {c.kind}
                    </span>
                    <span className="text-[15px] font-medium text-ink">{c.title}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 max-w-[68ch] text-sm leading-relaxed text-ink-soft">
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          // A quiet line rather than an empty state: this section is secondary,
          // and a second dashed box would compete with the one the lecture list
          // shows on a course that genuinely has nothing in it.
          <p className="text-sm text-ink-soft">
            No context added yet. Extraction works without it.
          </p>
        )}
      </Section>

      {/* Behind a dialog because it is a form for something a lecturer fills in
          once a term, and it spent the rest of the term occupying half the
          screen beside the thing they came here to do. */}
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Add course context"
        description="Context informs extraction only — it never touches transcription, so it cannot alter what the recording says."
        footer={
          <>
            <Button
              tone="ghost"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form={formId} tone="primary" disabled={saving}>
              {saving ? "Adding…" : "Add context"}
            </Button>
          </>
        }
      >
        {/* The submit button sits in the footer, which is outside this form
            subtree -- `form={formId}` is what keeps them one control rather
            than two. */}
        <form
          id={formId}
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSaving(true);
            try {
              const r = await fetch(`/api/courses/${courseId}/context`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, title, body }),
              });
              const b = await r.json();
              if (!r.ok) throw new Error(b.error ?? "Could not save.");
              // Kind survives on purpose: adding three policies in a row is the
              // normal case, and re-picking the same option each time is not.
              setTitle(""); setBody(""); setOpen(false); onChanged();
            } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
            finally { setSaving(false); }
          }}
        >
          <SelectInput label="Kind" value={kind} onChange={setKind} options={KIND_OPTIONS} />
          <TextInput label="Title" value={title} onChange={setTitle} placeholder="Assessment policy" required />
          <TextArea
            label="Body" value={body} onChange={setBody} rows={5} required
            placeholder="Assignments are submitted on the LMS. Late work loses 10% per day."
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </form>
      </Dialog>

      {/* "Confirmed course knowledge" was the old heading and it was false
          twice over: the panel read a store nothing writes verdicts into any
          more, so it was permanently empty, and what belongs here is everything
          the course knows -- taught material enters automatically, only
          actionable items wait on a verdict. */}
      <CourseKnowledgePanel
        courseId={courseId}
        heading="What this course covers"
        knowledge={knowledge}
        showAsk
      />
    </>
  );
}
