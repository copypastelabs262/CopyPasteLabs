// ADVERSARIAL ACCESS-BOUNDARY SUITE
//
//   E2E_BASE_URL=http://localhost:3300 node --env-file=.env.local \
//     scripts/qa/access-boundaries.mts
//
// No TRANSCRIPTION_PROVIDER: that variable is no longer read anywhere. Replay is
// requested per lecture with `replayFixture`, and a lecture that names no
// fixture goes to the PAID provider. This suite asserts, before it does anything
// else, that its own lecture was actually replayed -- a test that quietly starts
// spending money is worse than a test that fails.
//
// Everything here runs over real HTTP against a running server, through the
// real route handlers, the real Supabase auth and the real database. Nothing is
// mocked, because the class of bug this hunts -- an authorization check that is
// present in the source and absent at runtime -- is invisible to any test that
// stubs the thing doing the checking.
//
// TWO RULES THIS SUITE HOLDS ITSELF TO
//
// 1. Every negative check is paired with a POSITIVE CONTROL on the same code
//    path. "The student saw nothing" is worthless on its own: it is exactly what
//    a broken route, an empty database, or a typo'd response key also produce.
//    A denial is only evidence when the same call, made by someone who IS
//    allowed, returns the data.
//
// 2. Fixture state is CONSTRUCTED, not extracted. The knowledge items below are
//    inserted directly with known statuses, because a boundary test that waits
//    for a language model to happen to emit an assignment is a boundary test
//    that silently stops testing the boundary on the day the model changes.
//    The pipeline's correctness is other suites' job; this suite's job is: given
//    a row in state X, who can read it.
//
// Everything it creates, it deletes. It touches no pre-existing row.

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3300";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };
const STUDENT = { email: "student.test@classmind.local", password: "ClassMindTest!2026" };

// Any real audio object. Which transcript comes back is NO LONGER decided by
// the filename -- it is named explicitly per lecture via `replayFixture`, and
// `TRANSCRIPTION_PROVIDER` is not read anywhere any more. A lecture created
// without a slug goes to the PAID provider, so the slug below is a cost
// control as much as a correctness one.
const LAB_AUDIO_PATH = "ccf15fe1-9f7f-48dc-990a-4e16513fe354/original.mp3";
// Deliberately names no fixture, to keep proving that the filename selects
// nothing.
const UPLOAD_FILENAME = "qa-access-boundaries.mp3";
const REPLAY_FIXTURE = "cloud-computing-hinglish";

// Downloaded and hashed ONCE. The route requires the caller to commit to a
// SHA-256 of the bytes it is about to upload, and re-checks it against what it
// hands the transcription engine.
let audioBytes: ArrayBuffer | null = null;
let audioSha = "";
async function labAudio() {
  if (audioBytes) return { bytes: audioBytes, sha: audioSha };
  const download = await svc.storage.from("audio").download(LAB_AUDIO_PATH);
  if (download.error || !download.data) throw new Error(`Cannot read lab audio: ${download.error?.message}`);
  audioBytes = await download.data.arrayBuffer();
  audioSha = createHash("sha256").update(Buffer.from(audioBytes)).digest("hex");
  return { bytes: audioBytes, sha: audioSha };
}

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed += 1; console.log(`  PASS  ${label}`); return; }
  failures.push(label);
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 500));
}
function section(title: string) { console.log(`\n--- ${title} ---`); }

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
  try { json = text ? JSON.parse(text) : null; } catch { json = { nonJson: text.slice(0, 300) }; }
  return { status: res.status, json };
}

// A raw variant, so a MALFORMED Authorization header can be sent -- `api()`
// cannot express "authorization: garbage" because it builds the header itself.
async function apiRaw(headers: Record<string, string>, method: string, path: string) {
  const res = await fetch(BASE + path, { method, headers });
  const text = await res.text();
  let json: Payload = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { nonJson: text.slice(0, 300) }; }
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
  await api(token, "POST", "/api/profile", { fullName: `Test ${role}`, role });
  return { token, userId: signIn.data.user!.id };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Creates the lecture ROW only. No bytes are uploaded, so the lecture stays at
// `pending_upload` -- which is precisely the state needed to prove a student
// cannot read a lecture that is not `ready`.
async function createLectureRow(token: string, courseId: string, title: string) {
  const { bytes, sha } = await labAudio();
  const lec = await api(token, "POST", `/api/courses/${courseId}/lectures`, {
    title, originalFilename: UPLOAD_FILENAME, fileSizeBytes: bytes.byteLength,
    contentType: "audio/mpeg", checksumSha256: sha, replayFixture: REPLAY_FIXTURE,
  });
  if (lec.status !== 200 || !lec.json?.lectureId) {
    throw new Error(`lecture row create failed: ${JSON.stringify(lec.json)}`);
  }
  return lec.json.lectureId as string;
}

// Creates a lecture AND pushes real bytes through the real signed-URL upload,
// then drives transcribe -> poll to a terminal state. Used for the one lecture
// that has to carry a genuine transcript, so the positive controls below are
// reading real data rather than something this script wrote.
async function createTranscribedLecture(token: string, courseId: string, title: string) {
  const { bytes, sha } = await labAudio();
  const lec = await api(token, "POST", `/api/courses/${courseId}/lectures`, {
    title, originalFilename: UPLOAD_FILENAME,
    fileSizeBytes: bytes.byteLength, contentType: "audio/mpeg",
    checksumSha256: sha, replayFixture: REPLAY_FIXTURE,
  });
  if (lec.status !== 200 || !lec.json?.signedUrl) throw new Error(`create failed: ${JSON.stringify(lec.json)}`);
  const put = await fetch(lec.json.signedUrl, {
    method: "PUT", headers: { "content-type": "audio/mpeg" }, body: bytes,
  });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);
  const id = lec.json.lectureId as string;

  const sub = await api(token, "POST", `/api/lectures/${id}/transcribe`);
  if (sub.status !== 200) throw new Error(`transcribe failed: ${JSON.stringify(sub.json)}`);
  for (let i = 0; i < 30; i += 1) {
    const p = await api(token, "POST", `/api/lectures/${id}/poll`);
    if (p.json?.status && !["transcribing", "uploaded"].includes(p.json.status)) return id;
    await sleep(1000);
  }
  throw new Error("polling never reached a terminal state");
}

interface Seeded { auto: string; pending: string; confirmed: string; rejected: string }

// Replaces this lecture's knowledge with four rows of KNOWN status, one per
// value the status column can take. Direct DB writes, deliberately: the point
// is to fix the state so the read boundary is the only variable.
async function seedKnowledge(lectureId: string, courseId: string): Promise<Seeded> {
  await svc.from("knowledge_items").delete().eq("lecture_id", lectureId);
  const base = {
    lecture_id: lectureId, course_id: courseId,
    steps: [], unspecified: [], confidence: 0.9,
    reconstruction_method: "qa-fixture", reconstruction_version: "1",
  };
  // The pending and rejected rows carry a UNIQUE MARKER in every text-bearing
  // field -- title, summary, steps, unspecified, and an evidence quote. A leak
  // test that only checks the title cannot catch a route that serves the steps,
  // and `steps` is exactly where the instructions a student must not act on
  // prematurely would live.
  const rows = [
    { ...base, category: "teaching", kind: "topic", status: "auto",
      title: "QA AUTO topic", summary: "Visible to everyone without review." },
    { ...base, category: "actionable", kind: "assignment", status: "pending",
      title: "LEAKMARK-PTITLE", summary: "LEAKMARK-PSUMMARY.",
      steps: ["LEAKMARK-PSTEP one", "LEAKMARK-PSTEP two"],
      unspecified: ["LEAKMARK-PUNSPEC no due date was given"] },
    { ...base, category: "actionable", kind: "assignment", status: "confirmed",
      title: "QA CONFIRMED assignment", summary: "A human vouched for this, so a student may see it." },
    { ...base, category: "teaching", kind: "topic", status: "rejected",
      title: "LEAKMARK-RTITLE", summary: "LEAKMARK-RSUMMARY.",
      steps: ["LEAKMARK-RSTEP"], unspecified: [] },
  ];
  const { data, error } = await svc.from("knowledge_items").insert(rows).select("id, status");
  if (error || !data) throw new Error(`seeding knowledge failed: ${error?.message}`);
  const by = (s: string) => data.find((d) => d.status === s)!.id as string;

  // Evidence too: a quote is the one field that carries the lecturer's actual
  // words, so it is the most damaging thing to leak from an unconfirmed item.
  await svc.from("knowledge_evidence").insert([
    { knowledge_item_id: by("pending"), lecture_id: lectureId, role: "statement",
      start_ms: 1000, end_ms: 2000, char_start: 0, char_end: 20, quote: "LEAKMARK-PQUOTE spoken words" },
    { knowledge_item_id: by("rejected"), lecture_id: lectureId, role: "statement",
      start_ms: 3000, end_ms: 4000, char_start: 0, char_end: 20, quote: "LEAKMARK-RQUOTE spoken words" },
  ]);

  return { auto: by("auto"), pending: by("pending"), confirmed: by("confirmed"), rejected: by("rejected") };
}

async function main() {
  console.log(`ClassMind v2 access boundaries  ->  ${BASE}`);
  // Deliberately NOT `process.env.TRANSCRIPTION_PROVIDER`: nothing reads that
  // variable any more, so printing it would state the opposite of the truth.
  // What this run does is decided per lecture, and is verified from provenance
  // in section 0 rather than announced here.
  console.log(`replay fixture requested: ${REPLAY_FIXTURE}`);

  const created = { courses: [] as string[] };

  try {
    section("0. Setup: two courses, a student enrolled in ONE of them");
    const faculty = await tokenFor(FACULTY, "faculty");
    const student = await tokenFor(STUDENT, "student");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(11, 19);

    const mk = async (code: string, title: string) => {
      const r = await api(faculty.token, "POST", "/api/courses", {
        code, title, term: "QA 2026", transcriptionLanguage: "en-IN",
      });
      if (r.status !== 200 || !r.json?.course?.id) throw new Error(`course create failed: ${JSON.stringify(r.json)}`);
      created.courses.push(r.json.course.id);
      return r.json.course;
    };
    const courseA = await mk(`QA-A-${stamp}`, "Access Boundaries A");
    const courseB = await mk(`QA-B-${stamp}`, "Access Boundaries B");
    check("two courses created", !!courseA.id && !!courseB.id);

    const enrol = await api(student.token, "POST", "/api/enroll", { joinCode: courseA.join_code });
    check("student is enrolled in course A ONLY", enrol.status === 200, enrol.json);

    // A1: real audio, real transcript. A2: never uploaded, so not `ready`.
    // A3: a throwaway whose only purpose is to be a delete target.
    // B1: a lecture in the course the student cannot see.
    const lectureA1 = await createTranscribedLecture(faculty.token, courseA.id, "A1 transcribed");
    // COST GUARD. If the replay request did not stick, this lecture was
    // transcribed by the PAID provider and every later run would quietly bill.
    //
    // Checked against PROVENANCE, not against `replay_fixture_slug`. The column
    // ships in 20260830150000_audio_identity.sql and may not be applied yet, in
    // which case the route falls back to remembering the request in process
    // memory -- and selecting a column that does not exist makes PostgREST fail
    // the WHOLE select, so an earlier version of this guard read `{}` and
    // reported a live paid call that had not happened. Provenance is written by
    // whichever provider actually ran, so it answers the question being asked
    // rather than the one that was convenient to query.
    const { data: replayRow } = await svc
      .from("lectures").select("provenance").eq("id", lectureA1).maybeSingle();
    const prov = JSON.stringify(replayRow?.provenance ?? {});
    const replayed = prov.includes("fixture");
    check("the lecture was REPLAYED, not sent to the paid provider", replayed, prov.slice(0, 300));
    if (!replayed) {
      throw new Error(
        "Refusing to continue: this lecture was not replayed from a fixture, so this run is " +
        "making live paid transcription calls. Fix the replayFixture wiring before re-running.",
      );
    }
    const lectureA2 = await createLectureRow(faculty.token, courseA.id, "A2 never uploaded");
    const lectureA3 = await createLectureRow(faculty.token, courseA.id, "A3 delete target");
    const lectureB1 = await createLectureRow(faculty.token, courseB.id, "B1 other course");

    // A1 is forced to `ready` regardless of what reconstruction did. The
    // publication gate is another suite's subject; here `ready` is a
    // precondition, not a result, and letting a model call decide whether this
    // suite tests anything would be the same mistake as a check that cannot fail.
    // A1 IS MADE TO LOOK GENUINE, ON PURPOSE.
    //
    // A gate landed today (src/lib/provenance/replay.ts) that hides from
    // students any lecture whose transcript was REPLAYED from a fixture. It is
    // the right rule -- lecture 5ced44b6 has been serving a thermodynamics
    // transcript under the title "Cloud computing" since 2026-08-22 -- but it
    // puts this suite in a bind: replay is how the tests avoid paying for
    // transcription, and replayed lectures are now invisible to exactly the
    // role whose access this suite exists to test.
    //
    // So the row is rewritten to the shape a genuine Sarvam run leaves behind:
    // engine "sarvam", no replay marker in decodingParams or limitations, and a
    // job id with no scheme prefix. That is CONSTRUCTED STATE, stated plainly,
    // and it is legitimate for the same reason the seeded knowledge below is:
    // the question under test is "given a row in state X, who may read it", and
    // the honest way to ask it is to put a row in state X.
    //
    // A5 below is left replayed, so the gate's NEGATIVE side is tested too.
    const genuineProvenance = {
      engine: "sarvam",
      configuredLanguage: "en-IN",
      decodingParams: { languageCode: "en-IN", replayed: false },
      limitations: [],
    };
    const { error: readyErr } = await svc.from("lectures").update({
      status: "ready",
      provenance: genuineProvenance,
      provider_job_id: "20260830_qa000000-0000-4000-8000-000000000001",
    }).eq("id", lectureA1);
    const { data: a1row } = await svc
      .from("lectures").select("status").eq("id", lectureA1).maybeSingle();
    check("A1 could be forced to 'ready' (this suite's precondition)",
      !readyErr && a1row?.status === "ready", { readyErr: readyErr?.message, status: a1row?.status });
    const seeded = await seedKnowledge(lectureA1, courseA.id);
    const { data: a2row } = await svc.from("lectures").select("status").eq("id", lectureA2).single();
    check("A2 is in a non-ready state, as this suite requires", a2row?.status !== "ready", a2row?.status);

    // ------------------------------------------------------------------
    section("1. UNAUTHENTICATED: every route and verb is refused");
    // Real ids are used throughout, so a 401 cannot be a 404 in disguise -- the
    // resource exists and the ONLY reason to refuse is the missing session.
    const anonRoutes: [string, string][] = [
      ["GET", "/api/courses"],
      ["POST", "/api/courses"],
      ["GET", `/api/courses/${courseA.id}`],
      ["GET", `/api/courses/${courseA.id}/ask?q=hello`],
      ["POST", `/api/courses/${courseA.id}/context`],
      ["GET", `/api/courses/${courseA.id}/knowledge`],
      ["GET", `/api/courses/${courseA.id}/units`],
      ["POST", `/api/courses/${courseA.id}/lectures`],
      ["POST", "/api/enroll"],
      ["POST", `/api/knowledge/${seeded.pending}/review`],
      ["GET", `/api/lectures/${lectureA1}`],
      ["GET", `/api/lectures/${lectureA1}/knowledge`],
      ["POST", `/api/lectures/${lectureA1}/extract`],
      ["POST", `/api/lectures/${lectureA1}/poll`],
      ["POST", `/api/lectures/${lectureA1}/transcribe`],
      ["POST", "/api/profile"],
      // Destructive, and last: if this one is NOT refused the row is gone, and
      // every check after it would be testing a deleted lecture.
      ["DELETE", `/api/lectures/${lectureA3}`],
    ];
    for (const [method, path] of anonRoutes) {
      const r = await api(null, method, path, method === "GET" || method === "DELETE" ? undefined : {});
      check(`${method} ${path.split("?")[0]} rejects an anonymous caller`, r.status === 401,
        { status: r.status, json: r.json });
    }

    const { data: stillThere } = await svc.from("lectures").select("id").eq("id", lectureA3).maybeSingle();
    check("the anonymous DELETE did not actually delete anything", !!stillThere);

    // A forged or malformed credential must fail EXACTLY like no credential.
    const forged = await api("not-a-real-token", "GET", `/api/courses/${courseA.id}`);
    check("a forged bearer token is refused", forged.status === 401, forged);
    const malformed = await apiRaw({ authorization: "Basic abc123" }, "GET", `/api/courses/${courseA.id}`);
    check("a non-bearer Authorization header is refused", malformed.status === 401, malformed);
    const empty = await apiRaw({ authorization: "Bearer " }, "GET", `/api/courses/${courseA.id}`);
    check("an empty bearer token is refused", empty.status === 401, empty);

    // POSITIVE CONTROL. Without this the whole section could be a server that
    // 401s everything, including for legitimate callers.
    const authed = await api(faculty.token, "GET", `/api/courses/${courseA.id}`);
    check("CONTROL: the same route with a real session returns 200", authed.status === 200, authed.status);

    // ------------------------------------------------------------------
    section("2. A student cannot read a course they are not enrolled in");
    const crossCourse: [string, string, string][] = [
      ["GET", `/api/courses/${courseB.id}`, "course workspace"],
      ["GET", `/api/courses/${courseB.id}/knowledge`, "course knowledge"],
      ["GET", `/api/courses/${courseB.id}/units`, "course-wide knowledge units"],
      ["GET", `/api/courses/${courseB.id}/ask?q=what+is+due`, "ask endpoint"],
      ["GET", `/api/lectures/${lectureB1}`, "a lecture in that course"],
      ["GET", `/api/lectures/${lectureB1}/knowledge`, "that lecture's knowledge"],
    ];
    for (const [method, path, label] of crossCourse) {
      const r = await api(student.token, method, path);
      check(`student is refused ${label} of another course`, r.status === 403 || r.status === 404,
        { status: r.status, json: r.json });
      check(`  ...and the refusal body carries no course data`,
        !r.json?.lectures && !r.json?.items && !r.json?.units && !r.json?.sources?.length,
        r.json);
    }
    const notOwnerCreate = await api(student.token, "POST", `/api/courses/${courseB.id}/lectures`, {
      title: "intruder", originalFilename: "x.mp3", fileSizeBytes: 10, contentType: "audio/mpeg",
    });
    check("student cannot create a lecture in another course", notOwnerCreate.status === 403 || notOwnerCreate.status === 404,
      notOwnerCreate);

    // POSITIVE CONTROL: the same five reads on the course they ARE in.
    const okCourse = await api(student.token, "GET", `/api/courses/${courseA.id}`);
    check("CONTROL: student CAN read the course they are enrolled in", okCourse.status === 200, okCourse.status);
    check("and the join code is withheld from a non-owner",
      okCourse.json?.course?.join_code === undefined, okCourse.json?.course);
    check("and faculty-only course context is withheld from a student",
      (okCourse.json?.context ?? []).length === 0, okCourse.json?.context);

    // ------------------------------------------------------------------
    section("3. A student cannot reach a lecture that is not 'ready'");
    const sA2 = await api(student.token, "GET", `/api/lectures/${lectureA2}`);
    check("student is refused an unprocessed lecture", sA2.status === 403, { status: sA2.status, json: sA2.json });
    check("  ...and gets no transcript with the refusal", !sA2.json?.transcript, sA2.json);
    const sA2k = await api(student.token, "GET", `/api/lectures/${lectureA2}/knowledge`);
    check("student is refused that lecture's knowledge", sA2k.status === 403, { status: sA2k.status, json: sA2k.json });

    check("the unready lecture is hidden from the student's lecture list",
      (okCourse.json?.lectures ?? []).every((l: Payload) => l.id !== lectureA2 && l.id !== lectureA3),
      (okCourse.json?.lectures ?? []).map((l: Payload) => `${l.id}:${l.status}`));

    // POSITIVE CONTROLS: the owner CAN see the unready lecture, and the student
    // CAN see the ready one. Together these prove the gate is the status, not a
    // blanket denial and not a broken route.
    const fA2 = await api(faculty.token, "GET", `/api/lectures/${lectureA2}`);
    check("CONTROL: the OWNER can see the same unready lecture", fA2.status === 200, fA2.status);
    // ---- THE REPLAY GATE, both sides -----------------------------------
    // A5 is `ready`, carries knowledge, and is REPLAYED. It must be withheld
    // from the student and readable by the owner. Without this, the suite would
    // only ever exercise the gate's permissive side.
    const lectureA5 = await createLectureRow(faculty.token, courseA.id, "A5 replayed but ready");
    await svc.from("lectures").update({
      status: "ready",
      provenance: { engine: "fixture-replay", decodingParams: { replayed: true },
        limitations: ["The audio stored against this lecture is NOT the audio that produced this transcript."] },
      provider_job_id: "fixture:cloud-computing-hinglish:1787402755651",
    }).eq("id", lectureA5);
    await svc.from("knowledge_items").insert({
      lecture_id: lectureA5, course_id: courseA.id, category: "teaching", kind: "topic",
      title: "REPLAYMARK topic", summary: "From a lecture whose transcript is not its own.",
      steps: [], unspecified: [], confidence: 0.9,
      reconstruction_method: "qa-fixture", reconstruction_version: "1",
    });

    const sA5 = await api(student.token, "GET", `/api/lectures/${lectureA5}`);
    check("a REPLAYED lecture is withheld from a student even though it is 'ready'",
      sA5.status === 403, { status: sA5.status, json: sA5.json });
    check("  ...the refusal says it was withheld and why",
      sA5.json?.withheld === true && typeof sA5.json?.reason === "string", sA5.json);
    check("  ...and carries no transcript, raw response or audio URL",
      !sA5.json?.transcript && !sA5.json?.rawTranscriptionResponse && !sA5.json?.audioUrl, Object.keys(sA5.json ?? {}));
    const sA5k = await api(student.token, "GET", `/api/lectures/${lectureA5}/knowledge`);
    check("a replayed lecture yields a student no knowledge",
      (sA5k.json?.units ?? []).length === 0, sA5k.json);
    const sUnitsGate = await api(student.token, "GET", `/api/courses/${courseA.id}/units`);
    check("and the replayed lecture's knowledge is absent from the course-wide list",
      !JSON.stringify(sUnitsGate.json ?? {}).includes("REPLAYMARK"), "REPLAYMARK leaked past the replay gate");
    const fA5 = await api(faculty.token, "GET", `/api/lectures/${lectureA5}`);
    check("CONTROL: the OWNER can still open the replayed lecture", fA5.status === 200, fA5.status);

    const sA1 = await api(student.token, "GET", `/api/lectures/${lectureA1}`);
    check("CONTROL: the student CAN read the ready lecture", sA1.status === 200, sA1.status);
    check("CONTROL: ...and it carries a real transcript", !!sA1.json?.transcript?.text,
      typeof sA1.json?.transcript?.text);
    check("a student's lecture payload carries no raw candidate rows",
      (sA1.json?.candidates ?? []).length === 0 && (sA1.json?.reviews ?? []).length === 0,
      { candidates: (sA1.json?.candidates ?? []).length, reviews: (sA1.json?.reviews ?? []).length });

    // ------------------------------------------------------------------
    section("4. A student cannot see unconfirmed or rejected knowledge");
    const sKnow = await api(student.token, "GET", `/api/lectures/${lectureA1}/knowledge`);
    const sUnits: Payload[] = sKnow.json?.units ?? [];
    const sIds = new Set(sUnits.map((u) => u.id));
    check("student read of the ready lecture succeeds", sKnow.status === 200, sKnow.status);
    check("student SEES the auto item", sIds.has(seeded.auto), [...sIds]);
    check("student SEES the confirmed item", sIds.has(seeded.confirmed), [...sIds]);
    check("student does NOT see the pending item", !sIds.has(seeded.pending), [...sIds]);
    check("student does NOT see the rejected item", !sIds.has(seeded.rejected), [...sIds]);
    check("student sees EXACTLY the two permitted items, no more", sUnits.length === 2,
      sUnits.map((u) => `${u.status}:${u.title}`));
    // THE LEAK SWEEP. Every route a student can reach is serialised and searched
    // for the markers. This is the check that matters: a filter that drops an
    // item from `units` but serialises it somewhere else -- a count payload, an
    // ask source, a lecture blob -- has not withheld anything.
    const studentReachable: [string, string][] = [
      ["lecture knowledge", `/api/lectures/${lectureA1}/knowledge`],
      ["lecture detail", `/api/lectures/${lectureA1}`],
      ["course workspace", `/api/courses/${courseA.id}`],
      ["course knowledge", `/api/courses/${courseA.id}/knowledge`],
      // Added late: this route did not exist when this suite was written. It
      // serves the WHOLE course's knowledge in one call, which makes it the
      // single highest-value leak target in the app.
      ["course units", `/api/courses/${courseA.id}/units`],
      ["course ask", `/api/courses/${courseA.id}/ask?q=${encodeURIComponent("what assignment is due")}`],
      ["lecture-scoped ask", `/api/courses/${courseA.id}/ask?q=${encodeURIComponent("what did I miss")}&lectureId=${lectureA1}`],
      // The adversarial one: a student who has GUESSED the hidden item's exact
      // title and asks for it by name.
      ["ask naming the pending item outright", `/api/courses/${courseA.id}/ask?q=${encodeURIComponent("LEAKMARK-PTITLE")}`],
    ];
    // Only fields the student could NOT have supplied are searched for. An
    // earlier version of this sweep searched for the title too and reported a
    // leak on the last route -- the payload echoes `question` back and the model
    // quotes the question in its refusal, so the "leak" was the student's own
    // input coming home. A test that cannot distinguish the attacker's input
    // from the server's output is not a leak test.
    const secretMarkers = ["PSUMMARY", "PSTEP", "PUNSPEC", "PQUOTE"];
    const rejectedMarkers = ["RTITLE", "RSUMMARY", "RSTEP", "RQUOTE"];
    for (const [label, path] of studentReachable) {
      const r = await api(student.token, "GET", path);
      const blob = JSON.stringify(r.json ?? {});
      const hitP = secretMarkers.filter((m) => blob.includes(`LEAKMARK-${m}`));
      const hitR = rejectedMarkers.filter((m) => blob.includes(`LEAKMARK-${m}`));
      check(`no UNCONFIRMED content reaches a student via ${label}`, hitP.length === 0,
        { leaked: hitP, body: blob.slice(0, 300) });
      check(`no REJECTED content reaches a student via ${label}`, hitR.length === 0,
        { leaked: hitR, body: blob.slice(0, 300) });
    }
    // The title is checked separately, on the routes where the student did not
    // type it -- there it IS a leak.
    for (const [label, path] of studentReachable.slice(0, -1)) {
      const r = await api(student.token, "GET", path);
      check(`the pending item's TITLE does not appear via ${label}`,
        !JSON.stringify(r.json ?? {}).includes("LEAKMARK-PTITLE"),
        JSON.stringify(r.json ?? {}).slice(0, 300));
    }
    // And regardless of prose, no CITED SOURCE may ever be the hidden item.
    const guess = await api(student.token, "GET",
      `/api/courses/${courseA.id}/ask?q=${encodeURIComponent("LEAKMARK-PTITLE")}`);
    check("guessing the hidden item's title cites it as a source in no case",
      (guess.json?.sources ?? []).every((s: Payload) => s.id !== seeded.pending),
      (guess.json?.sources ?? []).map((s: Payload) => s.id));
    check("  ...and retrieval still only had the two permitted units to work with",
      guess.json?.knowledgeUnitsAvailable === 2, guess.json?.knowledgeUnitsAvailable);

    // `awaitingReview` is now returned to students on purpose: a COUNT, never
    // content. Asserted as exactly that -- the number is disclosed, the words
    // are not. Both halves matter; the count alone would be a leak if any of
    // the sweep above had failed.
    check("a student is told HOW MANY items await review", sKnow.json?.awaitingReview === 1,
      sKnow.json?.awaitingReview);
    check("  ...and that count is a number only, carrying no content",
      typeof sKnow.json?.awaitingReview === "number", typeof sKnow.json?.awaitingReview);

    // The course-wide route must apply the SAME filter as the per-lecture one.
    // It is a second implementation of "who may see this" in a second file, and
    // the comment in it says so; that is exactly the situation in which the two
    // drift apart, so it is asserted separately rather than assumed.
    const sUnitsCourse = await api(student.token, "GET", `/api/courses/${courseA.id}/units`);
    const sCourseIds = new Set((sUnitsCourse.json?.units ?? []).map((u: Payload) => u.id));
    check("course-wide units: student read succeeds", sUnitsCourse.status === 200, sUnitsCourse.status);
    check("course-wide units: student sees the auto and confirmed items",
      sCourseIds.has(seeded.auto) && sCourseIds.has(seeded.confirmed), [...sCourseIds]);
    check("course-wide units: student sees NEITHER the pending NOR the rejected item",
      !sCourseIds.has(seeded.pending) && !sCourseIds.has(seeded.rejected), [...sCourseIds]);
    check("course-wide units: exactly the two permitted items",
      (sUnitsCourse.json?.units ?? []).length === 2,
      (sUnitsCourse.json?.units ?? []).map((u: Payload) => `${u.status}:${u.title}`));
    const fUnitsCourse = await api(faculty.token, "GET", `/api/courses/${courseA.id}/units`);
    const fCourseIds = new Set((fUnitsCourse.json?.units ?? []).map((u: Payload) => u.id));
    check("CONTROL: course-wide units gives the OWNER the pending item",
      fCourseIds.has(seeded.pending), [...fCourseIds]);
    check("CONTROL: and still withholds the rejected item from the owner",
      !fCourseIds.has(seeded.rejected), [...fCourseIds]);

    const fKnow = await api(faculty.token, "GET", `/api/lectures/${lectureA1}/knowledge`);
    const fIds = new Set((fKnow.json?.units ?? []).map((u: Payload) => u.id));
    check("CONTROL: the OWNER does see the pending item", fIds.has(seeded.pending), [...fIds]);
    check("CONTROL: the owner is told one item awaits review", fKnow.json?.awaitingReview === 1,
      fKnow.json?.awaitingReview);
    check("even the owner does not see the rejected item", !fIds.has(seeded.rejected), [...fIds]);

    // The ask endpoint reads through the same filter; prove it independently,
    // because `knowledgeUnitsAvailable` is the retrieval INPUT and so cannot be
    // masked by a model that happened to cite nothing.
    const sAsk = await api(student.token, "GET",
      `/api/courses/${courseA.id}/ask?q=${encodeURIComponent("what assignment is due")}`);
    check("ask offers a student only the two permitted units",
      sAsk.json?.knowledgeUnitsAvailable === 2, sAsk.json?.knowledgeUnitsAvailable);
    check("no ask source is the pending item",
      (sAsk.json?.sources ?? []).every((s: Payload) => s.id !== seeded.pending),
      (sAsk.json?.sources ?? []).map((s: Payload) => s.title));
    check("the pending item's text appears nowhere in the student's answer",
      !JSON.stringify(sAsk.json).includes("LEAKMARK-P"), "leak in ask payload");
    const fAsk = await api(faculty.token, "GET",
      `/api/courses/${courseA.id}/ask?q=${encodeURIComponent("what assignment is due")}`);
    // FOUR for the owner, not three: the three on A1 that are not rejected,
    // plus the one on the REPLAYED lecture A5 -- the replay gate is applied to
    // students only, so an owner still sees their own unverified lecture. The
    // number is spelled out rather than written as "> student", because a
    // greater-than would keep passing if the pending item started leaking to
    // students and the owner's count rose for the wrong reason.
    check("CONTROL: ask offers the OWNER four units (pending and replayed included)",
      fAsk.json?.knowledgeUnitsAvailable === 4, fAsk.json?.knowledgeUnitsAvailable);
    check("CONTROL: and the owner's count strictly exceeds the student's",
      (fAsk.json?.knowledgeUnitsAvailable ?? 0) > (sAsk.json?.knowledgeUnitsAvailable ?? 0),
      { owner: fAsk.json?.knowledgeUnitsAvailable, student: sAsk.json?.knowledgeUnitsAvailable });

    // ------------------------------------------------------------------
    section("5. A non-owner cannot write: extract, transcribe, poll, review, delete");
    const writes: [string, string, unknown, string][] = [
      ["POST", `/api/lectures/${lectureA1}/extract`, {}, "extract"],
      ["POST", `/api/lectures/${lectureA1}/transcribe`, {}, "transcribe"],
      ["POST", `/api/lectures/${lectureA1}/poll`, {}, "poll"],
      ["POST", `/api/knowledge/${seeded.pending}/review`, { action: "confirm" }, "confirm a knowledge item"],
      ["POST", `/api/courses/${courseA.id}/context`, { kind: "note", title: "x", body: "y" }, "add course context"],
    ];
    for (const [method, path, body, label] of writes) {
      const r = await api(student.token, method, path, body);
      check(`an enrolled NON-OWNER cannot ${label}`, r.status === 403, { status: r.status, json: r.json });
    }
    // The verdict that was refused must not have landed anyway.
    const { data: pendingRow } = await svc
      .from("knowledge_items").select("status, reviewed_by").eq("id", seeded.pending).single();
    check("  ...and the refused review left the item pending", pendingRow?.status === "pending",
      pendingRow);
    check("  ...with no reviewer recorded", !pendingRow?.reviewed_by, pendingRow?.reviewed_by);

    // A candidate review needs a REAL candidate row, because `/api/candidates/
    // [id]/review` looks the row up before it checks ownership -- pointing the
    // test at a random uuid would earn a 404 that proves nothing about
    // authorization. Seeded directly rather than by running extraction: Layer 1
    // is deterministic but Layer 2 costs a model call this suite has no use for.
    const { data: cand, error: candErr } = await svc.from("extraction_candidates").insert({
      lecture_id: lectureA1, course_id: courseA.id,
      kind: "assignment", title: "QA candidate", detail: "Seeded for the ownership check.",
      evidence_start_ms: 1000, evidence_end_ms: 2000, evidence_text: "QA evidence sentence.",
      confidence: 0.9, extraction_method: "qa-fixture", extraction_version: "1",
    }).select("id").single();
    if (candErr || !cand) throw new Error(`could not seed a candidate: ${candErr?.message}`);

    const rCand = await api(student.token, "POST", `/api/candidates/${cand.id}/review`, { action: "confirm" });
    check("an enrolled NON-OWNER cannot review a candidate", rCand.status === 403,
      { status: rCand.status, json: rCand.json });
    const { count: reviewCount } = await svc.from("candidate_reviews")
      .select("id", { count: "exact", head: true }).eq("candidate_id", cand.id);
    check("  ...and no review row was written", (reviewCount ?? 0) === 0, reviewCount);
    // POSITIVE CONTROL: the owner's verdict IS accepted, so the 403 above is
    // authorization and not a route that rejects every caller.
    const fCand = await api(faculty.token, "POST", `/api/candidates/${cand.id}/review`, { action: "confirm" });
    check("CONTROL: the OWNER can review the same candidate", fCand.status === 200,
      { status: fCand.status, json: fCand.json });

    const sDel = await api(student.token, "DELETE", `/api/lectures/${lectureA3}`);
    check("an enrolled NON-OWNER cannot delete a lecture", sDel.status === 403, { status: sDel.status, json: sDel.json });
    const { data: survived } = await svc.from("lectures").select("id").eq("id", lectureA3).maybeSingle();
    check("  ...and the lecture STILL EXISTS after the refusal", !!survived);

    // POSITIVE CONTROL: the owner's delete works. Otherwise the 403 above could
    // be a route that refuses everyone.
    const fDel = await api(faculty.token, "DELETE", `/api/lectures/${lectureA3}`);
    check("CONTROL: the OWNER can delete the same lecture", fDel.status === 200, { status: fDel.status, json: fDel.json });
    const { data: goneNow } = await svc.from("lectures").select("id").eq("id", lectureA3).maybeSingle();
    check("CONTROL: ...and it is actually gone", !goneNow);

    // ------------------------------------------------------------------
    section("6. Lecture-scoped ask: a lectureId from ANOTHER course is refused");
    // This is the newest code on the path and the parameter is fully attacker-
    // controlled, so it gets the most adversarial treatment in the suite.
    const askB = await api(student.token, "GET",
      `/api/courses/${courseA.id}/ask?q=${encodeURIComponent("what did I miss")}&lectureId=${lectureB1}`);
    check("student: a lectureId from another course is refused", askB.status === 404,
      { status: askB.status, json: askB.json });
    check("  ...and no knowledge is returned with the refusal",
      !askB.json?.sources && !askB.json?.answer, askB.json);

    const askBf = await api(faculty.token, "GET",
      `/api/courses/${courseA.id}/ask?q=${encodeURIComponent("what did I miss")}&lectureId=${lectureB1}`);
    check("faculty: the same cross-course lectureId is refused even for the OWNER of both courses",
      askBf.status === 404, { status: askBf.status, json: askBf.json });

    const askGhost = await api(student.token, "GET",
      `/api/courses/${courseA.id}/ask?q=hi&lectureId=00000000-0000-0000-0000-000000000000`);
    check("a lectureId that exists nowhere is refused", askGhost.status === 404,
      { status: askGhost.status, json: askGhost.json });

    const askJunk = await api(student.token, "GET",
      `/api/courses/${courseA.id}/ask?q=hi&lectureId=${encodeURIComponent("' OR '1'='1")}`);
    check("a non-uuid lectureId does not return knowledge", askJunk.status !== 200,
      { status: askJunk.status, json: askJunk.json });
    check("  ...and does not crash the route with a 500", askJunk.status !== 500,
      { status: askJunk.status, json: askJunk.json });

    // POSITIVE CONTROL: the parameter WORKS when it is legitimate. Without this,
    // "404 for everything" would pass every check above.
    const askOk = await api(student.token, "GET",
      `/api/courses/${courseA.id}/ask?q=${encodeURIComponent("what did I miss")}&lectureId=${lectureA1}`);
    check("CONTROL: a lectureId from THIS course is accepted", askOk.status === 200,
      { status: askOk.status, json: askOk.json });
    check("CONTROL: ...and the answer is scoped to that lecture", askOk.json?.scope === "lecture",
      askOk.json?.scope);
    check("CONTROL: ...still filtered to the two student-visible units",
      askOk.json?.knowledgeUnitsAvailable === 2, askOk.json?.knowledgeUnitsAvailable);
    const askCourse = await api(student.token, "GET", `/api/courses/${courseA.id}/ask?q=hi`);
    check("CONTROL: omitting lectureId falls back to course scope", askCourse.json?.scope === "course",
      askCourse.json?.scope);
    const askEmpty = await api(student.token, "GET", `/api/courses/${courseA.id}/ask?q=hi&lectureId=`);
    check("an empty lectureId is treated as course scope, not as an error",
      askEmpty.status === 200 && askEmpty.json?.scope === "course",
      { status: askEmpty.status, scope: askEmpty.json?.scope });

    // A missing question is a 400, not a 500 and not an invented answer.
    const askNoQ = await api(student.token, "GET", `/api/courses/${courseA.id}/ask?q=`);
    check("an empty question is refused with 400", askNoQ.status === 400, { status: askNoQ.status, json: askNoQ.json });

  } finally {
    section("Cleanup");
    for (const id of created.courses) {
      const { error } = await svc.from("courses").delete().eq("id", id);
      console.log(`  ${error ? "FAILED to remove" : "removed"} course ${id}${error ? `: ${error.message}` : ""}`);
    }
  }

  section("Summary");
  console.log(`${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error("\nABORTED:", e.message, "\n", e.stack); process.exit(1); });
