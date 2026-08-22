// Deterministic fixture for the `rules` extraction method.
//
// Nearly every string below is real. The Devanagari lines are transcribed
// speech from a 40-minute Hindi/Hinglish Class-12 physics lecture that was put
// through the pipeline and read by hand; the romanized lines are the same
// constructions as they arrive now that the product transcribes in Latin
// script (Sarvam `mode: "translit"`). Both scripts are kept because the only
// transcript that has actually been inspected is in Devanagari and the only
// transcripts that will exist from here are romanized.
//
// The negative cases matter as much as the positive ones and are not padding.
// "करना है" occurred 4 times in that lecture and at least half were physics
// instruction. A fixture that only proves the true positives are found would
// pass just as happily for a matcher with 50% precision, which is a matcher
// nobody would use twice.

import type {
  CourseContextDocument,
  ExtractionInput,
  TranscriptSegmentInput,
} from "../types.ts";

// What the test asserts about one candidate. Fields left undefined are not
// checked -- an over-specified fixture breaks on every harmless tweak and
// stops being run.
export interface ExpectedCandidate {
  readonly kind: string;
  readonly matchedCue: string;
  // `null` asserts no phrase was found; omitted means "not checked".
  readonly duePhrase?: string | null;
  readonly evidenceIncludes?: string;
  readonly evidenceExcludes?: string;
  readonly minConfidence?: number;
}

export interface SegmentCase {
  // Why this case is in the fixture. Printed by the runner so a failure names
  // the phenomenon rather than a segment index.
  readonly note: string;
  readonly text: string;
  readonly expect: readonly ExpectedCandidate[];
}

const SEGMENT_MS = 12_000;

// ---------------------------------------------------------------------------
// The lecture
// ---------------------------------------------------------------------------

export const SEGMENT_CASES: readonly SegmentCase[] = [
  {
    note:
      "THE false positive. 'करना है' is the strongest obligation marker Hindi " +
      "has, and here it is a step in a worked example: charge this body.",
    text:
      "चलिए तो आज हम इलेक्ट्रिक चार्जेस एंड फील्ड्स शुरू करते हैं। " +
      "इसे हमें पॉजिटिव चार्ज करना है।",
    expect: [],
  },
  {
    note:
      "Same trap, two more ways. Both are blocked at the gate: an obligation " +
      "cue alone never fires a rule.",
    text:
      "अब हमें इस चार्ज को यहाँ से वहाँ मूव करना है। " +
      "iska integration humein karna hai taaki electric potential nikal sake.",
    expect: [],
  },
  {
    note:
      "Romanized twin of the real quote, plus a sentence that PASSES the gate " +
      "(it contains 'exam') and is killed by the addressee veto: 'humein' " +
      "with no 'aapko' is the teaching we, not a student obligation.",
    text:
      "toh ab humein is body ko positive charge karna hai. " +
      "ye numerical humein exam ke point of view se solve karna hai.",
    expect: [],
  },
  {
    note:
      "Passes the gate on 'exam' and is killed by the domain-density veto: " +
      "charge + field + derive means the sentence is about the subject.",
    text: "exam me is charge ka electric field derive karna hai.",
    expect: [],
  },
  {
    note:
      "One ASR chunk, song lyrics running straight into a real announcement. " +
      "Per-sentence scoring is what keeps the noise from diluting the match " +
      "and from widening the evidence span onto the lyrics.",
    text:
      "तेरे बिना ज़िंदगी से कोई शिकवा तो नहीं, शिकवा नहीं, शिकवा नहीं। " +
      "हाँ तो बच्चों, इस चैप्टर का नोट्स आपको नीचे डिस्क्रिप्शन में मिलेगा।",
    expect: [
      {
        kind: "announcement",
        matchedCue: "announcement.material_available",
        duePhrase: null,
        evidenceIncludes: "डिस्क्रिप्शन में मिलेगा",
        evidenceExcludes: "शिकवा",
        minConfidence: 0.6,
      },
    ],
  },
  {
    note:
      "Real announcement. The obligation runs from the lecturer TO students, " +
      "so it is an announcement, not an assignment. Also the duePhrase case " +
      "that must survive verbatim rather than becoming a date.",
    text: "एक दो दिन में आपको मैं स्केड्यूल भी रिलीज कर देंगे।",
    expect: [
      {
        kind: "announcement",
        matchedCue: "announcement.schedule_release",
        duePhrase: "एक दो दिन में",
        minConfidence: 0.8,
      },
    ],
  },
  {
    note: "Real announcement: past commitments, delivered as PDFs.",
    text:
      "जितनी भी कमिटमेंट्स मैंने की है वो सारे लेक्चर्स पीडीएफ फॉर्मेट में मिल जाएंगे।",
    expect: [
      {
        kind: "announcement",
        matchedCue: "announcement.material_available",
        duePhrase: null,
        minConfidence: 0.6,
      },
    ],
  },
  {
    note:
      "The obligations that are real: named deliverable, dative addressee, " +
      "time expression. Same 'karna hai' cue as the false positives above -- " +
      "the difference is entirely in the second signal.",
    text:
      "aapko ye assignment agle Thursday tak submit karna hai. " +
      "DPP aapko kal tak complete karna hai.",
    expect: [
      {
        kind: "assignment",
        matchedCue: "assignment.work_obligation",
        duePhrase: "agle Thursday",
        evidenceIncludes: "assignment",
        minConfidence: 0.8,
      },
      {
        kind: "assignment",
        matchedCue: "assignment.work_obligation",
        duePhrase: "kal tak",
        evidenceIncludes: "DPP",
        minConfidence: 0.75,
      },
    ],
  },
  {
    note:
      "An assessment date and its scope, in adjacent sentences. Deliberately " +
      "two sentences: one candidate is emitted per span, so a single sentence " +
      "carrying both would yield only the stronger one.",
    text:
      "Next week Monday ko unit test hai. " +
      "Test mein chapter 4 aur 5 se questions aayenge.",
    expect: [
      {
        kind: "deadline",
        matchedCue: "deadline.exam_scheduled",
        duePhrase: "Next week Monday",
        minConfidence: 0.7,
      },
      {
        kind: "exam_scope",
        matchedCue: "exam_scope.topics",
        duePhrase: null,
        evidenceIncludes: "chapter 4",
        minConfidence: 0.6,
      },
    ],
  },
  {
    note: "Plain English. The lexicon is code-switched, not Hindi-only.",
    text: "Your lab report submission deadline is next Friday.",
    expect: [
      {
        kind: "deadline",
        matchedCue: "deadline.explicit",
        duePhrase: "next Friday",
        minConfidence: 0.85,
      },
    ],
  },
  {
    note:
      "Advice, not obligation. 'You should' vs 'you must' is the product's " +
      "central discrimination, so these must land in guidance and nowhere else.",
    text:
      "koshish kariye ki back exercises solve kar lein. " +
      "try to revise the derivation before next class.",
    expect: [
      {
        kind: "guidance",
        matchedCue: "guidance.advice",
        duePhrase: null,
        evidenceIncludes: "koshish kariye",
        minConfidence: 0.5,
      },
      {
        kind: "guidance",
        matchedCue: "guidance.advice",
        duePhrase: "next class",
        evidenceIncludes: "derivation",
        minConfidence: 0.6,
      },
    ],
  },
  {
    note:
      "Advice-shaped but instructional: 'let's revise' is the lecturer doing " +
      "the revision on the board. Same addressee veto, applied to guidance.",
    text: "chaliye let's revise the derivation once more.",
    expect: [],
  },
  {
    note:
      "A course-specific deliverable name. Found WITHOUT course context via " +
      "the deliberately hard-gated bare-obligation rule; found more " +
      "confidently WITH it. See COURSE_CONTEXT below.",
    text: "Tutorial Sheet 4 aapko agle hafte tak complete karna hai.",
    expect: [
      {
        kind: "assignment",
        matchedCue: "assignment.bare_obligation",
        duePhrase: "agle hafte",
        minConfidence: 0.6,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Derived transcript geometry
// ---------------------------------------------------------------------------

// Segments are laid out back to back in one character space, joined by a
// single space, so `FULL_TRANSCRIPT_TEXT.slice(charStart, charEnd)` is exactly
// the evidence text of any candidate. The self-test asserts that identity --
// it is the cheapest possible check that citations point where they claim to.
function buildSegments(cases: readonly SegmentCase[]): {
  segments: readonly TranscriptSegmentInput[];
  fullText: string;
} {
  const segments: TranscriptSegmentInput[] = [];
  let charCursor = 0;
  cases.forEach((c, i) => {
    segments.push({
      text: c.text,
      startMs: i * SEGMENT_MS,
      endMs: (i + 1) * SEGMENT_MS,
      charStart: charCursor,
      charEnd: charCursor + c.text.length,
    });
    charCursor += c.text.length + 1; // the joining space
  });
  return { segments, fullText: cases.map((c) => c.text).join(" ") };
}

const built = buildSegments(SEGMENT_CASES);

export const LECTURE_SEGMENTS = built.segments;
export const FULL_TRANSCRIPT_TEXT = built.fullText;

// The default pass carries NO course context. Course context must be able to
// improve extraction; it must never be required for it, and most lectures
// reaching this pipeline will arrive without any.
export const FIXTURE_INPUT: ExtractionInput = { segments: LECTURE_SEGMENTS };

// ---------------------------------------------------------------------------
// Course context (used only by the focused context test)
// ---------------------------------------------------------------------------

export const COURSE_CONTEXT: readonly CourseContextDocument[] = [
  {
    kind: "syllabus",
    title: "PHY-201 Electrostatics — Course Handout",
    body:
      "Assessment weightage: Tutorial Sheet (15%), Lab Record (10%), " +
      "Unit Test (25%), End Sem (50%). A new Tutorial Sheet is released " +
      "every Monday and is due the following week.",
  },
];

// The segment that changes when the syllabus above is supplied.
export const COURSE_CONTEXT_SEGMENT: TranscriptSegmentInput = {
  text: "Tutorial Sheet 4 aapko agle hafte tak complete karna hai.",
  startMs: 0,
  endMs: SEGMENT_MS,
  charStart: 0,
  charEnd: 56,
};

// ---------------------------------------------------------------------------
// The known false positives, isolated
// ---------------------------------------------------------------------------

// Each of these contains "करना है" / "karna hai" and each is subject-matter
// instruction. They are asserted individually as well as inside the lecture
// above, because a regression here is the one that quietly destroys the
// method's usefulness -- it produces more output, not less, and more output
// looks like it is working.
export const KNOWN_FALSE_POSITIVES: readonly string[] = [
  "इसे हमें पॉजिटिव चार्ज करना है।",
  "अब हमें इस चार्ज को यहाँ से वहाँ मूव करना है।",
  "toh ab humein is body ko positive charge karna hai.",
  "ye numerical humein exam ke point of view se solve karna hai.",
  "exam me is charge ka electric field derive karna hai.",
  "iska integration humein karna hai taaki electric potential nikal sake.",
  "chaliye let's revise the derivation once more.",
];
