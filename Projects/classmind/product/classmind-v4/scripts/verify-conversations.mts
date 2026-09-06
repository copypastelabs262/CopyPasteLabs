// LIVE verification of persistent conversations, against the real server and
// the real database. Run with:
//
//   npm run verify:conversations
//   (= node --env-file=.env.local scripts/verify-conversations.mts)
//
// COST: $0 BY CONSTRUCTION. Every question asked here is a listing lookup the
// routing layer answers on the direct route ("What assignments were given?"),
// so persistence, ownership, resumability and metering are all exercised
// without one model call. (Multi-turn ANSWER quality is a separate, deliberate
// paid eval -- eval-ask-quality.mts.) The dev server must be running on 3500.
//
// When migration 20260906150000 is NOT applied, this script verifies the
// DEGRADED contract instead -- ask still answers, states are honest -- then
// exits naming the HUMAN-ONLY step. Run it again after applying.

import { createClient } from "@supabase/supabase-js";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3500";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const COURSE = "6a8484f7-be19-4044-b725-8d66efdfaa4a"; // Robotics & Automation (Test1)
const LECTURE = "87a4a143-2f88-40fd-9bc2-8e1bd71c0ce8"; // the processed Robotics lecture
const DIRECT_Q = "What assignments were given?"; // pinned direct in test:ask -- $0

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) { passed += 1; console.log(`PASS  ${label}`); }
  else {
    failed += 1;
    console.log(`FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 400)}`);
  }
}
const section = (t: string) => console.log(`\n--- ${t} ---`);

const anon = () => createClient(URL_, ANON, { auth: { persistSession: false } });
async function signIn(email: string): Promise<string> {
  const { data, error } = await anon().auth.signInWithPassword({ email, password: "ClassMindTest!2026" });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

// The response shapes this script actually touches -- loose, but never `any`.
interface ApiBody {
  state?: string;
  note?: string;
  error?: string;
  route?: string;
  meter?: string;
  answer?: string;
  usage?: { promptTokens?: number | null } | null;
  sources?: { courseId?: string; lectureId?: string; lectureTitle?: string }[];
  conversations?: { id: string; title: string; lastMessageAt?: string }[];
  conversation?: { id: string | null; title?: string | null; state?: string } | null;
  messages?: {
    role: string;
    content: string;
    payload?: { route?: string; sources?: unknown[] } | null;
  }[];
}

async function api(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; json: ApiBody }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let json: ApiBody = {};
  try { json = (await res.json()) as ApiBody; } catch { /* status-only checks */ }
  return { status: res.status, json };
}

const ping = await fetch(BASE).catch(() => null);
if (!ping?.ok) { console.error(`Dev server not reachable at ${BASE}.`); process.exit(1); }

const student = await signIn("student.test@classmind.local");
// Enrolled in the SAME course but owns none of the student's threads -- the
// point is to reach the OWNERSHIP check, not to bounce off the course gate.
const stranger = await signIn("faculty.test@classmind.local");

section("Availability");
const list0 = await api(student, `/api/courses/${COURSE}/conversations?lectureId=${LECTURE}`);
check(list0.status === 200, "conversation listing answers", list0.status);

if (list0.json.state === "unavailable") {
  section("DEGRADED CONTRACT (migration 20260906150000 not applied)");
  check(typeof list0.json.note === "string" && list0.json.note.includes("20260906150000"),
    "the listing names the missing migration honestly", list0.json.note);
  const ask = await api(student, `/api/courses/${COURSE}/ask`, {
    body: { question: DIRECT_Q, lectureId: LECTURE, persist: true },
  });
  check(ask.status === 200 && ask.json.route === "direct", "ask still answers (direct, $0) with persistence requested", { status: ask.status, route: ask.json.route });
  check(ask.json.conversation?.state === "unavailable" && ask.json.conversation?.id === null,
    "the response says persistence is unavailable instead of pretending", ask.json.conversation);
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log("\nHUMAN-ONLY: apply supabase/migrations/20260906150000_conversations.sql in the");
  console.log("Supabase SQL editor, then run this script again for the full verification.");
  process.exit(failed > 0 ? 1 : 0);
}

/* ---------------------------------------------------------------------------
   Full contract -- the migration is applied
--------------------------------------------------------------------------- */

section("Create by first question (never by page visit)");
const before = (list0.json.conversations ?? []).length;
const ask1 = await api(student, `/api/courses/${COURSE}/ask`, {
  body: { question: DIRECT_Q, lectureId: LECTURE, persist: true },
});
check(ask1.status === 200 && ask1.json.route === "direct", "first ask answers on the direct route ($0)", { status: ask1.status, route: ask1.json.route });
const convo = ask1.json.conversation;
check(convo?.state === "ok" && typeof convo?.id === "string", "the exchange was persisted and the conversation identified", convo);
check(typeof convo?.title === "string" && convo.title !== "New conversation",
  "the title derived from the question, no model call", convo?.title);
const conversationId: string = convo?.id ?? "";

section("Resume -- the stored thread is whole");
const got1 = await api(student, `/api/conversations/${conversationId}`);
check(got1.status === 200 && got1.json.state === "ok", "the conversation loads back");
const messages = got1.json.messages ?? [];
check(messages.length === 2 && messages[0].role === "student" && messages[1].role === "classmind",
  "one exchange = two ordered messages", messages.map((m) => m.role));
check(messages[0].content === DIRECT_Q, "the student message is verbatim");
check(messages[1].payload?.route === "direct" && Array.isArray(messages[1].payload?.sources),
  "the assistant message persisted its provenance (route + sources)", messages[1].payload?.route);

section("Continuation -- server-held history, no client blob");
const ask2 = await api(student, `/api/courses/${COURSE}/ask`, {
  body: { question: "What assignments were given?", conversationId },
});
check(ask2.status === 200 && ask2.json.conversation?.id === conversationId, "a follow-up lands in the same conversation");
const got2 = await api(student, `/api/conversations/${conversationId}`);
check((got2.json.messages ?? []).length === 4, "the thread grew to four messages", (got2.json.messages ?? []).length);
const seqs = (got2.json.messages ?? []).map((m) => m.role);
check(JSON.stringify(seqs) === JSON.stringify(["student", "classmind", "student", "classmind"]),
  "ordering is student/classmind alternating by seq", seqs);

section("Listing and multiple conversations");
const ask3 = await api(student, `/api/courses/${COURSE}/ask`, {
  body: { question: "What was taught? List the topics covered.", lectureId: LECTURE, persist: true },
});
const secondId: string = ask3.json.conversation?.id ?? "";
check(secondId !== "" && secondId !== conversationId,
  "a fresh persist starts a SECOND conversation", secondId);
const list1 = await api(student, `/api/courses/${COURSE}/conversations?lectureId=${LECTURE}`);
check((list1.json.conversations ?? []).length >= before + 2, "both conversations list for the lecture");
check(list1.json.conversations?.[0]?.id === secondId,
  "newest activity first", list1.json.conversations?.[0]?.id);

section("Scope separation -- lecture threads stay lecture threads");
const courseList = await api(student, `/api/courses/${COURSE}/conversations`);
check(!(courseList.json.conversations ?? []).some((c) => c.id === conversationId),
  "the course Ask tab's listing does NOT contain lecture-scoped threads");

section("Ownership -- another signed-in user learns nothing");
const strangerRead = await api(stranger, `/api/conversations/${conversationId}`);
check(strangerRead.status === 404, "reading someone else's conversation is a plain 404", strangerRead.status);
const strangerAsk = await api(stranger, `/api/courses/${COURSE}/ask`, {
  body: { question: DIRECT_Q, conversationId },
});
check(strangerAsk.status === 404, "continuing someone else's conversation is a plain 404", strangerAsk.status);
const strangerDelete = await api(stranger, `/api/conversations/${conversationId}`, { method: "DELETE" });
check(strangerDelete.status === 404, "deleting someone else's conversation is a plain 404", strangerDelete.status);
const stillThere = await api(student, `/api/conversations/${conversationId}`);
check(stillThere.status === 200, "and the owner's thread is untouched");

section("Wrong-course continuation refused");
const wrongCourse = await api(student, `/api/courses/5ab749fb-d4fd-42fc-85ba-b9de82fe1dcf/ask`, {
  body: { question: DIRECT_Q, conversationId },
});
check(wrongCourse.status === 404, "a conversation cannot be continued from a different course", wrongCourse.status);

section("Wrong-lecture continuation refused");
// The failed .aac upload's row -- a different lecture in the SAME course.
const wrongLecture = await api(student, `/api/courses/${COURSE}/ask`, {
  body: { question: DIRECT_Q, conversationId, lectureId: "5384de32-3444-4012-b056-bd3c537a4205" },
});
check(wrongLecture.status === 409, "naming a different lecture refuses instead of silently moving the thread", wrongLecture.status);

section("Malformed ids are 404s, never database errors");
const badId = await api(student, `/api/conversations/not-a-uuid`);
check(badId.status === 404 && !JSON.stringify(badId.json).includes("syntax"),
  "a malformed conversation id yields a plain 404", badId);

section("Meter stayed honest");
check(ask1.json.usage === null && ask2.json.usage === null && ask3.json.usage === null,
  "every question here rode the direct route -- zero model usage recorded");
check(ask1.json.meter === "ok" && ask2.json.meter === "ok", "ask_runs recorded each ask exactly once");

section("Scope boundaries are visible in the sources");
check((ask1.json.sources ?? []).every((s) => s.lectureId === LECTURE),
  "a LECTURE ask cites only its own lecture", ask1.json.sources?.map((s) => s.lectureId));
const subjectAsk = await api(student, `/api/courses/${COURSE}/ask`, {
  body: { question: "What topics were covered?" },
});
check(subjectAsk.json.route === "direct" &&
  (subjectAsk.json.sources ?? []).length > 0 &&
  (subjectAsk.json.sources ?? []).every((s) => s.courseId === COURSE),
  "a SUBJECT ask cites only its own subject", subjectAsk.json.sources?.map((s) => s.courseId));

/* ---------------------------------------------------------------------------
   GLOBAL scope -- the whole-student boundary
--------------------------------------------------------------------------- */

section("GLOBAL -- cross-subject listing at $0");
const gList0 = await api(student, "/api/ask/conversations");
check(gList0.status === 200 && gList0.json.state === "ok", "the global conversation listing answers");
// POST-only by design: a GET that answers questions would spend money and
// write rows on a top-level cross-site navigation (SameSite=Lax).
const getAsk = await api(student, `/api/ask?q=${encodeURIComponent(DIRECT_Q)}`);
check(getAsk.status === 405, "GET /api/ask is refused (405) -- a link must never spend", getAsk.status);
const g1 = await api(student, "/api/ask", {
  body: { question: "What assignments do I have?", persist: true },
});
check(g1.status === 200 && g1.json.route === "direct",
  "the cross-subject assignment listing rides the direct route ($0)", { status: g1.status, route: g1.json.route });
const gAnswer = g1.json.answer ?? "";
check(gAnswer.includes("Test1") && gAnswer.includes("Test2"),
  "…naming both subjects that HAVE recorded work", gAnswer.slice(0, 240));
check(!gAnswer.includes("CC101"),
  "…and staying silent about the subject with nothing recorded");
const gSourceCourses = new Set((g1.json.sources ?? []).map((s) => s.courseId));
check(gSourceCourses.size >= 2, "global sources genuinely span subjects", [...gSourceCourses]);
console.log(`  global meter state: ${g1.json.meter} (stays "unavailable" until 20260906180000 is applied)`);
const gId: string = g1.json.conversation?.id ?? "";
check(gId !== "" && g1.json.conversation?.state === "ok", "the global thread persisted");

section("GLOBAL -- resume and follow-up continuity");
const gGot = await api(student, `/api/conversations/${gId}`);
check(gGot.status === 200 && (gGot.json.messages ?? []).length === 2, "the global thread loads back whole");
const g2 = await api(student, "/api/ask", {
  body: { question: "Who has to do it?", conversationId: gId },
});
check(g2.json.route === "direct" && (g2.json.answer ?? "").includes("Shyam, Shiv aur dusra ye Darshan"),
  "a follow-up answers from the stored thread at $0, in the lecturer's own words",
  { route: g2.json.route, answer: g2.json.answer?.slice(0, 160) });

section("GLOBAL -- scope is authoritative, never widened or borrowed");
const gViaCourse = await api(student, `/api/courses/${COURSE}/ask`, {
  body: { question: DIRECT_Q, conversationId: gId },
});
check(gViaCourse.status === 404, "a global thread cannot be continued from a course surface", gViaCourse.status);
const lectureViaGlobal = await api(student, "/api/ask", {
  body: { question: DIRECT_Q, conversationId },
});
check(lectureViaGlobal.status === 404, "a lecture thread cannot be continued from the global surface", lectureViaGlobal.status);
const gListAfter = await api(student, "/api/ask/conversations");
check((gListAfter.json.conversations ?? []).some((c) => c.id === gId), "the global listing shows the global thread");
check(!(gListAfter.json.conversations ?? []).some((c) => c.id === conversationId),
  "…and never the lecture threads");
const strangerGlobal = await api(stranger, `/api/conversations/${gId}`);
check(strangerGlobal.status === 404, "another user's read of the global thread is a plain 404", strangerGlobal.status);

section("GLOBAL -- cleanup");
{
  const del = await api(student, `/api/conversations/${gId}`, { method: "DELETE" });
  check(del.status === 200, "global thread deleted");
}

section("Cleanup -- the throwaway threads");
for (const id of [conversationId, secondId].filter(Boolean)) {
  const del = await api(student, `/api/conversations/${id}`, { method: "DELETE" });
  check(del.status === 200, `deleted ${id.slice(0, 8)}…`);
}
const listEnd = await api(student, `/api/courses/${COURSE}/conversations?lectureId=${LECTURE}`);
check((listEnd.json.conversations ?? []).length === before, "the listing is back to where it started");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
