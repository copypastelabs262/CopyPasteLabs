// AUTHENTICATED RED TEAM — the boundaries no unauthenticated probe can reach.
//
//   npm run redteam:auth          (requires a local server; see below)
//
// The 2026-09-07 audit verified the perimeter (every route refuses an anonymous
// caller) and then had to mark every AUTHENTICATED boundary UNVERIFIED, because
// signing in was assumed to need Google OAuth and therefore a human. It does
// not: the product also accepts email/password through Supabase, and the
// service-role key can mint a throwaway account. Every scripts/verify-*.mts in
// this repo already does exactly that. This closes the gap.
//
// WHAT THIS COSTS: nothing, and that is enforced structurally rather than
// promised. Start the server with the provider keys BLANK:
//
//   GEMINI_API_KEY= SARVAM_API_KEY= npx next start -p 3599
//
// `readEnv` treats an empty string as unset, so `reasoningAvailable()` is false
// and `answerFromKnowledge` returns route:"degraded" WITHOUT constructing a
// provider or making a request (src/lib/knowledge/answer.ts:315-319). A test
// below asserts that, so a future change that starts spending fails here loudly.
// Nothing in this file touches Sarvam, and no transcription is ever submitted.
//
// THE ACCOUNTS: four throwaway users created through the real API, with a random
// password that is generated per run and never printed, and deleted in a
// `finally` whether the run passes or fails. Everything they own cascades with
// them (courses.owner_id -> auth.users ON DELETE CASCADE). Same pattern, and the
// same reasoning, as scripts/verify-auth-roles.mts.
//
// THE SHAPE OF EVERY TEST: the interesting assertions are the ones that must
// FAIL. A positive control runs first for each surface, because a red team that
// only shows refusals cannot tell "correctly refused" from "the id was wrong".

import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3599";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FACULTY_CODE = process.env.FACULTY_ACCESS_CODE;

if (!URL_ || !ANON || !SERVICE) {
  console.error(
    "Missing Supabase configuration.\n" +
      "Run with: node --env-file=.env.local scripts/redteam-authenticated.mts",
  );
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = () => createClient(URL_, ANON, { auth: { persistSession: false } });

// Random per run, never printed. These accounts exist for seconds; a literal
// here would be a usable credential for that window and would end up in a log.
const PASSWORD = `Cm!${randomBytes(18).toString("base64url")}`;
const STAMP = Date.now().toString(36);
const createdUserIds: string[] = [];
const seededObjects: string[] = [];

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 400)}`);
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

interface Res {
  status: number;
  json: Record<string, unknown>;
  text: string;
}

async function api(
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
): Promise<Res> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { Accept: "*/*" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* non-JSON is fine; status is what most assertions read */
  }
  return { status: res.status, json, text };
}

/** A refusal is 401/403/404/409/429 — never 200, and never a 500 (which would
 *  mean the request reached logic it should not have and crashed there). */
function refused(r: Res): boolean {
  return [401, 403, 404, 409, 413, 429].includes(r.status);
}

async function createUser(tag: string): Promise<{ id: string; email: string; token: string }> {
  const email = `cm-redteam-${STAMP}-${tag}@classmind.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`create ${tag}: ${error?.message}`);
  createdUserIds.push(data.user.id);
  const { data: s, error: se } = await anon().auth.signInWithPassword({ email, password: PASSWORD });
  if (se || !s.session) throw new Error(`sign-in ${tag}: ${se?.message}`);
  return { id: data.user.id, email, token: s.session.access_token };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

try {
  section("SETUP — four accounts through the real API");

  const facA = await createUser("facA");
  const facB = await createUser("facB");
  const stuA = await createUser("stuA");
  const stuB = await createUser("stuB");

  // Roles through the real endpoint, so the faculty gate is exercised, not
  // bypassed. If FACULTY_ACCESS_CODE is unset the gate refuses by design and
  // the faculty half of this run cannot proceed -- said out loud rather than
  // worked around.
  const facultyGateUsable = typeof FACULTY_CODE === "string" && FACULTY_CODE.length > 0;

  const mkFaculty = async (u: { token: string }, name: string) =>
    api("/api/profile", u.token, {
      body: { fullName: name, role: "faculty", facultyCode: FACULTY_CODE },
    });

  const wrongCode = await api("/api/profile", facA.token, {
    body: { fullName: "Faculty A", role: "faculty", facultyCode: "definitely-not-the-code" },
  });
  check(
    wrongCode.status === 403,
    "faculty gate: a wrong faculty code is refused (403)",
    wrongCode.status,
  );
  check(
    !JSON.stringify(wrongCode.json).includes(String(FACULTY_CODE)),
    "faculty gate: the refusal does not echo the real code",
  );

  const noCode = await api("/api/profile", facB.token, {
    body: { fullName: "Faculty B", role: "faculty" },
  });
  check(noCode.status === 403, "faculty gate: role=faculty with NO code is refused", noCode.status);

  if (!facultyGateUsable) {
    console.log("\nFACULTY_ACCESS_CODE is not set; faculty scenarios cannot be seeded.");
    throw new Error("faculty code unavailable");
  }

  const fa = await mkFaculty(facA, "Faculty A");
  const fb = await mkFaculty(facB, "Faculty B");
  check(fa.status === 200 && fa.json.role === "faculty", "faculty A created with the real code", fa.json);
  check(fb.status === 200 && fb.json.role === "faculty", "faculty B created with the real code", fb.json);

  const sa = await api("/api/profile", stuA.token, { body: { fullName: "Student A", role: "student" } });
  const sb = await api("/api/profile", stuB.token, { body: { fullName: "Student B", role: "student" } });
  check(sa.status === 200 && sa.json.role === "student", "student A created", sa.json);
  check(sb.status === 200 && sb.json.role === "student", "student B created", sb.json);

  // Role immutability, through the real endpoint.
  const flip = await api("/api/profile", stuA.token, {
    body: { fullName: "Student A", role: "faculty", facultyCode: FACULTY_CODE },
  });
  check(
    flip.status === 409,
    "a student cannot upgrade to faculty even WITH the correct code (409)",
    { status: flip.status, body: flip.json },
  );
  const stuARole = await admin.from("profiles").select("role").eq("id", stuA.id).maybeSingle();
  check(stuARole.data?.role === "student", "student A's role is unchanged in the database", stuARole.data);

  section("SETUP — two courses, seeded lectures and knowledge");

  const mkCourse = async (u: { token: string }, code: string) =>
    api("/api/courses", u.token, {
      body: { code, title: `Security Audit ${code}`, term: "AUDIT", transcriptionLanguage: "en-IN" },
    });

  const cA = await mkCourse(facA, `SECAUDIT-A-${STAMP}`);
  const cB = await mkCourse(facB, `SECAUDIT-B-${STAMP}`);
  check(cA.status === 200, "faculty A created course A", cA.json);
  check(cB.status === 200, "faculty B created course B", cB.json);
  const courseA = (cA.json.course as Record<string, unknown>) ?? {};
  const courseB = (cB.json.course as Record<string, unknown>) ?? {};
  const courseAId = courseA.id as string;
  const courseBId = courseB.id as string;
  const joinA = courseA.join_code as string;
  const joinB = courseB.join_code as string;

  // Lectures + knowledge are seeded directly: creating them through the API
  // requires uploading bytes to Storage, and the object is not what these tests
  // are about. Provenance is written so the replay gate PASSES -- otherwise the
  // positive controls below would be indistinguishable from a working refusal.
  const seedLecture = async (courseId: string, tag: string) => {
    const id = randomUUID();
    const { error } = await admin.from("lectures").insert({
      id,
      course_id: courseId,
      title: `Audit lecture ${tag}`,
      status: "ready",
      original_filename: `audit-${tag}.mp3`,
      storage_path: `${id}/original.mp3`,
      file_size_bytes: 1024,
      content_type: "audio/mpeg",
      checksum_sha256: sha256(`audit-${tag}`),
      provider_job_id: `audit-${STAMP}-${tag}`,
      raw_transcription_response: { transcript: `Audit transcript ${tag}.` },
      // VERIFIABLE_LIVE_ENGINES is an exact-match allowlist of ["sarvam"]
      // (src/lib/provenance/replay.ts:42). "sarvam:saaras" is NOT equal to it and
      // the gate correctly judges such a lecture unverifiable and hides it from
      // students -- which is the fail-closed clause working, not a bug. The seed
      // has to name a recognised engine for the positive control to mean anything.
      provenance: { engine: "sarvam", decodingParams: { replayed: false }, limitations: [] },
    });
    if (error) throw new Error(`seed lecture ${tag}: ${error.message}`);
    // A real object behind the row, so the signed-URL assertions below test
    // Storage rather than testing that a missing object has no URL. Tiny, and it
    // dies with the lecture at cleanup.
    const bytes = Buffer.from(`audit-audio-${tag}-${STAMP}`);
    const up = await admin.storage
      .from("lectures")
      .upload(`${id}/original.mp3`, bytes, { contentType: "audio/mpeg", upsert: true });
    if (up.error) throw new Error(`seed object ${tag}: ${up.error.message}`);
    seededObjects.push(`${id}/original.mp3`);
    return id;
  };

  const seedKnowledge = async (courseId: string, lectureId: string, tag: string) => {
    const id = randomUUID();
    const { error } = await admin.from("knowledge_items").insert({
      id,
      lecture_id: lectureId,
      course_id: courseId,
      category: "teaching",
      kind: "topic",
      title: `Audit topic ${tag}`,
      summary: `A seeded teaching item for ${tag}.`,
      steps: [],
      unspecified: [],
      status: "auto",
      // NOT NULL with no default -- these record which reasoner produced the
      // item, and a seeded row has to say it was seeded.
      reconstruction_method: "audit-seed",
      reconstruction_version: "1.0.0",
    });
    if (error) throw new Error(`seed knowledge ${tag}: ${error.message}`);
    return id;
  };

  const lecA = await seedLecture(courseAId, "A");
  const lecB = await seedLecture(courseBId, "B");
  const knowA = await seedKnowledge(courseAId, lecA, "A");
  const knowB = await seedKnowledge(courseBId, lecB, "B");

  // A pending actionable item in course B: the thing a student must never see.
  const pendingB = randomUUID();
  await admin.from("knowledge_items").insert({
    id: pendingB,
    lecture_id: lecB,
    course_id: courseBId,
    category: "actionable",
    kind: "assignment",
    title: "UNREVIEWED assignment in course B",
    summary: "Pending a lecturer verdict; no student may see this.",
    steps: [],
    unspecified: [],
    status: "pending",
    reconstruction_method: "audit-seed",
    reconstruction_version: "1.0.0",
  });

  const enrolA = await api("/api/enroll", stuA.token, { body: { joinCode: joinA } });
  check(enrolA.status === 200, "student A enrolled in course A with its join code", enrolA.json);
  const enrolB = await api("/api/enroll", stuB.token, { body: { joinCode: joinB } });
  check(enrolB.status === 200, "student B enrolled in course B", enrolB.json);

  section("POSITIVE CONTROLS — the harness can actually see things");

  const ownCourse = await api(`/api/courses/${courseAId}`, stuA.token);
  check(ownCourse.status === 200, "student A CAN read their own course", ownCourse.status);
  check(
    ((ownCourse.json.course as Record<string, unknown>) ?? {}).join_code === undefined,
    "...but the join code is stripped for a non-owner",
    (ownCourse.json.course as Record<string, unknown>)?.join_code,
  );

  const ownLecture = await api(`/api/lectures/${lecA}`, stuA.token);
  check(ownLecture.status === 200, "student A CAN read their own course's published lecture", ownLecture.status);
  check(
    ownLecture.json.isOwner === false && (ownLecture.json.candidates as unknown[])?.length === 0,
    "...as a non-owner, with zero extraction candidates",
    { isOwner: ownLecture.json.isOwner, candidates: (ownLecture.json.candidates as unknown[])?.length },
  );
  check(
    ownLecture.json.rawTranscriptionResponse === null,
    "...and no raw provider response",
    ownLecture.json.rawTranscriptionResponse,
  );

  const ownUnits = await api(`/api/courses/${courseAId}/units`, stuA.token);
  check(ownUnits.status === 200, "student A CAN read their own course's knowledge", ownUnits.status);

  const facOwn = await api(`/api/lectures/${lecA}`, facA.token);
  check(
    facOwn.status === 200 && facOwn.json.isOwner === true,
    "faculty A reads their own lecture AS OWNER",
    { status: facOwn.status, isOwner: facOwn.json.isOwner },
  );

  section("CROSS-USER ISOLATION — student A against course B (every route, every method)");

  const crossReads: Array<[string, string]> = [
    [`/api/courses/${courseBId}`, "course B detail"],
    [`/api/courses/${courseBId}/units`, "course B knowledge units"],
    [`/api/courses/${courseBId}/knowledge`, "course B knowledge (legacy)"],
    [`/api/courses/${courseBId}/conversations`, "course B conversations"],
    [`/api/lectures/${lecB}`, "course B lecture"],
    [`/api/lectures/${lecB}/knowledge`, "course B lecture knowledge"],
  ];
  for (const [path, what] of crossReads) {
    const r = await api(path, stuA.token);
    check(refused(r), `student A is refused ${what}`, { status: r.status, body: r.text.slice(0, 160) });
    check(
      !r.text.includes("UNREVIEWED assignment") && !r.text.includes("Audit topic B"),
      `...and no course B content appears in the body of ${what}`,
    );
  }

  // Writes and destructive verbs against another course's resources.
  const crossWrites: Array<[string, string, string, unknown]> = [
    [`/api/courses/${courseBId}/context`, "POST", "add context to course B", { kind: "note", title: "x", body: "y" }],
    [`/api/courses/${courseBId}/lectures`, "POST", "create a lecture in course B", {
      title: "x", originalFilename: "x.mp3", fileSizeBytes: 10, contentType: "audio/mpeg",
      checksumSha256: sha256("x"),
    }],
    [`/api/lectures/${lecB}`, "DELETE", "delete course B's lecture", undefined],
    [`/api/lectures/${lecB}/extract`, "POST", "extract course B's lecture", {}],
    [`/api/lectures/${lecB}/transcribe`, "POST", "transcribe course B's lecture", {}],
    [`/api/lectures/${lecB}/poll`, "POST", "poll course B's lecture", {}],
    [`/api/knowledge/${knowB}/review`, "POST", "rule on course B's knowledge", { action: "confirm" }],
  ];
  for (const [path, method, what, body] of crossWrites) {
    const r = await api(path, stuA.token, { method, body });
    check(refused(r), `student A is refused: ${what}`, { status: r.status, body: r.text.slice(0, 160) });
  }

  section("PRIVILEGE ESCALATION — student A reaching for faculty capability");

  const mkCourseAsStudent = await api("/api/courses", stuA.token, {
    body: { code: `EVIL-${STAMP}`, title: "Should never exist", transcriptionLanguage: "en-IN" },
  });
  check(
    mkCourseAsStudent.status === 403,
    "a student CANNOT create a course (the 2026-09-07 critical, retested)",
    { status: mkCourseAsStudent.status, body: mkCourseAsStudent.json },
  );
  const leaked = await admin.from("courses").select("id").eq("code", `EVIL-${STAMP}`);
  check((leaked.data ?? []).length === 0, "...and no course row was created", leaked.data);

  // Own course, own lecture -- but as a student, on faculty-only verbs.
  const ownCourseFacultyVerbs: Array<[string, string, string, unknown]> = [
    [`/api/courses/${courseAId}/context`, "POST", "add context to a course they are ENROLLED in", { kind: "note", title: "x", body: "y" }],
    [`/api/courses/${courseAId}/lectures`, "POST", "upload into a course they are enrolled in", {
      title: "x", originalFilename: "x.mp3", fileSizeBytes: 10, contentType: "audio/mpeg",
      checksumSha256: sha256("x"),
    }],
    [`/api/lectures/${lecA}`, "DELETE", "delete a lecture in their own course", undefined],
    [`/api/lectures/${lecA}/extract`, "POST", "extract in their own course", {}],
    [`/api/lectures/${lecA}/transcribe`, "POST", "transcribe in their own course", {}],
    [`/api/knowledge/${knowA}/review`, "POST", "rule on knowledge in their own course", { action: "confirm" }],
  ];
  for (const [path, method, what, body] of ownCourseFacultyVerbs) {
    const r = await api(path, stuA.token, { method, body });
    check(refused(r), `student A is refused: ${what}`, { status: r.status, body: r.text.slice(0, 160) });
  }

  // Role/ownership forgery in the body.
  const forge = await api("/api/profile", stuA.token, {
    body: { fullName: "Student A", role: "faculty", facultyCode: FACULTY_CODE, id: facA.id },
  });
  check(forge.status === 409, "a body-supplied id cannot re-target the profile write", forge.status);
  const facARole = await admin.from("profiles").select("full_name, role").eq("id", facA.id).maybeSingle();
  check(
    facARole.data?.role === "faculty" && facARole.data?.full_name === "Faculty A",
    "...faculty A's profile is untouched",
    facARole.data,
  );

  // The enrollments table has its own `role` column with a 'faculty' value.
  // Enrolling cannot be used to claim it.
  await api("/api/enroll", stuA.token, { body: { joinCode: joinA, role: "faculty" } });
  const enrolRow = await admin
    .from("enrollments")
    .select("role")
    .eq("course_id", courseAId)
    .eq("user_id", stuA.id)
    .maybeSingle();
  check(
    enrolRow.data?.role === "student",
    "enrolling with role:'faculty' in the body does not grant it",
    enrolRow.data,
  );
  const stillRefused = await api(`/api/courses/${courseAId}/context`, stuA.token, {
    body: { kind: "note", title: "x", body: "y" },
  });
  check(refused(stillRefused), "...and enrollments.role is not read as authority anywhere", stillRefused.status);

  section("FACULTY -> FACULTY — ownership is not the same as being faculty");

  const facCross: Array<[string, string, string, unknown]> = [
    [`/api/courses/${courseBId}`, "GET", "read faculty B's course", undefined],
    [`/api/courses/${courseBId}/context`, "POST", "write context into faculty B's course", { kind: "note", title: "x", body: "y" }],
    [`/api/lectures/${lecB}`, "GET", "read faculty B's lecture", undefined],
    [`/api/lectures/${lecB}`, "DELETE", "delete faculty B's lecture", undefined],
    [`/api/lectures/${lecB}/extract`, "POST", "extract faculty B's lecture", {}],
    [`/api/knowledge/${knowB}/review`, "POST", "rule on faculty B's knowledge", { action: "confirm" }],
  ];
  for (const [path, method, what, body] of facCross) {
    const r = await api(path, facA.token, { method, body });
    check(refused(r), `faculty A is refused: ${what}`, { status: r.status, body: r.text.slice(0, 160) });
  }
  const lecBStill = await admin.from("lectures").select("id").eq("id", lecB).maybeSingle();
  check(!!lecBStill.data, "...faculty B's lecture still exists after the delete attempts");

  section("CONVERSATION OWNERSHIP");

  // Student A creates a real conversation. Ask is keyless here, so this is the
  // degraded ($0) route -- which is also the assertion below.
  const askA = await api(`/api/courses/${courseAId}/ask`, stuA.token, {
    body: { question: "What was taught in this course?", persist: true },
  });
  check(askA.status === 200, "student A can ask in their own course", askA.status);
  check(
    askA.json.route === "degraded" || askA.json.route === "direct" || askA.json.route === "no_knowledge",
    "ZERO SPEND: with no provider key the ask never reaches a paid route",
    { route: askA.json.route, usage: askA.json.usage },
  );
  check(askA.json.usage === null, "...and reports no token usage", askA.json.usage);

  const convId = ((askA.json.conversation as Record<string, unknown>) ?? {}).id as string | null;
  if (convId) {
    const own = await api(`/api/conversations/${convId}`, stuA.token);
    check(own.status === 200, "student A can read their own conversation", own.status);

    const stolen = await api(`/api/conversations/${convId}`, stuB.token);
    check(stolen.status === 404, "student B is refused student A's conversation (404, not 403)", stolen.status);
    check(
      !stolen.text.includes("What was taught"),
      "...and none of its content leaks in the refusal body",
    );

    const stolenDelete = await api(`/api/conversations/${convId}`, stuB.token, { method: "DELETE" });
    check(stolenDelete.status === 404, "student B cannot delete student A's conversation", stolenDelete.status);
    const survives = await api(`/api/conversations/${convId}`, stuA.token);
    check(survives.status === 200, "...and it still exists for its owner", survives.status);

    // Continue someone else's thread through the ask route.
    const hijack = await api(`/api/courses/${courseAId}/ask`, stuB.token, {
      body: { question: "continue", conversationId: convId },
    });
    check(refused(hijack), "student B cannot continue student A's thread via /ask", hijack.status);

    // Scope confusion: a course thread presented to the global surface.
    const scopeJump = await api("/api/ask", stuA.token, {
      body: { question: "continue", conversationId: convId },
    });
    check(scopeJump.status === 404, "a COURSE thread cannot be continued on the GLOBAL surface", scopeJump.status);
  } else {
    check(false, "conversation was not created; ownership tests skipped", askA.json);
  }

  section("AI AUTHORIZATION — refusal happens before any provider path");

  const askOther = await api(`/api/courses/${courseBId}/ask`, stuA.token, {
    body: { question: "What is the unreviewed assignment?" },
  });
  check(refused(askOther), "student A cannot ask against course B", askOther.status);

  const askOtherGet = await api(
    `/api/courses/${courseBId}/ask?q=${encodeURIComponent("what is due")}`,
    stuA.token,
  );
  check(refused(askOtherGet), "...nor via the GET form of the same route", askOtherGet.status);

  const askForeignLecture = await api(`/api/courses/${courseAId}/ask`, stuA.token, {
    body: { question: "summarise", lectureId: lecB },
  });
  check(
    askForeignLecture.status === 404,
    "a lecture id from another course is refused inside an authorised course ask",
    askForeignLecture.status,
  );

  // The global surface must contain only what this student can reach.
  const globalAsk = await api("/api/ask", stuA.token, { body: { question: "what is due" } });
  check(globalAsk.status === 200, "student A can use the global ask", globalAsk.status);
  check(
    !globalAsk.text.includes("Audit topic B") && !globalAsk.text.includes("UNREVIEWED assignment"),
    "GLOBAL ask corpus contains nothing from a course the student is not in",
  );
  check(globalAsk.json.usage === null, "...and it spent nothing", globalAsk.json.usage);

  // A student must never see a pending actionable item, even in their OWN course.
  const pendingA = randomUUID();
  await admin.from("knowledge_items").insert({
    id: pendingA, lecture_id: lecA, course_id: courseAId,
    category: "actionable", kind: "assignment",
    title: "UNREVIEWED assignment in course A",
    summary: "Pending a verdict.", steps: [], unspecified: [], status: "pending",
    reconstruction_method: "audit-seed", reconstruction_version: "1.0.0",
  });
  const unitsA = await api(`/api/courses/${courseAId}/units`, stuA.token);
  check(
    !unitsA.text.includes("UNREVIEWED assignment in course A"),
    "a PENDING actionable item is withheld from a student in their own course",
  );
  const unitsFac = await api(`/api/courses/${courseAId}/units`, facA.token);
  check(
    unitsFac.text.includes("UNREVIEWED assignment in course A"),
    "...but the lecturer who must rule on it does see it",
  );

  section("THE TWO NEGATIVES THE FIXES CLAIM — seeded, not assumed");

  // (1) A STUDENT-ROLE ACCOUNT THAT OWNS A COURSE.
  //
  // Only reachable as a leftover of the pre-fix POST /api/courses hole, so it
  // has to be seeded directly. The first version of the fix downgraded isOwner
  // to isFaculty but LEFT the course in listCourseMemberships, so the global
  // ask corpus still read it while every per-course route refused it. Seeding
  // the state is the only way to tell the two versions apart.
  {
    const orphanCourse = randomUUID();
    await admin.from("courses").insert({
      id: orphanCourse,
      owner_id: stuB.id, // a STUDENT who owns a course
      code: `SECAUDIT-ORPHAN-${STAMP}`,
      title: "Leftover course owned by a student-role account",
      transcription_language: "en-IN",
    });
    const orphanLecture = await seedLecture(orphanCourse, "ORPHAN");
    await seedKnowledge(orphanCourse, orphanLecture, "ORPHAN");

    const perCourse = await api(`/api/courses/${orphanCourse}`, stuB.token);
    check(refused(perCourse), "a student-role OWNER is refused their own course by the course route", perCourse.status);

    const overview = await api("/api/me/overview", stuB.token);
    check(
      !overview.text.includes(`SECAUDIT-ORPHAN-${STAMP}`),
      "...the overview does not list it",
    );

    const listed = await api("/api/courses", stuB.token);
    check(
      !listed.text.includes(`SECAUDIT-ORPHAN-${STAMP}`),
      "...the course list does not return it (nor its join code)",
    );

    const globalAskB = await api("/api/ask", stuB.token, { body: { question: "what is due" } });
    check(
      !globalAskB.text.includes("Audit topic ORPHAN"),
      "...and the GLOBAL ask corpus does not read it either (the invariant the routes claim)",
    );
  }

  // (2) A LEAF WHOSE course_id DISAGREES WITH ITS LECTURE'S.
  //
  // Impossible through the product today -- one writer sets both columns from
  // the lecture -- which is exactly why it is worth seeding: the review routes
  // used to authorize against the leaf's OWN course_id, so a row like this made
  // the ownership check evaluate against the attacker's course and pass.
  {
    const liar = randomUUID();
    await admin.from("knowledge_items").insert({
      id: liar,
      lecture_id: lecB, // lecture lives in faculty B's course
      course_id: courseAId, // but the row claims faculty A's course
      category: "actionable",
      kind: "assignment",
      title: "Row whose course_id lies about its lecture",
      summary: "Seeded to prove the review route resolves through the lecture.",
      steps: [],
      unspecified: [],
      status: "pending",
      reconstruction_method: "audit-seed",
      reconstruction_version: "1.0.0",
    });

    const ruled = await api(`/api/knowledge/${liar}/review`, facA.token, { body: { action: "confirm" } });
    check(
      refused(ruled),
      "faculty A cannot rule on a row that CLAIMS their course but belongs to faculty B's lecture",
      { status: ruled.status, body: ruled.text.slice(0, 160) },
    );
    const after = await admin.from("knowledge_items").select("status").eq("id", liar).maybeSingle();
    check(after.data?.status === "pending", "...and its status is unchanged", after.data);
    await admin.from("knowledge_items").delete().eq("id", liar);
  }

  section("SPEND CONTROLS — enforced server-side, per account");

  // The burst limit is 3/min on extract. Faculty A owns lecture A, so these are
  // authorised requests: the limiter is the only thing that can stop them.
  const extractCodes: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const r = await api(`/api/lectures/${lecA}/extract`, facA.token, { body: {} });
    extractCodes.push(r.status);
  }
  check(
    extractCodes.includes(429),
    "repeated extract from ONE account hits the rate limit (429)",
    extractCodes,
  );
  check(
    !extractCodes.includes(200) || extractCodes.filter((c) => c === 200).length <= 3,
    "...and at most the burst budget ever succeeded",
    extractCodes,
  );

  // ?force=1 must not be a way around it.
  const forced = await api(`/api/lectures/${lecA}/extract?force=1`, facA.token, { body: {} });
  check(
    forced.status === 429 || refused(forced),
    "?force=1 does not bypass the rate limit",
    forced.status,
  );

  // Concurrency: the single-flight claim must stop simultaneous paid runs.
  const burst = await Promise.all(
    [0, 1, 2, 3, 4].map(() => api(`/api/lectures/${lecA}/extract`, facA.token, { body: {} })),
  );
  const codes = burst.map((r) => r.status);
  check(
    codes.filter((c) => c === 200).length <= 1,
    "concurrent extracts of one lecture: at most one proceeds",
    codes,
  );

  // Changing the id must not reset the per-user budget.
  const lecA2 = await seedLecture(courseAId, "A2");
  const otherLecture = await api(`/api/lectures/${lecA2}/extract`, facA.token, { body: {} });
  check(
    otherLecture.status === 429,
    "the budget is PER ACCOUNT: a different lecture id does not reset it",
    otherLecture.status,
  );

  // A second account has its own budget (correct), which is the documented
  // multi-account limitation -- asserted so the doc and the code agree.
  const facBExtract = await api(`/api/lectures/${lecB}/extract`, facB.token, { body: {} });
  check(
    facBExtract.status !== 429,
    "a DIFFERENT account has its own budget (documented multi-account limitation)",
    facBExtract.status,
  );

  section("STORAGE AUTHORIZATION");

  const bucket = await admin.storage.listBuckets();
  const lectures = (bucket.data ?? []).find((b) => b.name === "lectures");
  check(lectures?.public === false, "the lectures bucket is private", { public: lectures?.public });

  const facAudio = await api(`/api/lectures/${lecA}`, facA.token);
  const ownerUrl = facAudio.json.audioUrl as string | null;
  check(typeof ownerUrl === "string" && ownerUrl.length > 0, "the owner receives a signed audio URL", ownerUrl);

  if (ownerUrl) {
    const signed = await fetch(ownerUrl);
    check(signed.status === 200, "...and that signed URL actually fetches the object", signed.status);

    // The same object without the signature. A private bucket must refuse.
    const unsigned = ownerUrl.split("?")[0];
    const bare = await fetch(unsigned);
    check(bare.status >= 400, "the SAME object without its signature is refused", bare.status);

    // A tampered signature must not work either.
    const tampered = `${unsigned}?token=${"a".repeat(40)}`;
    const bad = await fetch(tampered);
    check(bad.status >= 400, "a forged signature is refused", bad.status);

    // Course B's object path, signed for nobody: guessing the path is not access.
    const guessed = unsigned.replace(lecA, lecB);
    const cross = await fetch(guessed);
    check(cross.status >= 400, "another lecture's object path is not reachable unsigned", cross.status);
  }

  const crossAudio = await api(`/api/lectures/${lecB}`, stuA.token);
  check(refused(crossAudio), "a student gets no payload at all for another course's lecture", crossAudio.status);
  check(
    !crossAudio.text.includes("token=") && !crossAudio.text.includes("sign/"),
    "...and therefore no signed URL for it",
  );

  // A server-generated object path: the client's filename must not shape it.
  const traversal = await api(`/api/courses/${courseAId}/lectures`, facA.token, {
    body: {
      title: "traversal",
      originalFilename: `x.mp3/../../${lecB}/original.mp3`,
      fileSizeBytes: 10,
      contentType: "audio/mpeg",
      checksumSha256: sha256("t"),
    },
  });
  if (traversal.status === 200) {
    const path = traversal.json.path as string;
    check(
      /^[0-9a-f-]{36}\/original\.(mp3|bin)$/.test(path),
      "an uploader filename cannot shape the storage object key",
      path,
    );
    check(!path.includes(".."), "...no traversal segment survives", path);
    check(!path.includes(lecB), "...and it cannot be aimed at another lecture", path);
  } else {
    check(refused(traversal), "traversal upload refused outright", traversal.status);
  }

  section("LIVE DATABASE — RLS as the anon key and as a real user JWT");

  // This is the claim the whole architecture rests on: RLS is enabled with zero
  // policies, so a token that is not the service role can read nothing directly
  // through PostgREST, whatever the application does.
  const asAnon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const asUser = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${stuA.token}` } },
  });

  const tables = [
    "profiles", "courses", "enrollments", "course_context", "lectures",
    "extraction_candidates", "candidate_reviews", "knowledge_items",
    "knowledge_evidence", "processing_runs", "ask_runs", "conversations",
    "conversation_messages", "provider_audio_identities",
    "reconstruction_jobs", "reconstruction_windows",
  ];
  for (const t of tables) {
    const a = await asAnon.from(t).select("*").limit(1);
    check(
      (a.data ?? []).length === 0,
      `anon key reads nothing from ${t}`,
      { rows: a.data?.length, error: a.error?.code },
    );
    const u = await asUser.from(t).select("*").limit(1);
    check(
      (u.data ?? []).length === 0,
      `an authenticated student's JWT reads nothing from ${t}`,
      { rows: u.data?.length, error: u.error?.code },
    );
  }

  // Writes, too -- a blocked read with an open write would be worse.
  const wr = await asUser.from("profiles").update({ role: "faculty" }).eq("id", stuA.id).select();
  check((wr.data ?? []).length === 0, "an authenticated JWT cannot UPDATE its own profile role directly", wr.error?.code);
  const roleAfter = await admin.from("profiles").select("role").eq("id", stuA.id).maybeSingle();
  check(roleAfter.data?.role === "student", "...the role is still student", roleAfter.data);

  const ins = await asUser.from("courses").insert({ owner_id: stuA.id, code: "RLS-EVIL", title: "x" }).select();
  check((ins.data ?? []).length === 0, "an authenticated JWT cannot INSERT a course directly", ins.error?.code);

  // The view, and the RPCs.
  const view = await asUser.from("lecture_identity_conflicts").select("*").limit(1);
  check((view.data ?? []).length === 0, "the identity-conflicts VIEW leaks nothing to a user JWT", view.error?.code);

  for (const fn of ["claim_reconstruction_job", "claim_reconstruction_windows"]) {
    const rpc = await asUser.rpc(fn, { p_job_id: randomUUID(), p_lease_seconds: 1 });
    check(!Array.isArray(rpc.data) || rpc.data.length === 0, `RPC ${fn} returns nothing to a user JWT`, rpc.error?.code);
  }

  section("SESSION HANDLING");

  const noToken = await api("/api/me/overview", null);
  check(noToken.status === 401, "no token: 401", noToken.status);

  const garbage = await api("/api/me/overview", "not-a-jwt");
  check(garbage.status === 401, "malformed token: 401", garbage.status);

  const forgedJwt = await api(
    "/api/me/overview",
    `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({ sub: facA.id, role: "authenticated" }),
    ).toString("base64url")}.`,
  );
  check(forgedJwt.status === 401, "alg:none forged token impersonating faculty A: 401", forgedJwt.status);

  const otherToken = await api("/api/me/overview", stuB.token);
  check(otherToken.status === 200, "a valid token for another user works AS THAT USER", otherToken.status);
  check(
    !otherToken.text.includes(`SECAUDIT-A-${STAMP}`),
    "...and sees none of student A's courses",
  );
} catch (err) {
  check(false, `harness error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  section("CLEANUP");
  for (const id of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`WARN  cleanup failed for ${id}: ${error.message}`);
  }
  if (seededObjects.length) {
    const { error } = await admin.storage.from("lectures").remove(seededObjects);
    if (error) console.log(`WARN  object cleanup failed: ${error.message}`);
  }
  const leftoverObjects = await admin.storage.from("lectures").list("", { limit: 1000 });
  check(
    !(leftoverObjects.data ?? []).some((o) => seededObjects.some((p) => p.startsWith(o.name))),
    "cleanup: no seeded storage object survives",
  );
  const leftoverCourses = await admin.from("courses").select("id").like("code", `SECAUDIT-%-${STAMP}`);
  check((leftoverCourses.data ?? []).length === 0, "cleanup: no seeded course survives", leftoverCourses.data);
  const leftoverProfiles = await admin.from("profiles").select("id").in("id", createdUserIds);
  check((leftoverProfiles.data ?? []).length === 0, "cleanup: no throwaway profile survives");
}

console.log(`\n${"=".repeat(72)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILED ASSERTIONS:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exitCode = failed > 0 ? 1 : 0;
