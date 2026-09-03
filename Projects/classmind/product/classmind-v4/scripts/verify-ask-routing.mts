// Live verification for Ask routing and metering -- over HTTP, signed in as
// the test student, at $0 BY CONSTRUCTION.
//
// Run it ONLY against a server started WITHOUT reasoning credentials:
//
//   GEMINI_API_KEY= GROQ_API_KEY= SARVAM_API_KEY= npx next dev -p 3501
//   E2E_BASE_URL=http://localhost:3501 node --env-file=.env.local scripts/verify-ask-routing.mts
//
// A keyless server cannot bill anyone whatever this script sends: a question
// that escapes the direct route lands on `missing_key` and degrades to the
// listing. That is also the point of the exercise -- the assertions below
// prove that lookup questions never NEED the model, by asking them of a server
// that does not have one:
//
//   A  a lookup question ("any assignments?") answers route=direct with the
//      real stored knowledge, usage null -- the $0 path, live;
//   B  the audience question answers by NAMING THE GAP, not padding;
//   C  a synthesis question is NOT answered directly -- keyless it degrades,
//      which proves it would have reached the model on a real server;
//   D  a question nothing covers answers route=no_knowledge;
//   E  every response carries route, usage and meter, and nothing ever
//      reports route=model or non-null usage on a keyless server.
//
// Read-only over knowledge data. The single write per run is the ask meter
// itself (one ask_runs row per question, or a log line if the migration is
// not applied -- the `meter` field in each response says which).

import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3501";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const STUDENT = { email: "student.test@classmind.local", password: "ClassMindTest!2026" };

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
    return;
  }
  failures.push(label);
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 500));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

async function api(token: string, path: string): Promise<{ status: number; json: Payload }> {
  const res = await fetch(BASE + path, { headers: { authorization: `Bearer ${token}` } });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { nonJson: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function main() {
  const anon = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  const signIn = await anon.auth.signInWithPassword(STUDENT);
  if (signIn.error) throw new Error(`Cannot sign in ${STUDENT.email}: ${signIn.error.message}`);
  const token = signIn.data.session!.access_token;

  const courses = await api(token, "/api/courses");
  const course = [...(courses.json?.enrolled ?? []), ...(courses.json?.owned ?? [])][0];
  if (!course) throw new Error("The test student is enrolled in no course; run verify-course-units first.");
  console.log(`course: ${course.title ?? course.id}`);

  // What the course actually knows, so expectations follow the data instead
  // of hardcoding it.
  const unitsRes = await api(token, `/api/courses/${course.id}/units`);
  const units: Payload[] = unitsRes.json?.units ?? [];
  const actionable = units.filter((u) => u.category === "actionable").length;
  const taught = units.length - actionable;
  console.log(`knowledge: ${units.length} units (${actionable} actionable, ${taught} taught)\n`);

  const ask = async (q: string) =>
    api(token, `/api/courses/${course.id}/ask?q=${encodeURIComponent(q)}`);

  const answers: Payload[] = [];
  const expectRoute = async (q: string, want: string[], label: string) => {
    const r = await ask(q);
    answers.push(r.json);
    check(`${label} [got route=${r.json?.route}]`, r.status === 200 && want.includes(r.json?.route), r.json);
    return r.json;
  };

  console.log("--- A. lookups answer direct, at $0 ---");
  const listing = await expectRoute("any assignments?", ["direct"], '"any assignments?" is direct');
  if (actionable > 0) {
    check("the listing names real stored work", /\[1\] .+ — /.test(listing?.answer ?? ""));
    check("the listing cites sources", (listing?.sources ?? []).length > 0);
  } else {
    check("with no actionable knowledge the answer says none is recorded",
      /no assignments|nothing actionable/i.test(listing?.answer ?? ""));
  }

  console.log("\n--- B. the audience gap is named, not padded ---");
  if (actionable > 0) {
    const who = await expectRoute("Who is the assignment for?", ["direct"], "audience question is direct");
    check("the gap is named", /doesn'?t record who/i.test(who?.answer ?? ""));
  } else {
    // With nothing actionable anywhere the intent has nothing to name; the
    // model path is correct, and keyless it degrades or finds nothing.
    await expectRoute("Who is the assignment for?", ["degraded", "no_knowledge"],
      "audience question with no actionable knowledge is NOT direct");
  }

  console.log("\n--- C. synthesis never answers direct ---");
  await expectRoute("Why is this topic important for the exam?", ["degraded", "no_knowledge"],
    "a why-question refuses the direct route (keyless: degrades)");
  await expectRoute("Explain the assignment in simple terms", ["degraded", "no_knowledge"],
    "an explain-question refuses the direct route (keyless: degrades)");

  console.log("\n--- D. nothing stored, honestly said ---");
  const nk = await expectRoute("zzzqqq plumbus?", ["no_knowledge"], "an uncovered question is no_knowledge");
  check("and says so plainly", /nothing in this course/i.test(nk?.answer ?? ""));

  if (taught > 0) {
    console.log("\n--- topics listing ---");
    const topics = await expectRoute("What topics were covered?", ["direct"], "topic listing is direct");
    check("topics grouped by lecture", /: \[1\]/.test(topics?.answer ?? ""));
  }

  console.log("\n--- E. the wire contract, on every answer ---");
  check("every response carries route", answers.every((a) => typeof a?.route === "string"));
  check("every response carries meter state", answers.every((a) => a?.meter === "ok" || a?.meter === "unavailable"));
  check("NO response claims a model call on a keyless server",
    answers.every((a) => a?.route !== "model" && a?.usage === null));
  check("degraded flag agrees with route", answers.every((a) => a?.degraded === (a?.route === "degraded")));
  const meterStates = [...new Set(answers.map((a) => a?.meter))];
  console.log(`  meter state: ${meterStates.join(", ")} ` +
    (meterStates.includes("unavailable") ? "(migration 20260903100000 not applied yet -- log lines only)" : "(ask_runs rows written)"));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
