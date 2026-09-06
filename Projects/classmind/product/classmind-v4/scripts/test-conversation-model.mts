// Self-test for the conversation contract. Run with:
//
//   node scripts/test-conversation-model.mts
//
// FREE and offline: conversation-model.ts is pure (its one import from
// answer.ts is type-only and erased at runtime), so the scope shapes, the
// title derivation, the context caps and the payload parsing are all pinned
// without a database or a model.

import {
  CONTEXT_MESSAGES,
  DEFAULT_TITLE,
  contextMatches,
  deriveConversationTitle,
  messagesToHistory,
  parseAnswerPayload,
  planConversationContext,
  type StoredMessage,
} from "../src/lib/knowledge/conversation-model.ts";

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) { passed += 1; console.log(`PASS  ${label}`); }
  else {
    failed += 1;
    console.log(`FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 300)}`);
  }
}
const section = (t: string) => console.log(`\n--- ${t} ---`);

/* ---------------------------------------------------------------------------
   Scope planning -- the three representable shapes and nothing else
--------------------------------------------------------------------------- */

section("Scope planning");
{
  const lecture = planConversationContext({ courseId: "c1", lectureId: "l1" });
  check(!("error" in lecture) && lecture.scope === "lecture" && lecture.lectureId === "l1",
    "course + lecture -> lecture scope", lecture);
}
{
  const course = planConversationContext({ courseId: "c1" });
  check(!("error" in course) && course.scope === "course" && course.lectureId === null,
    "course alone -> course scope", course);
}
{
  const globalScope = planConversationContext({});
  check(!("error" in globalScope) && globalScope.scope === "global" && globalScope.courseId === null,
    "neither -> global scope (the Global Ask foundation)", globalScope);
}
{
  const bad = planConversationContext({ lectureId: "l1" });
  check("error" in bad, "a lecture without its course is an error, never a guess", bad);
}
{
  const blank = planConversationContext({ courseId: "  ", lectureId: "" });
  check(!("error" in blank) && blank.scope === "global", "whitespace ids are absence", blank);
}

section("Context matching -- the stored row is the truth");
const LECTURE_CTX = { scope: "lecture" as const, courseId: "c1", lectureId: "l1" };
const COURSE_CTX = { scope: "course" as const, courseId: "c1", lectureId: null };
const GLOBAL_CTX = { scope: "global" as const, courseId: null, lectureId: null };
check(contextMatches(LECTURE_CTX, { courseId: "c1", lectureId: "l1" }), "lecture thread matches its own lecture");
check(!contextMatches(LECTURE_CTX, { courseId: "c1", lectureId: "l2" }), "lecture thread refuses a different lecture");
check(!contextMatches(LECTURE_CTX, { courseId: "c2", lectureId: "l1" }), "lecture thread refuses a different course");
check(contextMatches(LECTURE_CTX, { courseId: "c1" }), "lecture thread is reachable from its course surface");
check(contextMatches(COURSE_CTX, { courseId: "c1" }), "course thread matches its course");
check(!contextMatches(COURSE_CTX, { courseId: "c1", lectureId: "l1" }), "course thread refuses lecture narrowing");
check(contextMatches(GLOBAL_CTX, {}), "global thread matches the global surface");
check(!contextMatches(GLOBAL_CTX, { courseId: "c1" }), "global thread refuses a course surface -- scopes never bleed");

/* ---------------------------------------------------------------------------
   Titles -- deterministic, recognisable, never a model call
--------------------------------------------------------------------------- */

section("Title derivation");
check(deriveConversationTitle("Teach me cache scaling.") === "Cache scaling", "boilerplate stripped",
  deriveConversationTitle("Teach me cache scaling."));
check(deriveConversationTitle("what is cache scaling?") === "Cache scaling", "question-form stripped",
  deriveConversationTitle("what is cache scaling?"));
check(deriveConversationTitle("Who is the assignment for?") === "Who is the assignment for", "plain questions keep their words");
check(deriveConversationTitle("   ") === DEFAULT_TITLE, "blank stays the default");
check(deriveConversationTitle("Explain.") !== "" && deriveConversationTitle("Explain.") !== DEFAULT_TITLE,
  "an all-boilerplate question still gets a real label", deriveConversationTitle("Explain."));
{
  const long = deriveConversationTitle(
    "Explain the complete difference between relative and absolute resource allocation with every bound involved",
  );
  check(long.length <= 66 && long.endsWith("…"), "long titles cut at a word boundary with an ellipsis", long);
}
check(deriveConversationTitle("teach me   cache    scaling") === "Cache scaling", "whitespace collapsed");

/* ---------------------------------------------------------------------------
   Stored thread -> model context
--------------------------------------------------------------------------- */

section("Messages to history");
let seq = 0;
const msg = (role: StoredMessage["role"], content: string): StoredMessage => ({
  id: `m${++seq}`, role, content, payload: null, seq, createdAt: "2026-09-06T00:00:00Z",
});
{
  const thread = [
    msg("student", "Teach me cache scaling."),
    msg("classmind", "Cache scaling extends the cache tier [1]."),
    msg("student", ""),
    msg("classmind", "…"),
  ];
  const history = messagesToHistory(thread);
  check(history.length === 3 && history[0].role === "student" && history[1].role === "classmind",
    "roles survive the mapping and empty messages are dropped", history);
}
{
  const long = Array.from({ length: 40 }, (_, i) => msg(i % 2 ? "classmind" : "student", `turn ${i}`));
  const history = messagesToHistory(long);
  check(history.length === CONTEXT_MESSAGES, `context capped at ${CONTEXT_MESSAGES} messages`, history.length);
  check(history[history.length - 1].text === "turn 39", "the newest messages are the ones kept");
}

section("Answer payload round trip");
{
  const payload = { route: "model", degraded: false, knowledgeUnitsAvailable: 4, sources: [{ ref: 1 }] };
  const parsed = parseAnswerPayload(payload);
  check(parsed !== null && parsed.route === "model" && parsed.sources.length === 1, "a stored payload parses back whole", parsed);
}
check(parseAnswerPayload(null) === null, "null payload (student messages) parses to null");
check(parseAnswerPayload("garbage") === null, "a non-object parses to null, never throws");
{
  const partial = parseAnswerPayload({ sources: "not-an-array" });
  check(partial !== null && partial.sources.length === 0 && partial.route === "model",
    "a malformed payload degrades to safe defaults", partial);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
