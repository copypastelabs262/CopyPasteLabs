// The extraction boundary. Everything outside this directory imports from
// here and from nowhere else inside it.
//
// V1 ships exactly ONE method. The registry is not speculative generality --
// it is the thing that makes the comparison the capstone is graded on
// possible, and it has to exist before the second method does or the second
// method arrives as a fork of the first. Adding NER or an LLM is a new file
// plus one line in METHODS; no caller changes.

// Relative imports with explicit extensions, matching rules.ts -- see the note
// there. This module stays runnable by plain `node`.
export type {
  CandidateKind,
  KnowledgeCategory,
  CourseContextDocument,
  CourseContextKind,
  ExtractionCandidate,
  ExtractionInput,
  ExtractionMethod,
  TranscriptSegmentInput,
} from "./types.ts";
export { CANDIDATE_KINDS, categoryOf } from "./types.ts";

import type { ExtractionCandidate, ExtractionInput, ExtractionMethod } from "./types.ts";
import { rulesExtractionMethod } from "./rules.ts";
import { extractTeaching } from "./teaching.ts";

// The method the product actually runs.
//
// A lecture is two different documents wearing one transcript. `rules` reads it
// for obligations -- what a student must DO -- and is deliberately hard to
// satisfy, because a false deadline is expensive. `teaching` reads the same
// transcript for what was EXPLAINED, using discourse structure rather than
// subject keywords. Neither subsumes the other, and on a real college lecture
// running only the first produced one candidate out of a lecture containing a
// dozen taught topics.
//
// Composed rather than merged into one rule table on purpose: the two have
// opposite error costs. Obligations should be missed rather than invented;
// teaching topics are cheap to over-produce and expensive to miss. Keeping them
// as separate passes keeps those two thresholds independently tunable.
function composeLectureMethod(input: ExtractionInput): ExtractionCandidate[] {
  const actionable = rulesExtractionMethod.extract(input);
  const teaching = extractTeaching(input.segments);

  // Where both passes claim the same sentence, the actionable reading wins.
  // "Research paper ko aapko find karna hai" is a recap in shape and an
  // assignment in consequence, and the consequence is what a student needs.
  const claimed = new Set(
    actionable.map((c) => `${c.evidenceStartMs}:${c.evidenceCharStart}`),
  );

  return [...actionable, ...teaching.filter(
    (c) => !claimed.has(`${c.evidenceStartMs}:${c.evidenceCharStart}`),
  )].sort(
    (a, b) => a.evidenceStartMs - b.evidenceStartMs || a.evidenceCharStart - b.evidenceCharStart,
  );
}

export const lectureExtractionMethod: ExtractionMethod = {
  id: "lecture",
  version: "1.1.0",
  displayName: "Lecture knowledge (obligations + teaching structure)",
  extract: composeLectureMethod,
};

// The method used when a caller expresses no preference. Cue matching, because
// it is free, instant, offline and deterministic -- the only method that can
// be the default before any accuracy number has been measured against a
// benchmark.
export const DEFAULT_EXTRACTION_METHOD_ID = "lecture";

// `rules` stays registered and unchanged. It is the actionable-only baseline
// every future method gets compared against, and deleting it would destroy the
// only comparison the capstone is graded on.
const METHODS: readonly ExtractionMethod[] = [lectureExtractionMethod, rulesExtractionMethod];

export function listExtractionMethods(): readonly ExtractionMethod[] {
  return METHODS;
}

// Throws on an unknown id rather than silently falling back to the default.
//
// A silent fallback would mean an evaluation run requested "llm", quietly got
// "rules", and reported the resulting number under the wrong method name.
// Capture Contract obligation 3 makes that unrecoverable: a stored candidate
// whose producer is misattributed cannot be re-run or compared, and nothing
// about the output would look wrong. Loud failure is the cheap option.
export function getExtractionMethod(id?: string): ExtractionMethod {
  const wanted = id ?? DEFAULT_EXTRACTION_METHOD_ID;
  const method = METHODS.find((m) => m.id === wanted);
  if (!method) {
    const known = METHODS.map((m) => m.id).join(", ");
    throw new Error(
      `Unknown extraction method "${wanted}". Registered methods: ${known}.`,
    );
  }
  return method;
}

export { rulesExtractionMethod };
export { extractTeaching } from "./teaching.ts";
