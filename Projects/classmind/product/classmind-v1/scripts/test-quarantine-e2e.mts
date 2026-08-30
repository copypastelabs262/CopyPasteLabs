// End-to-end verification that a bad transcript is QUARANTINED, driven over
// HTTP against a running server exactly as a browser drives it.
//
//   TRANSCRIPTION_PROVIDER=fixture node --env-file=.env.local scripts/test-quarantine-e2e.mts
//
// Why this exists separately from test-transcript-guard.mts: that suite proves
// the guard's JUDGEMENT is right, on real transcripts, as a pure function. It
// says nothing about whether the pipeline ACTS on that judgement. The failure
// on 2026-08-22 was not a guard that judged wrongly -- for the last part of it,
// the guard was never consulted, and when it was, nothing read the answer.
//
// So every check below goes through the real route handlers, the real database
// and the real auth, and the important ones are NEGATIVE: an extraction that
// must not run, knowledge that must not exist, a student who must not be able
// to reach it by knowing the URL.
//
// The lecture is uploaded as fft-lecture-misdetected.mp3, so the fixture
// provider replays the captured Sarvam response that returned fluent romanized
// ARABIC for an English DSP lecture while reporting language_code "en-IN".
// That is a real provider response, not a synthesised one.

import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };
const STUDENT = { email: "student.test@classmind.local", password: "ClassMindTest!2026" };

// Any real audio object will do: the fixture provider chooses its transcript
// from the FILENAME, not from the bytes. The bytes still travel the real
// upload path so nothing about the flow is skipped.
const LAB_AUDIO_PATH = "ccf15fe1-9f7f-48dc-990a-4e16513fe354/original.mp3";

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

async function uploadLecture(
  facultyToken: string, courseId: string, filename: string, title: string,
) {
  const download = await svc.storage.from("audio").download(LAB_AUDIO_PATH);
  if (download.error || !download.data) throw new Error(`Cannot read lab audio: ${download.error?.message}`);
  const bytes = await download.data.arrayBuffer();

  const lec = await api(facultyToken, "POST", `/api/courses/${courseId}/lectures`, {
    title, originalFilename: filename,
    fileSizeBytes: bytes.byteLength, contentType: "audio/mpeg",
  });
  if (lec.status !== 200 || !lec.json?.signedUrl) throw new Error(`lecture create failed: ${JSON.stringify(lec.json)}`);
  const put = await fetch(lec.json.signedUrl, {
    method: "PUT", headers: { "content-type": "audio/mpeg" }, body: bytes,
  });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);
  return lec.json.lectureId as string;
}

// Drives transcribe -> poll to a terminal state, exactly as the browser does.
async function runToTerminal(token: string, lectureId: string) {
  const sub = await api(token, "POST", `/api/lectures/${lectureId}/transcribe`);
  if (sub.status !== 200) throw new Error(`transcribe failed: ${JSON.stringify(sub.json)}`);
  for (let i = 0; i < 30; i += 1) {
    const p = await api(token, "POST", `/api/lectures/${lectureId}/poll`);
    const st = p.json?.status;
    if (st && !["transcribing", "uploaded"].includes(st)) return p;
    await sleep(1000);
  }
  throw new Error("polling never reached a terminal state");
}

async function main() {
  console.log(`Quarantine end-to-end  ->  ${BASE}`);
  console.log(`provider: ${process.env.TRANSCRIPTION_PROVIDER ?? "sarvam (LIVE)"}`);
  if (process.env.TRANSCRIPTION_PROVIDER !== "fixture") {
    throw new Error("Run with TRANSCRIPTION_PROVIDER=fixture: this test needs the captured Arabic response.");
  }

  section("0. Setup");
  const faculty = await tokenFor(FACULTY, "faculty");
  const student = await tokenFor(STUDENT, "student");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const created = await api(faculty.token, "POST", "/api/courses", {
    code: `QTN-${stamp.slice(11, 19)}`, title: "Digital Signal Processing",
    term: "Autumn 2026", transcriptionLanguage: "en-IN",
  });
  check("course created", created.status === 200 && !!created.json?.course?.id, created.json);
  const course = created.json.course;
  const enrol = await api(student.token, "POST", "/api/enroll", { joinCode: course.join_code });
  check("student is enrolled", enrol.status === 200, enrol.json);

  section("1. A BAD transcript is quarantined by the real pipeline");
  const badId = await uploadLecture(
    faculty.token, course.id, "fft-lecture-misdetected.mp3", "Lecture 1 - 8-point DIT FFT",
  );
  const badPoll = await runToTerminal(faculty.token, badId);
  check(
    "poll reports status 'quarantined', not 'transcribed'",
    badPoll.json?.status === "quarantined", badPoll.json,
  );
  check(
    "poll returns the verdict so a UI can explain it",
    badPoll.json?.validation?.verdict === "reject" &&
      badPoll.json?.validation?.code === "not_a_supported_language",
    badPoll.json?.validation,
  );

  const { data: badRow } = await svc.from("lectures")
    .select("status, raw_transcription_response, provenance, transcript_validation, error_message")
    .eq("id", badId).single();
  check("the row PERSISTED with status = quarantined", badRow?.status === "quarantined", badRow?.status);
  check(
    "the raw transcript is RETAINED as evidence, not deleted",
    !!badRow?.raw_transcription_response, typeof badRow?.raw_transcription_response,
  );
  check("provenance was written alongside it", !!badRow?.provenance);
  check(
    "the verdict is stored on the row",
    (badRow?.transcript_validation as Payload)?.verdict === "reject",
    badRow?.transcript_validation,
  );
  check("a human-readable reason is stored", typeof badRow?.error_message === "string" && badRow.error_message.length > 20);

  section("2. Quarantine BLOCKS extraction and knowledge storage");
  const ext = await api(faculty.token, "POST", `/api/lectures/${badId}/extract`);
  check("extraction is REFUSED with 409", ext.status === 409, { status: ext.status, json: ext.json });
  check("the refusal names the quarantine", /quarantined/i.test(JSON.stringify(ext.json)), ext.json);

  const { count: candCount } = await svc.from("extraction_candidates")
    .select("id", { count: "exact", head: true }).eq("lecture_id", badId);
  check("NO extraction candidates were written", candCount === 0, candCount);

  const { count: knowCount } = await svc.from("knowledge_items")
    .select("id", { count: "exact", head: true }).eq("lecture_id", badId);
  check("NO knowledge items were written", knowCount === 0, knowCount);

  const { count: evCount } = await svc.from("knowledge_evidence")
    .select("id", { count: "exact", head: true }).eq("lecture_id", badId);
  check("NO knowledge evidence was written", evCount === 0, evCount);

  const { data: afterExtract } = await svc.from("lectures").select("status").eq("id", badId).single();
  check("the lecture is STILL quarantined -- extract did not promote it to ready",
    afterExtract?.status === "quarantined", afterExtract?.status);

  section("3. A student cannot reach it, even knowing the URL");
  const sKnow = await api(student.token, "GET", `/api/courses/${course.id}/knowledge`);
  check("course knowledge is empty for the student", (sKnow.json?.items ?? []).length === 0, sKnow.json);

  const sLecKnow = await api(student.token, "GET", `/api/lectures/${badId}/knowledge`);
  check(
    "the quarantined lecture yields no knowledge to a student",
    sLecKnow.status !== 200 || (sLecKnow.json?.units ?? []).length === 0,
    { status: sLecKnow.status, json: sLecKnow.json },
  );

  const ask = await api(student.token, "GET", `/api/courses/${course.id}/ask?q=${encodeURIComponent("What was taught in this lecture?")}`);
  check(
    "asking a question returns NO answer grounded in the quarantined lecture",
    (ask.json?.sources ?? []).length === 0,
    { answered: ask.json?.answered, sources: (ask.json?.sources ?? []).length },
  );

  section("4. The SAME pipeline still works for a good transcript (no over-blocking)");
  const goodId = await uploadLecture(
    faculty.token, course.id, "cloud-computing-hinglish.mp3", "Lecture 2 - Cloud control layer",
  );
  const goodPoll = await runToTerminal(faculty.token, goodId);
  check("a genuine Hinglish lecture reaches 'transcribed'", goodPoll.json?.status === "transcribed", goodPoll.json);

  const { data: goodRow } = await svc.from("lectures")
    .select("status, transcript_validation").eq("id", goodId).single();
  check("its stored verdict is 'pass'",
    (goodRow?.transcript_validation as Payload)?.verdict === "pass", goodRow?.transcript_validation);

  const goodExt = await api(faculty.token, "POST", `/api/lectures/${goodId}/extract`);
  check("extraction RUNS for it", goodExt.status === 200, { status: goodExt.status, error: goodExt.json?.error });
  check("and it produced candidates", (goodExt.json?.candidateCount ?? 0) > 0, goodExt.json?.candidateCount);

  const { data: goodAfter } = await svc.from("lectures").select("status").eq("id", goodId).single();
  check("the good lecture reaches 'ready'", goodAfter?.status === "ready", goodAfter?.status);

  section("5. The student checks again, now that GOOD knowledge exists");
  // Section 3 ran when the course held nothing but the quarantined lecture, so
  // "the student sees no knowledge" passed trivially -- it would have passed
  // with the filter deleted. These checks are the discriminating ones: the
  // student must now see the good lecture AND still not see the quarantined
  // one, from the same call. A filter that returns nothing is not the same as
  // a filter that returns the right thing.
  const sKnow2 = await api(student.token, "GET", `/api/courses/${course.id}/knowledge`);
  const sUnits = await api(student.token, "GET", `/api/lectures/${goodId}/knowledge`);
  const goodUnits: Payload[] = sUnits.json?.units ?? [];
  check(
    "the student CAN now see knowledge from the good lecture (the path works)",
    goodUnits.length > 0,
    { status: sUnits.status, count: goodUnits.length },
  );
  check(
    "and NONE of it comes from the quarantined lecture",
    goodUnits.every((u: Payload) => u.lectureId !== badId),
    goodUnits.map((u: Payload) => u.lectureId),
  );

  const ask2 = await api(student.token, "GET", `/api/courses/${course.id}/ask?q=${encodeURIComponent("What was taught in this course?")}`);
  const sources: Payload[] = ask2.json?.sources ?? [];
  check(
    "asking a question now returns a grounded answer (retrieval is alive)",
    sources.length > 0 || ask2.json?.knowledgeUnitsAvailable > 0,
    { sources: sources.length, available: ask2.json?.knowledgeUnitsAvailable },
  );
  check(
    "and NO cited source is the quarantined lecture",
    sources.every((x: Payload) => x.lectureId !== badId),
    sources.map((x: Payload) => x.lectureId),
  );

  // The faculty-facing course view must exclude it too: courseKnowledge() is a
  // different code path from readKnowledge() and was patched separately.
  const fKnow = await api(faculty.token, "GET", `/api/courses/${course.id}/knowledge`);
  check(
    "the confirmed-candidate view excludes the quarantined lecture as well",
    (fKnow.json?.items ?? []).every((x: Payload) => x.lectureId !== badId),
    (fKnow.json?.items ?? []).map((x: Payload) => x.lectureId),
  );

  // Direct-URL access to the quarantined lecture itself, by a student who
  // knows the id. It must not hand back a transcript to read.
  const sLec = await api(student.token, "GET", `/api/lectures/${badId}`);
  check(
    "a student fetching the quarantined lecture directly gets no transcript",
    sLec.status !== 200 || !sLec.json?.transcript?.text,
    { status: sLec.status, hasTranscript: !!sLec.json?.transcript?.text },
  );
  section("Summary");
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) { for (const f of failures) console.log(`  - ${f}`); }
  console.log(`\ncourse: ${course.id}\nquarantined lecture: ${badId}\ngood lecture: ${goodId}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error("\nABORTED:", e.message); process.exit(1); });
