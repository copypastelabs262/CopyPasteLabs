// What a knowledge write should do, and whether a lecture may be published.
//
// Both decisions used to be inlined -- one inside storeKnowledge, one inside
// the extract route -- and both were wrong in the same way: they could not tell
// "the reasoning pass looked and found nothing" apart from "the reasoning pass
// never got to look". That distinction is the whole content of this file, so it
// is written once, here, as pure logic that runs under plain node.
//
// Pure. No database, no network, no clock. The callers do the I/O.

import type { ReconstructedItem } from "../reasoning/reconstruct.ts";
import { sameSpan, spanOf, type Span } from "../reasoning/span.ts";

// ---------------------------------------------------------------------------
// 1. The knowledge write
// ---------------------------------------------------------------------------

export type KnowledgeStatus = "auto" | "pending" | "confirmed" | "rejected";

// A knowledge item already attached to this lecture, with the transcript span
// its evidence covers. The span is what identity is decided on -- see span.ts.
export interface ExistingItem {
  id: string;
  status: KnowledgeStatus;
  span: Span;
}

// 'replaced'  the pass was complete, so its result is authoritative and the
//             lecture's previous machine-derived knowledge was superseded.
// 'seeded'    the lecture had no knowledge, so whatever was produced is a
//             strict improvement on nothing -- stored even from a partial pass.
// 'preserved' the pass was INCOMPLETE and the lecture already holds knowledge.
//             Nothing is written and nothing is destroyed.
export type KnowledgeWriteOutcome = "replaced" | "seeded" | "preserved";

export interface KnowledgeWritePlan {
  outcome: KnowledgeWriteOutcome;
  // Machine-derived rows this pass supersedes. Never includes a row a human
  // has ruled on.
  deleteIds: string[];
  insert: ReconstructedItem[];
  // Items dropped because a human has already ruled on that same obligation.
  // Derived by subtraction from a filter with exactly one rejection reason; a
  // second reason would need its own counter rather than sharing this one.
  skippedAlreadyJudged: number;
  // Rows that survive this write untouched.
  //
  // `keptCount + (rows actually inserted)` is the lecture's knowledge total
  // afterwards, and that number is the ONLY contract between this function and
  // decideReadiness below -- it is what the caller must pass as `knowledgeTotal`.
  // Re-querying for it instead would let the two halves disagree about whether
  // a lecture has anything in it.
  keptCount: number;
}

// A verdict is human work and is never discarded, re-opened or duplicated by a
// machine re-run.
const JUDGED: ReadonlySet<KnowledgeStatus> = new Set<KnowledgeStatus>(["confirmed", "rejected"]);

// Re-processing a lecture REPLACES its machine-derived knowledge rather than
// accumulating it. That is safe precisely because it is derived: the audio, the
// raw ASR response and the Layer-1 candidates are all untouched, so any deleted
// item can be regenerated. Accumulating instead would leave a student reading
// two contradictory versions of the same assignment with no way to tell which
// is current.
//
// TWO THINGS MAKE THE REPLACEMENT CONDITIONAL, AND BOTH ARE FAILURES SEEN IN
// PRODUCTION.
//
// `complete` is false when any window of the reasoning pass failed. An
// incomplete pass has observed only part of the lecture, and letting a partial
// observation replace a complete one silently deletes knowledge that is still
// true -- a provider outage mid-run would empty a live lecture and report
// success. So an incomplete pass may seed an empty lecture, and may never
// overwrite a populated one.
//
// A human verdict is never re-opened. The previous version kept confirmed and
// rejected rows and then re-inserted the very same obligations as fresh
// proposals, so every re-run grew a duplicate twin of every confirmed
// assignment and quietly undid every rejection. An item whose evidence sits
// where a judged item's evidence sits IS that item, and the verdict stands.
export function planKnowledgeWrite(
  existing: readonly ExistingItem[],
  items: readonly ReconstructedItem[],
  complete: boolean,
): KnowledgeWritePlan {
  if (!complete && existing.length > 0) {
    return {
      outcome: "preserved",
      deleteIds: [],
      insert: [],
      skippedAlreadyJudged: 0,
      keptCount: existing.length,
    };
  }

  const judged = existing.filter((e) => JUDGED.has(e.status));
  const deleteIds = existing.filter((e) => !JUDGED.has(e.status)).map((e) => e.id);

  const insert = items.filter((item) => {
    const span = spanOf(item.evidence);
    return !judged.some((j) => sameSpan(j.span, span));
  });

  return {
    outcome: existing.length > 0 ? "replaced" : "seeded",
    deleteIds,
    insert,
    skippedAlreadyJudged: items.length - insert.length,
    keptCount: judged.length,
  };
}

// ---------------------------------------------------------------------------
// 2. May this lecture be published?
// ---------------------------------------------------------------------------
//
// 'ready' is the status that makes a lecture readable course material: every
// student-facing read filters on it, and the UI tells the teacher their lecture
// is now searchable. Granting it to a lecture with no knowledge in it is the
// same failure shape as the Arabic transcript -- confident success over an
// empty result -- and it happened for the same reason: nothing distinguished
// "there was nothing to find" from "we never managed to look".

export type ReadinessCode =
  // Knowledge exists. Normal.
  | "ok"
  // No reasoning model is configured, so the lecture was never read for meaning.
  | "reasoning_unavailable"
  // The transcript could not be divided into windows -- no timeline, or no
  // speech. Nothing was read.
  | "nothing_to_read"
  // Windows were read but some failed, and the lecture holds no knowledge.
  | "reconstruction_incomplete"
  // Every window was read successfully and the model returned nothing at all.
  // Rare, and not the same thing as a failure -- but still not publishable.
  | "no_knowledge_found";

export interface ReadinessInput {
  reasoningAvailable: boolean;
  // False when any window of the pass failed.
  complete: boolean;
  // How many windows the pass actually attempted.
  windows: number;
  // Knowledge items attached to the lecture AFTER the write, including rows
  // kept from an earlier run.
  knowledgeTotal: number;
}

export interface Readiness {
  ready: boolean;
  code: ReadinessCode;
  // Written for a faculty member, and stored on the lecture so the reason
  // survives the request that produced it. Null only when ready.
  reason: string | null;
}

// The single rule: a lecture is publishable when it actually has knowledge to
// serve. Everything else is a diagnosis of why it does not.
//
// Deliberately NOT "the pass succeeded": a pass that loses three windows out of
// thirty still leaves twenty-seven windows of real knowledge, and withholding
// all of it would turn a partial failure into a total one. Equally deliberately
// NOT "the pass ran": a pass that ran and stored nothing leaves a student with
// an empty lecture labelled ready.
export function decideReadiness(input: ReadinessInput): Readiness {
  if (input.knowledgeTotal > 0) return { ready: true, code: "ok", reason: null };

  if (!input.reasoningAvailable) {
    return {
      ready: false,
      code: "reasoning_unavailable",
      reason:
        "No reasoning model is configured, so this lecture was never read for meaning and " +
        "holds no knowledge. It stays unpublished rather than appearing to students as an " +
        "empty lecture.",
    };
  }

  if (input.windows === 0) {
    return {
      ready: false,
      code: "nothing_to_read",
      reason:
        "This lecture's transcript could not be divided into any readable window -- it " +
        "carries no usable timeline or no speech -- so nothing was read from it.",
    };
  }

  if (!input.complete) {
    return {
      ready: false,
      code: "reconstruction_incomplete",
      reason:
        "The reasoning pass failed on one or more parts of this lecture and produced no " +
        "knowledge at all. This is a processing failure, not an empty lecture. Run " +
        "extraction again.",
    };
  }

  return {
    ready: false,
    code: "no_knowledge_found",
    reason:
      "The whole lecture was read successfully and no assignment, announcement or taught " +
      "topic was found in it. Nothing was lost -- there is simply nothing to publish.",
  };
}
