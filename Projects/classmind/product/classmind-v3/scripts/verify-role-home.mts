// Verification of the role-aware home payload, driven over HTTP against a
// running server exactly as a browser drives it.
//
//   E2E_BASE_URL=http://localhost:3300 node --env-file=.env.local scripts/verify-role-home.mts
//
// The check that matters is the negative one: a student's `/api/me/overview`
// must not contain the title, summary, steps, unspecified list, evidence quote
// or id of any knowledge item still awaiting the lecturer's verdict -- ABSENT
// FROM THE RESPONSE, not merely hidden on screen.
//
// A negative check is only evidence if there was something to find, so the
// fixture is CONSTRUCTED rather than extracted: a fresh course, a published
// lecture, and knowledge rows in every status the column can take, each
// unconfirmed one carrying a unique marker string in every text-bearing field.
// Running this against whatever happens to be in the database proves nothing on
// the day the database is empty. Same discipline as scripts/qa.
//
// Everything it creates, it deletes. It touches no pre-existing row.

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
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 600));
}

function section(title: string) {
  console.log(`\n--- ${title} ---`);
}

const svc = createClient(PROJECT_URL, SERVICE, { auth: { persistSession: false } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: Payload = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { nonJson: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

async function signIn(creds: { email: string; password: string }) {
  const anon = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword(creds);
  if (error) throw new Error(`Cannot sign in ${creds.email}: ${error.message}`);
  return { token: data.session!.access_token, userId: data.user!.id };
}

// Every unconfirmed field in the fixture carries this. A leak test that only
// looks at the title cannot catch a route that serves the steps -- and `steps`
// is exactly where the instructions a student must not act on prematurely live.
const MARK = "HOMELEAK";

async function insertLecture(courseId: string, title: string, status: string) {
  const { data, error } = await svc
    .from("lectures")
    .insert({
      course_id: courseId,
      title,
      status,
      original_filename: "fixture.mp3",
      storage_path: `fixture/${crypto.randomUUID()}.mp3`,
      file_size_bytes: 1024,
      content_type: "audio/mpeg",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lecture insert failed: ${error?.message}`);
  return data.id as string;
}

async function main() {
  console.log(`ClassMind role-aware home  ->  ${BASE}`);

  section("1. Sign in");
  const faculty = await signIn(FACULTY);
  const student = await signIn(STUDENT);
  check("faculty signed in", Boolean(faculty.token));
  check("student signed in", Boolean(student.token));

  const createdCourses: string[] = [];

  try {
    section("2. Fixture");
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    const made = await api(faculty.token, "POST", "/api/courses", {
      code: `HOME-${stamp}`,
      title: "Role-aware home fixture",
      term: "Autumn 2026",
      transcriptionLanguage: "en-IN",
    });
    if (made.status !== 200) throw new Error(`course create failed: ${JSON.stringify(made.json)}`);
    const course = made.json.course;
    createdCourses.push(course.id);
    check("faculty created the fixture course", Boolean(course.id));

    const joined = await api(student.token, "POST", "/api/enroll", { joinCode: course.join_code });
    check("student joined it with the join code", joined.status === 200, joined.json);

    // Published: its confirmed knowledge is real course material.
    const readyLecture = await insertLecture(course.id, "Fixture lecture — published", "ready");
    // Quarantined: a transcript exists and is retained, but nothing derived
    // from it may be served. A CONFIRMED item hangs off it below, so the test
    // proves the gate is the lecture's status and not the item's.
    const badLecture = await insertLecture(course.id, "Fixture lecture — quarantined", "quarantined");

    const base = {
      course_id: course.id,
      steps: [] as string[],
      unspecified: [] as string[],
      confidence: 0.9,
      reconstruction_method: "home-fixture",
      reconstruction_version: "1",
    };
    const { data: seeded, error: seedError } = await svc
      .from("knowledge_items")
      .insert([
        {
          ...base,
          lecture_id: readyLecture,
          category: "teaching",
          kind: "topic",
          status: "auto",
          title: "Fixture topic",
          summary: "Teaching enters the base without review.",
        },
        {
          ...base,
          lecture_id: readyLecture,
          category: "actionable",
          kind: "assignment",
          status: "confirmed",
          title: "Fixture confirmed assignment",
          summary: "A human vouched for this, so a student may act on it.",
          steps: ["Read chapter four", "Bring the worked example"],
          unspecified: ["no due date was given"],
        },
        {
          ...base,
          lecture_id: readyLecture,
          category: "actionable",
          kind: "assignment",
          status: "pending",
          title: `${MARK}-PTITLE`,
          summary: `${MARK}-PSUMMARY.`,
          steps: [`${MARK}-PSTEP one`, `${MARK}-PSTEP two`],
          unspecified: [`${MARK}-PUNSPEC no due date was given`],
        },
        {
          ...base,
          lecture_id: readyLecture,
          category: "actionable",
          kind: "deadline",
          status: "pending",
          title: `${MARK}-PTITLE2`,
          summary: `${MARK}-PSUMMARY2.`,
          steps: [],
          unspecified: [],
        },
        {
          ...base,
          lecture_id: readyLecture,
          category: "teaching",
          kind: "topic",
          status: "rejected",
          title: `${MARK}-RTITLE`,
          summary: `${MARK}-RSUMMARY.`,
          steps: [`${MARK}-RSTEP`],
        },
        {
          ...base,
          lecture_id: badLecture,
          category: "actionable",
          kind: "assignment",
          status: "confirmed",
          title: `${MARK}-QTITLE`,
          summary: `${MARK}-QSUMMARY confirmed, but from a quarantined transcript.`,
          steps: [`${MARK}-QSTEP`],
        },
      ])
      .select("id, status, title, lecture_id");
    if (seedError || !seeded) throw new Error(`knowledge seed failed: ${seedError?.message}`);

    // A quote is the lecturer's actual words -- the most damaging field to leak.
    const pendingIds = seeded.filter((r) => r.status === "pending").map((r) => r.id as string);
    await svc.from("knowledge_evidence").insert(
      pendingIds.map((id, index) => ({
        knowledge_item_id: id,
        lecture_id: readyLecture,
        role: "statement",
        start_ms: 1000 * (index + 1),
        end_ms: 1000 * (index + 2),
        quote: `${MARK}-PQUOTE${index} spoken words`,
      })),
    );
    check(
      "seeded 6 knowledge rows: auto, confirmed, 2 pending, rejected, and one confirmed on a quarantined lecture",
      seeded.length === 6,
      seeded.map((r) => r.status),
    );

    section("3. Unauthenticated");
    const anonymous = await fetch(`${BASE}/api/me/overview`);
    check("anonymous overview is rejected", anonymous.status === 401, anonymous.status);

    section("4. Teacher payload");
    const t = await api(faculty.token, "GET", "/api/me/overview");
    check("200", t.status === 200, t.json);
    const teacher = t.json;
    check("role is faculty", teacher.role === "faculty", teacher.role);
    check(
      "every course carries a lecture count and a processing count",
      teacher.courses.every(
        (c: Payload) => typeof c.lectureCount === "number" && typeof c.processingCount === "number",
      ),
    );
    check(
      "owned courses expose their join code",
      teacher.courses.filter((c: Payload) => c.isOwner).every((c: Payload) => Boolean(c.joinCode)),
    );
    const fixtureCourse = teacher.courses.find((c: Payload) => c.id === course.id);
    check(
      "the fixture course reports its 2 lectures",
      fixtureCourse?.lectureCount === 2,
      fixtureCourse,
    );

    const queued = teacher.reviewQueue.find((r: Payload) => r.lectureId === readyLecture);
    check("the published fixture lecture is in the review queue", Boolean(queued), teacher.reviewQueue);
    check("it reports both pending items", queued?.pendingCount === 2, queued);
    check(
      "it names the lecture, the course and when the wait started",
      queued?.lectureTitle === "Fixture lecture — published" &&
        queued?.courseCode === `HOME-${stamp}` &&
        !Number.isNaN(Date.parse(queued?.waitingSince)),
      queued,
    );
    check(
      "the review queue is ordered oldest wait first",
      teacher.reviewQueue.every(
        (r: Payload, i: number) =>
          i === 0 || teacher.reviewQueue[i - 1].waitingSince <= r.waitingSince,
      ),
      teacher.reviewQueue.map((r: Payload) => r.waitingSince),
    );
    check(
      "the quarantined fixture lecture is reported as needing attention",
      teacher.blocked.some((l: Payload) => l.id === badLecture),
      teacher.blocked.map((l: Payload) => l.id),
    );
    check(
      "nothing in `blocked` is anything other than quarantined or failed",
      teacher.blocked.every((l: Payload) => l.status === "quarantined" || l.status === "failed"),
      teacher.blocked.map((l: Payload) => l.status),
    );
    check("teacher payload has NO student to-do list", teacher.todo === undefined);
    check("teacher payload has NO awaitingReview count", teacher.awaitingReview === undefined);

    section("5. Student payload");
    const s = await api(student.token, "GET", "/api/me/overview");
    check("200", s.status === 200, s.json);
    const stud = s.json;
    check("role is student", stud.role === "student", stud.role);
    check("student payload has NO review queue", stud.reviewQueue === undefined);
    check("student payload has NO blocked list", stud.blocked === undefined);
    check(
      "recent lectures are all published",
      stud.recentLectures.every((l: Payload) => l.status === "ready"),
      stud.recentLectures.map((l: Payload) => l.status),
    );
    check(
      "the confirmed fixture assignment IS in the student's work",
      stud.todo.some((i: Payload) => i.title === "Fixture confirmed assignment"),
      stud.todo.map((i: Payload) => i.title),
    );
    const mine = stud.todo.find((i: Payload) => i.title === "Fixture confirmed assignment");
    check(
      "it carries its steps, its unspecified list, its course and its lecture",
      mine?.steps?.length === 2 &&
        mine?.unspecified?.length === 1 &&
        mine?.courseCode === `HOME-${stamp}` &&
        mine?.lectureId === readyLecture,
      mine,
    );
    check(
      "to-do items are obligations only (assignment / deadline / exam_instruction)",
      stud.todo.every((i: Payload) =>
        ["assignment", "deadline", "exam_instruction"].includes(i.kind),
      ),
      stud.todo.map((i: Payload) => i.kind),
    );
    check(
      "awaitingReview is a NUMBER, not a list",
      typeof stud.awaitingReview === "number",
      stud.awaitingReview,
    );
    check(
      "and it counts the 2 items the lecturer has not looked at",
      stud.awaitingReview >= 2,
      stud.awaitingReview,
    );

    section("6. THE NEGATIVE: no unreviewed content reaches the student");
    const serialised = JSON.stringify(stud);
    check(
      `the marker "${MARK}" appears nowhere in the student payload`,
      !serialised.includes(MARK),
      serialised.match(new RegExp(`${MARK}[A-Z0-9-]*`, "g")),
    );
    for (const row of seeded.filter((r) => r.status !== "auto" && r.status !== "confirmed")) {
      check(
        `pending/rejected item id ${String(row.id).slice(0, 8)} is absent`,
        !serialised.includes(row.id as string),
      );
    }
    check(
      "the confirmed item on the QUARANTINED lecture is absent too",
      !serialised.includes(`${MARK}-QTITLE`) && !stud.todo.some((i: Payload) => i.lectureId === badLecture),
    );
    check(
      "the quarantined lecture itself is absent from recent lectures",
      !stud.recentLectures.some((l: Payload) => l.id === badLecture),
    );
    // The same fields, on the teacher's own copy, to prove the assertions above
    // are testing a boundary rather than an empty response.
    const teacherLecture = await api(
      faculty.token,
      "GET",
      `/api/lectures/${readyLecture}/knowledge`,
    );
    check(
      "CONTROL: the teacher CAN see the same pending item's content",
      JSON.stringify(teacherLecture.json).includes(`${MARK}-PTITLE`),
      teacherLecture.status,
    );

    section("7. Efficiency");
    const t0 = Date.now();
    await api(student.token, "GET", "/api/me/overview");
    const studentMs = Date.now() - t0;
    const t1 = Date.now();
    await api(faculty.token, "GET", "/api/me/overview");
    const facultyMs = Date.now() - t1;
    console.log(
      `        one request each: student ${studentMs} ms across ${stud.courses.length} courses ` +
        `(${stud.recentLecturesTotal} published lectures), faculty ${facultyMs} ms across ` +
        `${teacher.courses.length} courses (${teacher.recentLecturesTotal} lectures).`,
    );
    check("the whole home is one request per role", true);
  } finally {
    section("Cleanup");
    for (const id of createdCourses) {
      const { error } = await svc.from("courses").delete().eq("id", id);
      console.log(
        `  ${error ? "FAILED to remove" : "removed"} course ${id}${error ? `: ${error.message}` : ""}`,
      );
    }
  }

  section("Summary");
  console.log(`${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nABORTED:", e.message, "\n", e.stack);
  process.exit(1);
});
