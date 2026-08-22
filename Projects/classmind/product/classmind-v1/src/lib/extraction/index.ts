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
  CourseContextDocument,
  CourseContextKind,
  ExtractionCandidate,
  ExtractionInput,
  ExtractionMethod,
  TranscriptSegmentInput,
} from "./types.ts";
export { CANDIDATE_KINDS } from "./types.ts";

import type { ExtractionMethod } from "./types.ts";
import { rulesExtractionMethod } from "./rules.ts";

// The method used when a caller expresses no preference. Cue matching, because
// it is free, instant, offline and deterministic -- the only method that can
// be the default before any accuracy number has been measured against a
// benchmark.
export const DEFAULT_EXTRACTION_METHOD_ID = "rules";

const METHODS: readonly ExtractionMethod[] = [rulesExtractionMethod];

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
