// LAYER 4 ROUTING -- which questions must not pay for a model call.
//
// Every Ask used to make one billed reasoning call whenever retrieval found
// anything at all -- including questions retrieval had already answered
// ("which assignments are due?") and questions the stored schema can never
// answer ("who is it for?"), where the model's only possible contribution was
// prose wrapped around a gap.
//
// THE RULE: DIRECT IS A WHITELIST. A question is answered model-free only when
// it matches a known lookup intent AND the composer below can build the answer
// from stored fields alone. Anything that smells of synthesis -- why, how,
// compare, explain, summarise -- is forced to the model BEFORE intents are
// consulted, so "explain the assignment" can never be served a listing. Every
// path that is not certain falls through to the model; the failure mode of
// this file is a question that costs money unnecessarily, never a question
// answered worse than it would have been.
//
// Pure and dependency-free so scripts/test-ask.mts can drive every branch
// offline. The import from ./read.ts is type-only for the same reason.

import type { KnowledgeUnit } from "./read.ts";

// How the answer was produced. Recorded per question by the ask meter and
// returned on the wire, because "this cost tokens" and "this cost nothing"
// are different facts and the product must be able to tell them apart.
//
//   model         one billed reasoning call composed the prose
//   direct        answered from stored fields; no call was made
//   degraded      a model was wanted but unavailable or failing; the retrieved
//                 notes were listed instead
//   no_knowledge  retrieval found nothing to answer from
export type AskRoute = "model" | "direct" | "degraded" | "no_knowledge";

export type DirectIntent = "assignments" | "deadline" | "audience" | "topics";

// Synthesis markers. Any of these means the asker wants explanation,
// comparison, reasoning or interpretation -- work only a model can do over
// this data -- so they veto the direct path unconditionally and are checked
// before any intent. Deliberately broad: a false positive here costs one
// model call, a false negative costs a student a listing where they asked
// for an explanation.
const NEEDS_MODEL =
  /\b(why|how|explain|elaborat\w*|understand|clarif\w*|mean(?:s|ing)?|summar\w*|overview|describ\w*|compar\w*|difference|different|differ|versus|vs\.?|relat\w*|connect\w*|example|analog\w*|detail\w*|depth|walk\s*(?:me\s*)?through|derive|prove|justify|impact|effect|advantage|disadvantage|benefit|drawback|pros|cons|significan\w*|purpose|better|best|worse|worst|should\s+(?:i|we)|help\s+me|confus\w*|simple\s+terms|eli5)\b/i;

// A question long enough to be compound is a question whose shape this file
// cannot judge. Eighteen words is generous for a lookup.
const MAX_DIRECT_WORDS = 18;

const WORK_NOUN =
  /\b(assignments?|home\s?works?|tasks?|deliverables?|submissions?|quiz(?:zes)?|exams?|tests?|projects?|practicals?)\b/i;

// Explicit time interrogatives only. Bare "due" is NOT here: "what is due this
// week" is a listing question, and stealing it for the deadline intent would
// answer a list with a single item.
const ASKS_WHEN =
  /\b(when|by\s+when|what\s+(?:date|time)|due\s*date|deadline|last\s+date|submission\s+date)\b/i;

const ASKS_WHO = /\b(who|whom|which\s+students?)\b/i;
const WHO_CONTEXT =
  /\b(for|assigned|submit\w*|supposed|responsible|has\s+to|have\s+to|needs?\s+to|should)\b/i;

const LISTS = /\b(what|which|any|list|show|is\s+there|are\s+there|do\s+(?:we|i)\s+have|pending|due|given?|gave|got)\b/i;

const COVERED = /\b(covered|discussed|taught|topics?)\b/i;

export function classifyForDirect(question: string, hits: KnowledgeUnit[]): DirectIntent | null {
  const q = question.trim();
  if (!q) return null;
  if (NEEDS_MODEL.test(q)) return null;
  if (q.split(/\s+/).length > MAX_DIRECT_WORDS) return null;
  // Two question marks is two questions; the model gets both.
  if ((q.match(/\?/g) ?? []).length > 1) return null;

  const mentionsWork = WORK_NOUN.test(q);
  const actionableInPlay = mentionsWork || hits.some((u) => u.category === "actionable");

  // Audience before deadline: "who has to submit it by Friday" is a
  // who-question that happens to contain a date.
  if (ASKS_WHO.test(q) && WHO_CONTEXT.test(q) && actionableInPlay) return "audience";
  if (ASKS_WHEN.test(q) && actionableInPlay) return "deadline";
  if (LISTS.test(q) && (mentionsWork || (/\b(due|pending)\b/i.test(q) && actionableInPlay)))
    return "assignments";
  if (COVERED.test(q) && /\b(what|which|list)\b/i.test(q)) return "topics";

  return null;
}

export interface DirectAnswer {
  answer: string;
  usedUnits: KnowledgeUnit[];
}

// How many units a direct listing will cite before pointing at the tabs
// instead. A wall of sources is the lecture page, not an answer.
const LIST_CAP = 8;

const line = (u: KnowledgeUnit, n: number) => `[${n}] ${u.title} — ${u.summary}`;

// Build the answer from stored fields, or refuse. Null means "this intent
// matched but the stored data cannot answer it confidently" -- the caller
// falls through to the model, which is always a safe place to land.
export function composeDirectAnswer(
  intent: DirectIntent,
  units: KnowledgeUnit[],
  hits: KnowledgeUnit[],
): DirectAnswer | null {
  switch (intent) {
    case "assignments": {
      // Listed from ALL visible units, not the term-matched hits: "any
      // assignments?" shares no vocabulary with the assignment it is asking
      // about, and a listing that misses one because of wording is wrong.
      const work = units.filter((u) => u.category === "actionable");
      if (!work.length) {
        return {
          answer:
            "No assignments or tasks are recorded in the stored lecture knowledge yet. " +
            "Nothing actionable has been extracted from the processed lectures so far.",
          usedUnits: [],
        };
      }
      const cited = work.slice(0, LIST_CAP);
      const rest = work.length - cited.length;
      const head =
        work.length === 1
          ? "One assignment is recorded:"
          : `${work.length} assignments/tasks are recorded:`;
      return {
        answer: [
          head,
          ...cited.map((u, i) => line(u, i + 1)),
          ...(rest > 0 ? [`…and ${rest} more under the Assignments tab.`] : []),
        ].join("\n"),
        usedUnits: cited,
      };
    }

    case "deadline": {
      // Only the unambiguous case is answered here: exactly one assignment in
      // play, and the lecture EXPLICITLY left its deadline unspecified. That
      // gap is a stored fact and stating it is the honest answer. A deadline
      // buried in summary prose is extraction work -- the model's job -- and
      // two candidate assignments is a judgement call, also the model's job.
      const inHits = hits.filter((u) => u.category === "actionable");
      const candidates = inHits.length ? inHits : units.filter((u) => u.category === "actionable");
      if (candidates.length !== 1) return null;
      const u = candidates[0];
      const gaps = u.unspecified.filter((g) => /date|deadline|due|time|when|submit/i.test(g));
      if (!gaps.length) return null;
      return {
        answer:
          `The lecture didn't specify a deadline for [1] ${u.title}. ` +
          `Recorded as not specified: ${gaps.join("; ")}.`,
        usedUnits: [u],
      };
    }

    case "audience": {
      // The extraction contract has no audience field (roadmap, 2026-09-02),
      // so no stored unit can say who work is for. The honest answer is that
      // exact gap, named -- and it costs nothing, because no model call can
      // improve on it until the contract changes.
      const inHits = hits.filter((u) => u.category === "actionable");
      const candidates = (inHits.length ? inHits : units.filter((u) => u.category === "actionable"))
        .slice(0, LIST_CAP);
      if (!candidates.length) return null;
      const naming =
        candidates.length === 1
          ? `who [1] ${candidates[0].title} is for`
          : "who any of the recorded assignments are for";
      return {
        answer: [
          `The stored lecture knowledge doesn't record ${naming} — the extraction doesn't ` +
            "capture an audience yet, so that detail isn't available to answer from. " +
            "What is recorded:",
          ...candidates.map((u, i) => line(u, i + 1)),
        ].join("\n"),
        usedUnits: candidates,
      };
    }

    case "topics": {
      const taught = units.filter((u) => u.category !== "actionable");
      if (!taught.length) return null;
      const cited = taught.slice(0, LIST_CAP);
      const rest = taught.length - cited.length;
      // Grouped by lecture so a course-wide question reads as a syllabus, not
      // a heap.
      const byLecture = new Map<string, string[]>();
      cited.forEach((u, i) => {
        const key = u.lectureTitle;
        if (!byLecture.has(key)) byLecture.set(key, []);
        byLecture.get(key)!.push(`[${i + 1}] ${u.title}`);
      });
      return {
        answer: [
          "The stored lecture knowledge covers:",
          ...[...byLecture.entries()].map(([lec, titles]) => `${lec}: ${titles.join(" · ")}`),
          ...(rest > 0 ? [`…and ${rest} more under the Lectures tab.`] : []),
        ].join("\n"),
        usedUnits: cited,
      };
    }
  }
}

// Retrieval for question answering.
//
// Term overlap over a few dozen stored units, not embeddings. The retrieval set
// for one course is small enough that a vector index would be infrastructure
// with no problem to solve, and lexical matching over a knowledge base whose
// text is already a clean English summary behaves well. This is the piece to
// revisit first if recall becomes the complaint.
//
// Moved here from read.ts 2026-09-03 so scripts/test-ask.mts covers it, and
// fixed on the way: the confirmed-status bonus used to be unconditional, which
// made every confirmed item a "hit" for EVERY question -- a gibberish question
// against a course with one confirmed assignment retrieved that assignment and
// went on to pay a model to answer from it. Confirmation now breaks ties among
// units that already matched; it cannot create a match from nothing.
export function retrieve(units: KnowledgeUnit[], question: string, limit = 8): KnowledgeUnit[] {
  const terms = question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2);
  if (!terms.length) return units.slice(0, limit);

  const WANTS_ACTIONABLE = /(assign|homework|submit|deadline|due|exam|task|deliver|marks?)/i.test(question);

  const scored = units.map((u) => {
    const hay = `${u.title} ${u.summary} ${u.steps.join(" ")} ${u.kind}`.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += 2;
    // A question about work should surface work, even when the words differ.
    if (WANTS_ACTIONABLE && u.category === "actionable") score += 3;
    // A confirmed item outranks an automatic one at EQUAL RELEVANCE: a human
    // has vouched for it. Only where something already matched -- see above.
    if (score > 0 && u.status === "confirmed") score += 1;
    return { u, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.u);
}

export type RouteDecision = { route: "direct"; direct: DirectAnswer } | { route: "model" };

// The one entry point. "model" here means "let the existing pipeline decide"
// -- the caller still degrades honestly when no model is configured.
export function routeAsk(
  question: string,
  units: KnowledgeUnit[],
  hits: KnowledgeUnit[],
): RouteDecision {
  const intent = classifyForDirect(question, hits);
  if (!intent) return { route: "model" };
  const direct = composeDirectAnswer(intent, units, hits);
  return direct ? { route: "direct", direct } : { route: "model" };
}
