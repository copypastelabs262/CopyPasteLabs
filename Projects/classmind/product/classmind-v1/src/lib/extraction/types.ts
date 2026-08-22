// The boundary between a normalized transcript and everything downstream of
// extraction.
//
// Nothing in this file knows how extraction is done. That is the point: the
// research question the capstone is graded on is "which method reads a
// code-switched lecture best", and that question is only answerable if
// pattern-matching, NER and an LLM can be run over byte-identical input and
// compared. Architecture calls this the interface that makes the research
// cheap; this file is that interface.
//
// Pure logic. No database, no network, no React, no clock. A method that
// needs any of those is doing something this layer should not be doing.

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

// One bounded span of transcript text with its position in both coordinate
// spaces that matter: time in the recording, and characters in the normalized
// transcript.
//
// Both are carried because they answer different questions and one cannot be
// derived from the other. Character offsets let a reviewer see the highlighted
// words in the transcript they are reading; the millisecond range is the
// durable anchor, because transcripts are regenerated whenever a better engine
// runs and a citation anchored only to text silently starts quoting the wrong
// words. Capture Contract obligation 7.
export interface TranscriptSegmentInput {
  text: string;
  startMs: number;
  endMs: number;
  // Offsets into the full normalized transcript text, not into `text`.
  charStart: number;
  charEnd: number;
}

export type CourseContextKind = "syllabus" | "policy" | "notes";

// Written course material that describes how this course works. Read to
// sharpen extraction -- a course whose syllabus names "Tutorial Sheet" as an
// assessment should have "tutorial sheet" recognised as a deliverable even
// though no general lexicon would list it.
export interface CourseContextDocument {
  kind: CourseContextKind;
  title: string;
  body: string;
}

export interface ExtractionInput {
  segments: readonly TranscriptSegmentInput[];
  // Always optional, and every method must work without it. Most lectures
  // reaching this pipeline will have no syllabus attached, and a method that
  // quietly degrades to nothing without one is a method that does nothing in
  // production. Context may only add signal, never gate it.
  courseContext?: readonly CourseContextDocument[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

// What a candidate claims is being asserted.
//
// These are the extractor's vocabulary, not the Ledger's. The domain model
// speaks of Commitment, Scope, Notice and Guidance; those words describe what
// exists *after* a human has attested, and nothing here has been attested.
// The mapping a reviewer's confirmation performs is:
//
//   assignment    -> Commitment (work required of students)
//   deadline      -> Commitment (a due moment: a submission date, an exam date)
//   exam_scope    -> Scope      (what an assessment will cover)
//   announcement  -> Notice     (information; requires nothing of students)
//   guidance      -> Guidance   (non-binding advice)
//
// Kept as a separate, flatter vocabulary because a candidate is a proposal
// about a sentence, and proposals are wrong often enough that borrowing the
// Ledger's nouns for them would blur the one boundary the architecture exists
// to protect.
export type CandidateKind =
  | "assignment"
  | "deadline"
  | "exam_scope"
  | "announcement"
  | "guidance";

export const CANDIDATE_KINDS: readonly CandidateKind[] = [
  "assignment",
  "deadline",
  "exam_scope",
  "announcement",
  "guidance",
];

// A proposal about one span of speech. Never shown to a student, never true on
// its own. It becomes true only when a person with authority confirms it.
export interface ExtractionCandidate {
  kind: CandidateKind;

  // Short label for a review queue row.
  title: string;
  // Fuller text, whitespace-normalized for reading. This is the readable
  // version; `evidenceText` is the verbatim one. Keeping both means a reviewer
  // gets something legible without the record losing what was actually said.
  detail: string;

  // The date/time phrase exactly as spoken -- "agle Thursday",
  // "एक दो दिन में" -- sliced out of the transcript, never reworded and never
  // resolved. Null when the sentence named no time.
  duePhrase: string | null;

  // Always null in V1, and typed as `null` rather than `Date | null` on
  // purpose: it is not possible to write a resolved date here without editing
  // this type, which is the point.
  //
  // Capture Contract obligation 4 requires that a resolved date is stored only
  // *alongside* the spoken phrase, the utterance timestamp, the timezone
  // assumed, the calendar consulted, and the rule applied. None of those exist
  // yet. Widening this field is therefore not a small change -- it means
  // adding those five facts too, or making every future date-parsing fix
  // impossible to apply retroactively.
  dueResolved: null;

  // Where the claim came from. The millisecond range is the durable anchor and
  // is the segment's own range rather than an interpolation within it: a
  // reviewer who lands a second early can still hear the sentence, whereas a
  // fabricated exact moment that is wrong looks correct and is not.
  evidenceStartMs: number;
  evidenceEndMs: number;
  evidenceCharStart: number;
  evidenceCharEnd: number;
  // Verbatim. Not trimmed, not punctuation-corrected, not cleaned. If the ASR
  // heard it wrong, the mistake is the research finding -- Capture Contract
  // obligation 2.
  evidenceText: string;

  // 0..1. Read as review priority, not as a calibrated probability -- nothing
  // here has been measured against a benchmark yet, and the Constitution
  // reserves the word "confidence" for numbers that have been. It orders the
  // review queue; it never decides what a student sees.
  confidence: number;

  // Which rule or keyword fired. Carried per-candidate so precision can later
  // be computed per cue instead of only in aggregate -- which is the only form
  // of the number that tells you what to fix.
  matchedCue: string;
}

// ---------------------------------------------------------------------------
// The replaceable method
// ---------------------------------------------------------------------------

// One way of reading a transcript. V1 ships exactly one implementation; the
// interface exists so a second can be added and compared, not because a second
// exists.
//
// `id` and `version` together identify what produced a candidate. They are not
// decoration: an accuracy number attached to a method whose version was not
// recorded cannot be reproduced, and Capture Contract obligation 3 makes that
// unrecoverable rather than merely inconvenient. Bump `version` on any change
// that could move a number.
export interface ExtractionMethod {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  extract(input: ExtractionInput): ExtractionCandidate[];
}

// Note on what is deliberately absent from ExtractionInput: the session's
// date. Architecture's sketch passes a lecture date so "next Thursday" can be
// resolved. V1 does not resolve dates, so accepting the date here would offer
// a resolution capability that must not be used, and the shortest path from
// "the field is there" to "someone resolved a date without recording the
// timezone and calendar" is one afternoon. It gets added when resolution does.
