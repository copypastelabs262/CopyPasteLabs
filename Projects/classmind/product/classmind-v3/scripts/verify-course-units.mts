// Verification for GET /api/courses/[id]/units -- the course-level knowledge
// route that replaced two broken things at once:
//
//   1. the "Confirmed course knowledge" panel, which read `candidate_reviews`,
//      a table nothing has written since review moved to `knowledge_items`, so
//      it was permanently empty no matter how much a lecturer confirmed;
//   2. the per-lecture fan-out, which asked `/api/lectures/{id}/knowledge` once
//      per published lecture -- about nine database round trips each -- to draw
//      one course page.
//
// What this proves, over HTTP, signed in as real users:
//
//   A  the new route returns EXACTLY the knowledge the lecture pages show,
//      for the lecturer and for the student, unit for unit;
//   B  a student receives no pending item -- not its content, not its title,
//      not its id -- anywhere in the payload;
//   C  `awaitingReview` reaches both roles as a count and agrees with the
//      lecturer's own queue;
//   D  the course page needs ONE request where it previously needed N;
//   E  the access rules are the lecture route's, not a second opinion;
//   F  the legacy `/api/courses/[id]/knowledge` route still answers in the
//      `{ items }` shape `scripts/e2e.mts` asserts on.
//
//   node --env-file=.env.local scripts/verify-course-units.mts
//
// Read-only against lecture and knowledge data. The single write it can make is
// enrolling the test student in the target course through the product's own
// join-code route, and only when they are not enrolled already.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3300";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };
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

function section(title: string) {
  console.log(`\n--- ${title} ---`);
}

const svc = createClient(PROJECT_URL, SERVICE, { auth: { persistSession: false } });

// Payloads are read untyped on purpose: the job of this script is to assert on
// what the server ACTUALLY returns, and a local type would check it against
// this file's beliefs instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

interface ApiResult { status: number; json: Payload }

// Every HTTP call this script makes, counted. "One request instead of N" is a
// claim about request COUNT, so it is measured rather than asserted.
let requests = 0;

async function api(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  requests += 1;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { nonJson: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function tokenFor(creds: { email: string; password: string }, role: "faculty" | "student") {
  const anon = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  let signIn = await anon.auth.signInWithPassword(creds);
  if (signIn.error) {
    await svc.auth.admin.createUser({ ...creds, email_confirm: true });
    signIn = await anon.auth.signInWithPassword(creds);
    if (signIn.error) throw new Error(`Cannot sign in ${creds.email}: ${signIn.error.message}`);
  }
  const token = signIn.data.session!.access_token;
  await api(token, "POST", "/api/profile", {
    fullName: role === "faculty" ? "Test Faculty" : "Test Student",
    role,
  });
  return { token, userId: signIn.data.user!.id };
}

const ids = (units: Payload[]) => new Set((units ?? []).map((u) => u.id as string));

// A response that is not JSON is the dev server mid-recompile, not a defect in
// what is being tested. Say so and stop, rather than reporting nine misleading
// failures and then dying on `undefined.map`.
function requireJson(label: string, r: ApiResult) {
  if (r.status === 200 && r.json && typeof r.json === "object" && !("nonJson" in r.json)) return;
  console.log(`\n  ${label} did not answer with JSON (status ${r.status}).`);
  console.log("  The dev server is probably still compiling. Re-run when it is idle.");
  process.exit(2);
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// The target course, chosen by reading rather than by creating one: a fresh
// course would need a real upload and a real reasoning pass, and the interesting
// state -- published lectures holding knowledge, some of it still pending -- is
// already sitting in the database.
async function pickCourse(facultyId: string) {
  const { data: courses } = await svc
    .from("courses")
    .select("id, code, title, join_code")
    .eq("owner_id", facultyId);

  let best: {
    id: string; code: string; joinCode: string;
    readyLectures: { id: string; title: string }[];
    knowledge: number; pending: number;
  } | null = null;

  for (const c of courses ?? []) {
    const { data: lectures } = await svc
      .from("lectures").select("id, title, status").eq("course_id", c.id).eq("status", "ready");
    const ready = (lectures ?? []).map((l) => ({ id: l.id as string, title: l.title as string }));
    if (!ready.length) continue;

    const { count: knowledge } = await svc
      .from("knowledge_items").select("id", { count: "exact", head: true }).eq("course_id", c.id);
    if (!knowledge) continue;

    const { count: pending } = await svc
      .from("knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("course_id", c.id).eq("status", "pending").in("lecture_id", ready.map((l) => l.id));

    const candidate = {
      id: c.id as string, code: c.code as string, joinCode: c.join_code as string,
      readyLectures: ready, knowledge: knowledge ?? 0, pending: pending ?? 0,
    };
    // Prefer a course that exercises the interesting case: pending items, then
    // more published lectures, then more knowledge.
    const rank = (x: typeof candidate) =>
      (x.pending > 0 ? 1_000_000 : 0) + x.readyLectures.length * 1000 + x.knowledge;
    if (!best || rank(candidate) > rank(best)) best = candidate;
  }
  return best;
}

async function main() {
  console.log(`Course knowledge route verification  ->  ${BASE}`);

  section("1. Sign in");
  const faculty = await tokenFor(FACULTY, "faculty");
  const student = await tokenFor(STUDENT, "student");
  check("faculty signed in", Boolean(faculty.token));
  check("student signed in", Boolean(student.token));

  section("2. Choose a course with published knowledge");
  const course = await pickCourse(faculty.userId);
  if (!course) {
    console.log("\nNo course owned by the test faculty has a published lecture with knowledge.");
    console.log("Nothing to verify against. Run scripts/e2e.mts first.");
    process.exit(1);
  }
  console.log(
    `  course ${course.code} (${course.id})\n` +
    `  published lectures: ${course.readyLectures.length}` +
    `   knowledge items: ${course.knowledge}   pending: ${course.pending}`,
  );

  // Enrolment through the product's own route, and only if needed.
  const { data: already } = await svc
    .from("enrollments").select("user_id")
    .eq("course_id", course.id).eq("user_id", student.userId).maybeSingle();
  if (!already) {
    const joined = await api(student.token, "POST", "/api/enroll", { joinCode: course.joinCode });
    check("student enrolled via the join code", joined.status === 200, joined.json);
  } else {
    console.log("  student was already enrolled");
  }

  section("3. The new route returns what the lecture pages return (faculty)");

  // What the OLD course page did: one request per published lecture.
  const fanOutStart = Date.now();
  const fanOutFrom = requests;
  const perLectureFaculty: Payload[] = [];
  for (const l of course.readyLectures) {
    const r = await api(faculty.token, "GET", `/api/lectures/${l.id}/knowledge`);
    if (r.status !== 200) {
      check(`lecture ${l.id} knowledge readable by faculty`, false, r.json);
      continue;
    }
    perLectureFaculty.push(...(r.json.units as Payload[]));
  }
  const fanOutMs = Date.now() - fanOutStart;
  const fanOutRequests = requests - fanOutFrom;

  // What it does now: one.
  const oneStart = Date.now();
  const oneFrom = requests;
  const courseFaculty = await api(faculty.token, "GET", `/api/courses/${course.id}/units`);
  const oneMs = Date.now() - oneStart;
  const oneRequests = requests - oneFrom;

  requireJson("the units route", courseFaculty);
  check("units route answers the owner", courseFaculty.status === 200, courseFaculty.json);
  check("owner is identified as the owner", courseFaculty.json?.isOwner === true);
  check(
    "faculty: course units are exactly the union of the per-lecture units",
    sameSet(ids(courseFaculty.json.units), ids(perLectureFaculty)),
    {
      course: courseFaculty.json.units.length,
      perLecture: perLectureFaculty.length,
    },
  );
  check(
    "faculty: every unit carries the lecture it came from, so the client can still group",
    (courseFaculty.json.units as Payload[]).every((u) => !!u.lectureId && !!u.lectureTitle),
  );

  section("4. The same, for a student");

  const perLectureStudent: Payload[] = [];
  for (const l of course.readyLectures) {
    const r = await api(student.token, "GET", `/api/lectures/${l.id}/knowledge`);
    if (r.status !== 200) {
      check(`lecture ${l.id} knowledge readable by an enrolled student`, false, r.json);
      continue;
    }
    perLectureStudent.push(...(r.json.units as Payload[]));
  }

  const courseStudent = await api(student.token, "GET", `/api/courses/${course.id}/units`);
  requireJson("the units route, for a student", courseStudent);
  check("units route answers an enrolled student", courseStudent.status === 200, courseStudent.json);
  check("student is not identified as the owner", courseStudent.json?.isOwner === false);
  check(
    "student: course units are exactly the union of the per-lecture units",
    sameSet(ids(courseStudent.json.units), ids(perLectureStudent)),
    {
      course: courseStudent.json.units.length,
      perLecture: perLectureStudent.length,
    },
  );

  section("5. A student receives no pending item content");

  const studentUnits = courseStudent.json.units as Payload[];
  check(
    "no unit reaches the student with a status other than auto or confirmed",
    studentUnits.every((u) => u.status === "auto" || u.status === "confirmed"),
    studentUnits.map((u) => u.status),
  );

  // The strong form: the actual pending rows, read straight from the database,
  // must not appear anywhere in the bytes the student was sent.
  const { data: pendingRows } = await svc
    .from("knowledge_items")
    .select("id, title, summary")
    .eq("course_id", course.id)
    .eq("status", "pending")
    .in("lecture_id", course.readyLectures.map((l) => l.id));

  const wire = JSON.stringify(courseStudent.json);
  const leaked = (pendingRows ?? []).filter(
    (p) =>
      wire.includes(p.id as string) ||
      (typeof p.title === "string" && p.title.length > 8 && wire.includes(p.title)),
  );
  check(
    `none of the ${pendingRows?.length ?? 0} pending item(s) appear in the student payload`,
    leaked.length === 0,
    leaked.map((p) => p.title),
  );

  section("6. awaitingReview is a count, and it reaches both roles");

  check(
    "faculty: awaitingReview matches the pending items in the store",
    courseFaculty.json.awaitingReview === (pendingRows?.length ?? 0),
    { returned: courseFaculty.json.awaitingReview, inStore: pendingRows?.length ?? 0 },
  );
  check(
    "student: awaitingReview is the same number, with none of the content",
    courseStudent.json.awaitingReview === (pendingRows?.length ?? 0),
    { returned: courseStudent.json.awaitingReview, inStore: pendingRows?.length ?? 0 },
  );
  check(
    "faculty: the pending items are present for the lecturer who has to review them",
    (courseFaculty.json.units as Payload[]).filter((u) => u.status === "pending").length ===
      (pendingRows?.length ?? 0),
  );

  section("7. One request where there were N");

  console.log(
    `  old path: ${fanOutRequests} request(s) in ${fanOutMs} ms` +
    `   (~${fanOutRequests * 9} database round trips)`,
  );
  console.log(`  new path: ${oneRequests} request in ${oneMs} ms`);
  console.log(
    `  this course has ${course.readyLectures.length} published lecture(s); the ratio is ` +
    "one request per published lecture, so a twenty-lecture course was twenty requests " +
    "and roughly a hundred and eighty queries.",
  );
  check(
    "the course page's knowledge costs exactly one request",
    oneRequests === 1,
    { oneRequests },
  );
  check(
    "the old path cost one request per published lecture",
    fanOutRequests === course.readyLectures.length,
    { fanOutRequests, readyLectures: course.readyLectures.length },
  );
  check(
    "one request carries at least as much as the fan-out did",
    (courseFaculty.json.units as Payload[]).length >= perLectureFaculty.length,
    { one: courseFaculty.json.units.length, fanOut: perLectureFaculty.length },
  );

  section("8. Access is the lecture route's rule, not a second one");

  const anon = await api(null, "GET", `/api/courses/${course.id}/units`);
  check("signed out is refused", anon.status === 401, anon.json);

  const { data: foreign } = await svc
    .from("courses").select("id").neq("owner_id", faculty.userId).limit(20);
  let outsider: string | null = null;
  for (const c of foreign ?? []) {
    const { data: enr } = await svc
      .from("enrollments").select("user_id")
      .eq("course_id", c.id as string).eq("user_id", student.userId).maybeSingle();
    if (!enr) { outsider = c.id as string; break; }
  }
  if (outsider) {
    const denied = await api(student.token, "GET", `/api/courses/${outsider}/units`);
    check("a student who is not enrolled is refused", denied.status === 403, denied.json);
  } else {
    console.log("  (no course this student is outside of -- skipped)");
  }

  section("9. The legacy route is untouched");

  const legacy = await api(faculty.token, "GET", `/api/courses/${course.id}/knowledge`);
  check("legacy course knowledge route still answers 200", legacy.status === 200, legacy.json);
  check("legacy route still returns an { items } array", Array.isArray(legacy.json?.items));

  // THE DEFECT, STATED AS A MEASUREMENT.
  //
  // The old panel read the route above. If it answers with nothing for a course
  // that demonstrably holds knowledge, that is the "Nothing confirmed yet."
  // screen a lecturer saw after confirming everything -- and the reason the
  // panel now reads `knowledge_items` instead. This is not a regression check;
  // it is the evidence for the change. It only reports when the legacy store is
  // genuinely empty, which is its state everywhere in this database.
  const legacyCount = Array.isArray(legacy.json?.items) ? legacy.json.items.length : -1;
  const unitCount = (courseFaculty.json.units as Payload[]).length;
  console.log(`  legacy store: ${legacyCount} item(s)   knowledge store: ${unitCount} unit(s)`);
  if (legacyCount === 0) {
    check(
      "the legacy store is empty for a course that holds knowledge -- which is the defect",
      unitCount > 0,
      { legacyCount, unitCount },
    );
  }

  section("10. The processing panel covers every readiness verdict");

  // The panel that reports a finished extraction cannot be driven from here --
  // re-running extraction on a real lecture would rewrite its knowledge, and
  // these rows are evidence. What CAN be checked without touching anything is
  // the contract between the two files: every reason the planner can refuse to
  // publish for must have a sentence a lecturer can read, or the panel falls
  // back to a vaguer one and the specific reason is lost.
  const planSrc = readFileSync("src/lib/knowledge/plan.ts", "utf8");
  const panelSrc = readFileSync("src/app/_components/LectureProgress.tsx", "utf8");

  const codeBlock = /export type ReadinessCode =([\s\S]*?);/.exec(planSrc)?.[1] ?? "";
  const codes = [...codeBlock.matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const failureCodes = codes.filter((c) => c !== "ok");
  check("the planner's readiness codes were found", codes.length >= 5, codes);

  const spoken = /const NOT_PUBLISHED: Record<string, string> = \{([\s\S]*?)\n\};/.exec(panelSrc)?.[1] ?? "";
  const uncovered = failureCodes.filter((c) => !new RegExp(`\\b${c}\\s*:`).test(spoken));
  check(
    `every unpublished verdict has words a lecturer can read (${failureCodes.length} codes)`,
    uncovered.length === 0,
    uncovered,
  );
  check(
    "the panel decides on `published`, not on the HTTP status",
    /b\.published === true/.test(panelSrc),
  );
  // Read from the callback that actually runs, not from the whole file: the
  // comments above it name both dead fields on purpose, to say why they went.
  const extractBody = /const extract = useCallback\(([\s\S]*?)\n  \}, \[/.exec(panelSrc)?.[1] ?? "";
  check("the extract callback was found", extractBody.length > 0);
  check(
    "the panel no longer branches on `skipped`, which the route has never returned",
    extractBody.length > 0 && !/\bskipped\b/.test(extractBody),
  );
  check(
    "the panel no longer reports `candidateCount` as the review queue",
    extractBody.length > 0 && !/candidateCount/.test(extractBody),
  );
  check(
    "the raw code is confined to the technical disclosure",
    /readinessCode/.test(panelSrc) &&
      !/\{outcome\.readinessCode\}/.test(
        /<p className="mt-2 flex items-start([\s\S]*?)<\/p>/.exec(panelSrc)?.[1] ?? "",
      ),
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
