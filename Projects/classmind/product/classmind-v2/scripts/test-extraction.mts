// Self-test for the extraction module. Run with: npm run test:extraction
//
// No test framework on purpose. This module is pure logic with zero
// dependencies, Node runs TypeScript directly, and a runner that needs
// installing is a runner that stops being run. If a real suite arrives later
// these assertions port over unchanged; until then the bar is that the check
// is one command and always available.
//
// Prints PASS/FAIL per assertion and exits non-zero on any failure, so it is
// usable as a CI gate as-is.
//
// Imports are relative with explicit extensions because plain `node` does not
// read tsconfig `paths` -- the extraction module keeps its internal imports in
// the same style for exactly this reason.

import {
  getExtractionMethod,
  listExtractionMethods,
  type ExtractionCandidate,
} from "../src/lib/extraction/index.ts";
import { __internals } from "../src/lib/extraction/rules.ts";
import {
  COURSE_CONTEXT,
  COURSE_CONTEXT_SEGMENT,
  FIXTURE_INPUT,
  FULL_TRANSCRIPT_TEXT,
  KNOWN_FALSE_POSITIVES,
  LECTURE_SEGMENTS,
  SEGMENT_CASES,
  type ExpectedCandidate,
} from "../src/lib/extraction/__tests__/rules.fixture.ts";

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n--- ${title} ---`);
}

// The product default is now the composite `lecture` method. Most of this file
// pins the ACTIONABLE half, so it asks for `rules` by name -- otherwise every
// assertion about "this sentence yields nothing" would also be asserting that
// the teaching pass found nothing in it, which is a different claim.
const method = getExtractionMethod("rules");
const defaultMethod = getExtractionMethod();

// ---------------------------------------------------------------------------
// 1. The registry
// ---------------------------------------------------------------------------

section("Registry");

check(method.id === "rules", "default method is `rules`", `got "${method.id}"`);
check(
  /^\d+\.\d+\.\d+$/.test(method.version),
  "method reports a semver version",
  `got "${method.version}"`,
);
check(
  listExtractionMethods().length >= 1,
  "at least one method is registered",
);
check(
  getExtractionMethod("rules") === method,
  "getExtractionMethod('rules') resolves to the actionable-only baseline",
);

let threwOnUnknown = false;
try {
  getExtractionMethod("llm");
} catch {
  threwOnUnknown = true;
}
check(
  threwOnUnknown,
  "an unknown method id throws rather than silently defaulting",
  "a silent fallback would attribute one method's numbers to another",
);

// ---------------------------------------------------------------------------
// 2. The lecture, without course context
// ---------------------------------------------------------------------------

section("Extraction over the fixture lecture (no course context)");

const candidates = method.extract(FIXTURE_INPUT);

function candidatesForSegment(index: number): ExtractionCandidate[] {
  const segment = LECTURE_SEGMENTS[index];
  return candidates.filter(
    (c) =>
      c.evidenceCharStart >= segment.charStart &&
      c.evidenceCharEnd <= segment.charEnd,
  );
}

function describe(c: ExtractionCandidate): string {
  return `${c.kind}/${c.matchedCue} @${c.confidence} due=${JSON.stringify(
    c.duePhrase,
  )} "${c.detail}"`;
}

function matches(c: ExtractionCandidate, e: ExpectedCandidate): boolean {
  if (c.kind !== e.kind || c.matchedCue !== e.matchedCue) return false;
  if (e.duePhrase !== undefined && c.duePhrase !== e.duePhrase) return false;
  if (e.evidenceIncludes && !c.evidenceText.includes(e.evidenceIncludes)) return false;
  if (e.evidenceExcludes && c.evidenceText.includes(e.evidenceExcludes)) return false;
  if (e.minConfidence !== undefined && c.confidence < e.minConfidence) return false;
  return true;
}

SEGMENT_CASES.forEach((testCase, index) => {
  const got = candidatesForSegment(index);
  const label = `segment ${index}: ${testCase.note.split(".")[0]}`;

  check(
    got.length === testCase.expect.length,
    `${label} — expected ${testCase.expect.length} candidate(s)`,
    got.length === testCase.expect.length
      ? undefined
      : `got ${got.length}:\n        ${got.map(describe).join("\n        ")}`,
  );

  for (const expected of testCase.expect) {
    const hit = got.find((c) => matches(c, expected));
    check(
      hit !== undefined,
      `${label} — ${expected.kind}/${expected.matchedCue}`,
      hit
        ? undefined
        : `no candidate matched. got:\n        ${
            got.map(describe).join("\n        ") || "(none)"
          }`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. The known false positives, asserted individually
// ---------------------------------------------------------------------------
//
// The failure this guards against does not look like a failure. A regression
// here makes the method emit MORE, and more output reads as better coverage
// right up until a reviewer has to reject half of it.

section("Known false positives must not be emitted");

for (const sentence of KNOWN_FALSE_POSITIVES) {
  const got = method.extract({
    segments: [
      {
        text: sentence,
        startMs: 0,
        endMs: 5_000,
        charStart: 0,
        charEnd: sentence.length,
      },
    ],
  });
  check(
    got.length === 0,
    `suppressed: "${sentence}"`,
    got.length === 0 ? undefined : `emitted:\n        ${got.map(describe).join("\n        ")}`,
  );
}

// ---------------------------------------------------------------------------
// 4. The suppression heuristics, unit level
// ---------------------------------------------------------------------------

section("Suppression heuristics");

const { readSignals, narrationVeto } = __internals;
const noCourseTerms = __internals.deriveCourseTerms(undefined);

function veto(text: string): string | null {
  return narrationVeto(readSignals(text, noCourseTerms), "full").reason;
}

check(
  veto("इसे हमें पॉजिटिव चार्ज करना है") === "inclusive_first_person_without_addressee",
  "veto A fires on first-person-plural with no addressee",
  `got ${JSON.stringify(veto("इसे हमें पॉजिटिव चार्ज करना है"))}`,
);
check(
  veto("exam me is charge ka electric field derive karna hai") ===
    "domain_vocabulary_density",
  "veto B fires on two or more domain terms with no work noun",
  `got ${JSON.stringify(veto("exam me is charge ka electric field derive karna hai"))}`,
);
check(
  veto("ise test se pehle karna hai") === "demonstrative_object",
  "veto C fires on a demonstrative object with no work noun or addressee",
  `got ${JSON.stringify(veto("ise test se pehle karna hai"))}`,
);
check(
  veto("aapko ye assignment agle Thursday tak submit karna hai") === null,
  "a real obligation survives all three vetoes",
);
check(
  narrationVeto(
    readSignals("एक दो दिन में आपको मैं स्केड्यूल भी रिलीज कर देंगे", noCourseTerms),
    "none",
  ).vetoed === false,
  "announcements are exempt: a lecturer's first-person promise is not vetoed",
);

// ---------------------------------------------------------------------------
// 5. Spoken phrase handling — Capture Contract article 4
// ---------------------------------------------------------------------------

section("duePhrase is verbatim and dueResolved is never populated");

check(
  candidates.every((c) => c.dueResolved === null),
  "no candidate carries a resolved date",
);
check(
  candidates
    .filter((c) => c.duePhrase !== null)
    .every((c) => c.evidenceText.includes(c.duePhrase as string)),
  "every duePhrase is a verbatim substring of its own evidence",
  candidates
    .filter((c) => c.duePhrase !== null && !c.evidenceText.includes(c.duePhrase))
    .map(describe)
    .join("\n        "),
);

const { findDuePhrase } = __internals;
const phraseCases: ReadonlyArray<readonly [string, string | null]> = [
  ["aapko ye kal tak karna hai", "kal tak"],
  ["assignment agle Thursday tak submit karna hai", "agle Thursday"],
  ["एक दो दिन में आपको मैं स्केड्यूल रिलीज कर देंगे", "एक दो दिन में"],
  ["एक-दो दिन में नोट्स मिल जाएंगे", "एक-दो दिन में"],
  ["Next week Monday ko unit test hai", "Next week Monday"],
  ["submission deadline is next Friday", "next Friday"],
  ["report ko 5 baje tak jama karna hai", "5 baje"],
  // No time expression anywhere: the field must be null, never a guess.
  ["is chapter ko dhyan se padhna hai", null],
  // The trap the restricted "by/till/until" tail exists for.
  ["before we start, open your notebooks", null],
];
for (const [text, expected] of phraseCases) {
  const got = findDuePhrase(text);
  check(
    got === expected,
    `duePhrase(${JSON.stringify(text)}) === ${JSON.stringify(expected)}`,
    `got ${JSON.stringify(got)}`,
  );
}

// ---------------------------------------------------------------------------
// 6. Evidence integrity
// ---------------------------------------------------------------------------

section("Evidence spans");

check(
  candidates.every(
    (c) => FULL_TRANSCRIPT_TEXT.slice(c.evidenceCharStart, c.evidenceCharEnd) === c.evidenceText,
  ),
  "every char span slices back to exactly its own evidence text",
  candidates
    .filter(
      (c) =>
        FULL_TRANSCRIPT_TEXT.slice(c.evidenceCharStart, c.evidenceCharEnd) !== c.evidenceText,
    )
    .map(describe)
    .join("\n        "),
);
check(
  candidates.every((c) => c.evidenceEndMs >= c.evidenceStartMs),
  "every time range is non-negative",
);
check(
  candidates.every((c) => c.confidence > 0 && c.confidence <= 1),
  "every confidence is inside (0, 1]",
);
check(
  candidates.every((c) => c.title.trim().length > 0 && c.detail.trim().length > 0),
  "every candidate carries a non-empty title and detail",
);

// One candidate per span: the dedup rule. Two candidates sharing a char span
// would mean a reviewer sees the same sentence twice.
const spans = candidates.map((c) => `${c.evidenceCharStart}:${c.evidenceCharEnd}`);
check(
  new Set(spans).size === spans.length,
  "no two candidates share an evidence span",
);

// ---------------------------------------------------------------------------
// 7. Course context influences but is never required
// ---------------------------------------------------------------------------

section("Course context");

const withoutContext = method.extract({ segments: [COURSE_CONTEXT_SEGMENT] });
const withContext = method.extract({
  segments: [COURSE_CONTEXT_SEGMENT],
  courseContext: COURSE_CONTEXT,
});

check(
  withoutContext.length === 1,
  "the sentence is still extracted with no course context at all",
  `got ${withoutContext.length}`,
);
check(
  withContext.length === 1 && withContext[0].matchedCue.includes("course_context"),
  "with a syllabus, the candidate is attributed to a course-derived cue",
  withContext.map(describe).join("\n        "),
);
check(
  withContext.length === 1 &&
    withoutContext.length === 1 &&
    withContext[0].confidence > withoutContext[0].confidence,
  "course context raises confidence rather than gating the match",
  `${withoutContext[0]?.confidence} -> ${withContext[0]?.confidence}`,
);
check(
  __internals.deriveCourseTerms(COURSE_CONTEXT).some((c) => c.term === "tutorial sheet"),
  "the syllabus's assessment name is harvested as a deliverable term",
);
check(
  __internals.deriveCourseTerms([
    { kind: "notes", title: "Newton And Coulomb", body: "Chapter One covers Gauss Law." },
  ]).length === 0,
  "Title Case alone is not enough to be harvested — an assessment head-noun is required",
);

// ---------------------------------------------------------------------------
// 8. Degenerate input
// ---------------------------------------------------------------------------

section("Degenerate input");

check(method.extract({ segments: [] }).length === 0, "empty transcript yields nothing");
check(
  method.extract({
    segments: [{ text: "   ", startMs: 0, endMs: 1, charStart: 0, charEnd: 3 }],
  }).length === 0,
  "whitespace-only segment yields nothing",
);
check(
  method.extract({ segments: LECTURE_SEGMENTS, courseContext: [] }).length ===
    candidates.length,
  "an empty course-context array behaves exactly like an absent one",
);

// ---------------------------------------------------------------------------
// 9. University syllabus lectures  (rules v1.1.0)
// ---------------------------------------------------------------------------
//
// The lexicon was built from a Class-12 coaching lecture and read a real
// 18-minute university course-outline lecture as 2 generic guidance items --
// missing the entire module-by-module syllabus and the prescribed textbook,
// which are the only two things in that lecture a student actually needs.
// These cases pin the two rules added for it, and the negative cases pin the
// gate that stops them firing inside ordinary teaching.

section("University syllabus lectures");

// Both rules run at suppression "none" because every sentence they exist to
// catch is first-person-plural, which veto A deletes. If a later change flips
// them to "full" or "addressee", every one of these goes red.
function onlyCandidate(text: string) {
  const out = method.extract({
    segments: [{ text, startMs: 0, endMs: 12_000, charStart: 0, charEnd: text.length }],
  });
  return out.length === 1 ? out[0] : null;
}

const coverage = onlyCandidate("In the second module, we discuss system, control volume and the state of a system.");
check(
  coverage?.kind === "exam_scope" && coverage.matchedCue.startsWith("exam_scope.course_coverage"),
  "a module walkthrough is extracted as exam_scope",
  coverage ? describe(coverage) : "no single candidate",
);

const objectives = onlyCandidate("The primary learning objectives in this course are to learn the first and the second laws of thermodynamics.");
check(
  objectives?.kind === "exam_scope",
  "stated learning objectives are extracted as exam_scope",
  objectives ? describe(objectives) : "no single candidate",
);

check(
  coverage?.title.startsWith("Module") === true,
  "a coverage candidate is titled by its curricular unit, not by a stray material term",
  coverage?.title,
);

const textbook = onlyCandidate("I will be teaching primarily out of my textbook which is Fundamentals of Engineering Thermodynamics.");
check(
  textbook?.kind === "announcement" && textbook.matchedCue.startsWith("announcement.prescribed_material"),
  "a prescribed textbook is extracted as an announcement",
  textbook ? describe(textbook) : "no single candidate",
);

// The gate. Without a curricular unit noun, "we will look at" is a step in a
// derivation -- and a rules engine that cannot tell those apart floods the
// review queue with the lecture itself.
check(
  method.extract({
    segments: [{
      text: "So we will look at the compressor and calculate the pressure rise across it.",
      startMs: 0, endMs: 12_000, charStart: 0, charEnd: 76,
    }],
  }).length === 0,
  "`we will look at` with no curricular unit does NOT fire",
);
check(
  method.extract({
    segments: [{
      text: "Now we discuss what happens to the entropy of the universe here.",
      startMs: 0, endMs: 12_000, charStart: 0, charEnd: 64,
    }],
  }).length === 0,
  "mid-explanation narration with no curricular unit does NOT fire",
);
// A bare mention of a book is not a prescription -- the prescription cue is
// what separates "buy this" from "a book exists".
check(
  method.extract({
    segments: [{
      text: "The textbook has a diagram of this cycle on the next page.",
      startMs: 0, endMs: 12_000, charStart: 0, charEnd: 58,
    }],
  }).length === 0,
  "naming a textbook without a prescription cue produces no ACTIONABLE item",
);
// Under the composite method the same sentence is legitimately a reference --
// a resource the lecturer named. It must not become an announcement.
check(
  defaultMethod.extract({
    segments: [{
      text: "The textbook has a diagram of this cycle on the next page.",
      startMs: 0, endMs: 12_000, charStart: 0, charEnd: 58,
    }],
  }).every((c) => c.kind === "reference"),
  "under the composite method it is a reference, never an announcement",
);

// Regression guard on the whole point of the change.
const SYLLABUS_LECTURE = [
  "So the outline of the course is as follows, we start with an introduction.",
  "In the second module, we discuss basic concepts such as system and control volume.",
  "Now in the third module, we discuss work and heat.",
  "In the next module, we look at second law of thermodynamics.",
  "I will be teaching primarily out of my textbook, Fundamentals of Engineering Thermodynamics.",
].map((text, i) => ({
  text,
  startMs: i * 12_000,
  endMs: i * 12_000 + 12_000,
  charStart: i * 200,
  charEnd: i * 200 + text.length,
}));
const syllabusOut = method.extract({ segments: SYLLABUS_LECTURE });
check(
  syllabusOut.length === 5,
  "every sentence of a syllabus walkthrough is extracted",
  `${syllabusOut.length} of 5`,
);
check(
  syllabusOut.filter((c) => c.kind === "exam_scope").length === 4 &&
    syllabusOut.filter((c) => c.kind === "announcement").length === 1,
  "a syllabus walkthrough yields scope items plus the prescribed reading",
  syllabusOut.map((c) => c.kind).join(","),
);
check(
  syllabusOut.every((c) => c.duePhrase === null),
  "a syllabus walkthrough invents no due dates",
);

// ---------------------------------------------------------------------------

section("Summary");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nCandidates emitted over the fixture lecture:");
  for (const c of candidates) console.log(`  ${describe(c)}`);
}
process.exit(failed > 0 ? 1 : 0);
