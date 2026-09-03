// Self-test for Ask routing and the ask meter. Run with:
//
//   node --conditions=react-server scripts/test-ask.mts
//
// FREE. Pure functions over fabricated units; no network, no database, no key.
//
// What is pinned here and why it matters:
//
//   1. DIRECT IS A WHITELIST. Every question that needs synthesis --
//      why/how/explain/compare/summarise -- must route to the model, whatever
//      else it mentions. The failure mode of routing is a question answered
//      worse than it would have been; these tests are the fence.
//   2. THE HONEST GAP IS AN ANSWER. "Who is the assignment for" and "when is
//      it due" against a schema that does not store those facts must come back
//      naming the gap, at $0, never padding around it.
//   3. THE METER NEVER LIES. Unknown token counts stay null (never zero), the
//      question is capped, and the meter line always states the route.

import {
  classifyForDirect,
  composeDirectAnswer,
  retrieve,
  routeAsk,
} from "../src/lib/knowledge/ask-routing.ts";
import { buildAskRunRow, meterLine, type AskRunRecord } from "../src/lib/knowledge/ask-meter.ts";
import type { KnowledgeUnit } from "../src/lib/knowledge/read.ts";

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail?: string): void {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? `\n    ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* ------------------------------------------------------------------------- */

let nextId = 0;
function unit(over: Partial<KnowledgeUnit>): KnowledgeUnit {
  nextId += 1;
  return {
    id: `u-${nextId}`,
    lectureId: "lec-1",
    lectureTitle: "Cloud Computing",
    courseId: "course-1",
    category: "teaching",
    kind: "concept",
    title: "Untitled",
    summary: "A summary.",
    steps: [],
    unspecified: [],
    status: "auto",
    confidence: null,
    evidence: [],
    ...over,
  };
}

const ASSIGNMENT = unit({
  category: "actionable",
  kind: "assignment",
  title: "Voice Communication Working Principle Preparation",
  summary: "Prepare a working-principle writeup on voice communication and submit it.",
  unspecified: ["submission deadline", "marks weightage"],
  status: "confirmed",
});

const ASSIGNMENT_NO_GAPS = unit({
  category: "actionable",
  kind: "assignment",
  title: "Transformation Assignment",
  summary: "Complete the transformation exercise from the lecture by Friday.",
  unspecified: [],
  status: "confirmed",
});

const TEACHING = [
  unit({ title: "What VoIP Is", summary: "Voice carried over IP networks." }),
  unit({ title: "G.711 vs G.729 Codecs", summary: "Two codecs with different bandwidth trade-offs." }),
  unit({ title: "PSTN Fundamentals", summary: "The circuit-switched telephone network." }),
];

const COURSE = [...TEACHING, ASSIGNMENT];

/* ------------------------------------------------------------------------- */
/* 1. Synthesis questions must never route direct                             */
/* ------------------------------------------------------------------------- */

console.log("synthesis stays on the model:");
const MODEL_QUESTIONS = [
  "Why is VoIP cheaper than PSTN?",
  "How does the G.729 codec compress audio?",
  "Explain the assignment",                       // mentions work, still synthesis
  "What is the difference between G.711 and G.729?",
  "Compare PSTN and VoIP",
  "Summarize what was covered",                    // covered, but summarise wins
  "Can you describe the assignment in simple terms?",
  "What did the teacher mean by elasticity?",
  "What is cloud computing?",                      // definitional -> default model
  "Which codec is better for low bandwidth?",
  "Should I use TCP or UDP for voice?",
  "What was covered about codecs and how do they relate to bandwidth?", // two asks
];
for (const q of MODEL_QUESTIONS) {
  check(routeAsk(q, COURSE, COURSE).route === "model", `model: "${q}"`);
}

check(
  routeAsk(
    "When is the assignment due and also please tell me everything I need to know to prepare for it properly?",
    COURSE, COURSE,
  ).route === "model",
  "a long compound question routes to the model even with a deadline word in it",
);

/* ------------------------------------------------------------------------- */
/* 2. Assignment listings are direct and complete                             */
/* ------------------------------------------------------------------------- */

console.log("assignment listings go direct:");
for (const q of [
  "What assignments are due?",
  "Is there any homework?",
  "any assignments?",
  "Did sir give any assignment?",
  "What tasks do we have pending?",
]) {
  const r = routeAsk(q, COURSE, retrieveLike(q, COURSE));
  check(r.route === "direct", `direct: "${q}"`);
  if (r.route === "direct") {
    check(r.direct.answer.includes(ASSIGNMENT.title), `  lists the assignment: "${q}"`);
    check(r.direct.usedUnits.length === 1 && r.direct.usedUnits[0].id === ASSIGNMENT.id,
      `  cites exactly the assignment: "${q}"`);
  }
}

// "any assignments?" has ZERO term overlap with the stored titles -- the exact
// case that must not depend on retrieval hits.
{
  const r = routeAsk("any assignments?", COURSE, []);
  check(r.route === "direct" && r.direct.answer.includes(ASSIGNMENT.title),
    "a listing works even when retrieval found nothing");
}

// No actionable knowledge at all: the honest $0 answer is "none recorded",
// not "nothing covers that".
{
  const r = routeAsk("what assignments are due?", TEACHING, []);
  check(r.route === "direct", "no assignments: still direct");
  if (r.route === "direct") {
    check(/no assignments|nothing actionable/i.test(r.direct.answer),
      "no assignments: says none are recorded");
    check(r.direct.usedUnits.length === 0, "no assignments: cites nothing");
  }
}

/* ------------------------------------------------------------------------- */
/* 3. Deadline questions: honest gap or model, never a guess                  */
/* ------------------------------------------------------------------------- */

console.log("deadlines:");
{
  // One assignment whose deadline is explicitly unspecified: the gap IS the
  // answer, at $0.
  const r = routeAsk("When is the assignment due?", COURSE, [ASSIGNMENT]);
  check(r.route === "direct", "unspecified deadline: direct");
  if (r.route === "direct") {
    check(/didn'?t specify/i.test(r.direct.answer), "unspecified deadline: names the gap");
    check(r.direct.answer.includes("submission deadline"), "unspecified deadline: quotes the stored gap");
  }
}
{
  // The deadline may be buried in summary prose -- extracting it is the
  // model's job, not a regex's.
  const r = routeAsk("When is the assignment due?", [...TEACHING, ASSIGNMENT_NO_GAPS], [ASSIGNMENT_NO_GAPS]);
  check(r.route === "model", "deadline present in prose: model composes it");
}
{
  // Two candidate assignments is a judgement call.
  const both = [...TEACHING, ASSIGNMENT, ASSIGNMENT_NO_GAPS];
  const r = routeAsk("When is the assignment due?", both, [ASSIGNMENT, ASSIGNMENT_NO_GAPS]);
  check(r.route === "model", "two candidate assignments: model disambiguates");
}

/* ------------------------------------------------------------------------- */
/* 4. Audience questions: the schema cannot answer, so the gap is named at $0 */
/* ------------------------------------------------------------------------- */

console.log("audience:");
{
  const r = routeAsk("Who is the assignment for?", COURSE, [ASSIGNMENT]);
  check(r.route === "direct", "audience: direct");
  if (r.route === "direct") {
    check(/doesn'?t record who/i.test(r.direct.answer), "audience: names the gap");
    check(r.direct.answer.includes(ASSIGNMENT.title), "audience: still names the assignment");
  }
}
check(routeAsk("Who is the assignment for?", TEACHING, []).route === "model",
  "audience with no actionable knowledge anywhere: falls back to model");
check(routeAsk("Who discovered cloud computing?", COURSE, TEACHING).route === "model",
  "a who-question with no work in play is not an audience lookup");

/* ------------------------------------------------------------------------- */
/* 5. Topic listings                                                          */
/* ------------------------------------------------------------------------- */

console.log("topics:");
{
  const r = routeAsk("What topics were covered?", COURSE, []);
  check(r.route === "direct", "topics: direct");
  if (r.route === "direct") {
    check(TEACHING.every((t) => r.direct.answer.includes(t.title)), "topics: lists every teaching title");
    check(r.direct.answer.includes("Cloud Computing:"), "topics: grouped by lecture");
  }
}
check(routeAsk("What topics were covered?", [ASSIGNMENT], []).route === "model",
  "topics with nothing taught: model (which will say so)");

/* ------------------------------------------------------------------------- */
/* 6. Classifier internals worth pinning                                      */
/* ------------------------------------------------------------------------- */

console.log("classifier edges:");
check(classifyForDirect("", []) === null, "empty question classifies nowhere");
check(classifyForDirect("Who has to submit it by Friday?", [ASSIGNMENT]) === "audience",
  "who-question containing a date stays an audience question");
check(classifyForDirect("what is due this week", [ASSIGNMENT]) === "assignments",
  "bare 'due' is a listing, not a deadline");
check(classifyForDirect("when is it due?", [ASSIGNMENT]) === "deadline",
  "'when…due' with an actionable hit is a deadline even without the noun");
check(classifyForDirect("when is it due?", TEACHING) === null,
  "'when is it due' with nothing actionable in play matches no intent");
check(composeDirectAnswer("deadline", TEACHING, []) === null,
  "deadline composer with no actionable units refuses");

/* ------------------------------------------------------------------------- */
/* 7. The meter                                                               */
/* ------------------------------------------------------------------------- */

console.log("meter:");
const MODEL_RUN: AskRunRecord = {
  courseId: "course-1", lectureId: null, userId: "user-1",
  question: "When is the assignment due?", route: "model",
  provider: "gemini", model: "gemini-3.5-flash-lite", requestId: "req-9",
  promptTokens: 1200, completionTokens: 80,
  unitsAvailable: 4, unitsCited: 3, durationMs: 950, error: null,
};

{
  const row = buildAskRunRow(MODEL_RUN);
  check(row.course_id === "course-1" && row.user_id === "user-1", "row: ids map to snake_case");
  check(row.prompt_tokens === 1200 && row.completion_tokens === 80, "row: tokens carried");
  check(row.route === "model" && row.request_id === "req-9", "row: route and request id carried");
  check(row.lecture_id === null, "row: course scope keeps lecture_id null");
}
{
  const row = buildAskRunRow({ ...MODEL_RUN, promptTokens: null, completionTokens: null });
  check(row.prompt_tokens === null && row.completion_tokens === null,
    "row: unreported usage stays null, never zero");
}
{
  const long = "x".repeat(900);
  const row = buildAskRunRow({ ...MODEL_RUN, question: long });
  check(typeof row.question === "string" && (row.question as string).length <= 500,
    "row: question capped at 500 chars");
}
{
  const l = meterLine(MODEL_RUN);
  check(l.includes("route=model") && l.includes("tokens=1200+80"), "line: paid ask shows its tokens");
  const free = meterLine({ ...MODEL_RUN, route: "direct", provider: null, model: null, promptTokens: null, completionTokens: null });
  check(free.includes("route=direct") && free.includes("tokens=0 (no call)"),
    "line: a direct ask is visibly $0");
  const unknown = meterLine({ ...MODEL_RUN, promptTokens: null });
  check(unknown.includes("tokens=?+80"), "line: unknown usage prints ?, not 0");
  const failedRun = meterLine({ ...MODEL_RUN, route: "degraded", error: "429 rate limited" });
  check(failedRun.includes("error="), "line: a degraded ask names its failure");
}

/* ------------------------------------------------------------------------- */

// A term-overlap stand-in for retrieve() so this test does not import read.ts
// at runtime (which would drag in the Supabase client). Same contract:
// score > 0 units, actionable boosted for work questions.
function retrieveLike(question: string, units: KnowledgeUnit[]): KnowledgeUnit[] {
  const terms = question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2);
  const wantsWork = /(assign|homework|submit|deadline|due|exam|task|deliver|marks?)/i.test(question);
  return units.filter((u) => {
    const hay = `${u.title} ${u.summary}`.toLowerCase();
    return terms.some((t) => hay.includes(t)) || (wantsWork && u.category === "actionable");
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
