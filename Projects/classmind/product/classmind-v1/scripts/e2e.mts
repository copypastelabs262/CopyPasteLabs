// End-to-end verification of the ClassMind V1 workflow, driven over HTTP
// against a running server exactly as a browser drives it.
//
// This exists because "lint, typecheck and build pass" says nothing about
// whether a faculty member can get from an upload to a student reading a
// confirmed deadline. Every numbered check below maps to a line of the V1
// definition of done, and the ones that matter most are the negative checks:
// an unconfirmed candidate must be unreachable by a student who knows the URL.
//
//   node --env-file=.env.local scripts/e2e.mts
//
// Requires the dev server on BASE and TRANSCRIPTION_PROVIDER=fixture, so no
// paid Sarvam call is made. Re-runnable: each run creates a fresh course and
// leaves earlier ones alone.

import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };
const STUDENT = { email: "student.test@classmind.local", password: "ClassMindTest!2026" };

// The lab object whose transcript the fixture provider replays. Uploading the
// matching audio means the transcript's timestamps line up with what you
// actually hear -- the difference between a demo and a screenshot.
const LAB_AUDIO_PATH = "ccf15fe1-9f7f-48dc-990a-4e16513fe354/original.mp3";
const LECTURE_FILENAME = "course-outline-en.mp3";

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
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 400));
}

function section(title: string) {
  console.log(`\n--- ${title} ---`);
}

const svc = createClient(PROJECT_URL, SERVICE, { auth: { persistSession: false } });

// Route payloads are read untyped on purpose. The whole job of this script is
// to assert on what the server ACTUALLY returns; giving the responses a local
// type would mean checking them against this file's beliefs instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

interface ApiResult {
  status: number;
  json: Payload;
}

async function api(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult> {
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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { nonJson: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function tokenFor(
  creds: { email: string; password: string },
  role: "faculty" | "student",
) {
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function marker(ms: number) {
  const m = String(Math.floor(ms / 60000)).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `[${m}:${s}]`;
}

async function main() {
  console.log(`ClassMind V1 end-to-end  ->  ${BASE}`);
  console.log(
    `transcription provider: ${process.env.TRANSCRIPTION_PROVIDER ?? "sarvam (LIVE -- this costs money)"}`,
  );

  section("1. Sign in");
  const faculty = await tokenFor(FACULTY, "faculty");
  const student = await tokenFor(STUDENT, "student");
  check("faculty signs in and has a profile", !!faculty.token);
  check("student signs in and has a profile", !!student.token);
  const anonCall = await api(null, "GET", "/api/courses");
  check("an unauthenticated request is rejected", anonCall.status === 401, anonCall.json);

  section("2-3. Create a course and add course context");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const created = await api(faculty.token, "POST", "/api/courses", {
    code: `E2E-${stamp.slice(11, 19)}`,
    title: "Engineering Thermodynamics",
    term: "Autumn 2026",
    transcriptionLanguage: "en-IN",
  });
  check("course is created", created.status === 200 && !!created.json?.course?.id, created.json);
  const course = created.json.course;
  check("course gets a join code", typeof course?.join_code === "string" && course.join_code.length > 0);

  const ctx = await api(faculty.token, "POST", `/api/courses/${course.id}/context`, {
    kind: "syllabus",
    title: "Course outline and assessment plan",
    body: [
      "Engineering Thermodynamics, first level course.",
      "Assessment: two class tests, one mid-semester examination and a final examination.",
      "Weekly tutorial sheets are to be submitted before the tutorial hour.",
      "Topics: zeroth law, first law, second law, entropy, properties of pure substances.",
    ].join("\n"),
  });
  check("course context is stored", ctx.status === 200 && !!ctx.json?.context?.id, ctx.json);

  section("4. Upload a lecture");
  const download = await svc.storage.from("audio").download(LAB_AUDIO_PATH);
  if (download.error || !download.data) {
    throw new Error(`Could not read lab audio: ${download.error?.message}`);
  }
  const bytes = await download.data.arrayBuffer();
  console.log(`        audio: ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`);

  const lec = await api(faculty.token, "POST", `/api/courses/${course.id}/lectures`, {
    title: "Lecture 1 - Course outline",
    originalFilename: LECTURE_FILENAME,
    fileSizeBytes: bytes.byteLength,
    contentType: "audio/mpeg",
  });
  check("lecture row and signed upload URL", lec.status === 200 && !!lec.json?.signedUrl, lec.json);
  const lectureId: string = lec.json.lectureId;

  const put = await fetch(lec.json.signedUrl, {
    method: "PUT",
    headers: { "content-type": "audio/mpeg" },
    body: bytes,
  });
  check("audio uploads to storage through the signed URL", put.ok, put.status);

  section("5. Processing status");
  const sub = await api(faculty.token, "POST", `/api/lectures/${lectureId}/transcribe`);
  check("transcription is submitted", sub.status === 200 && sub.json?.status === "transcribing", sub.json);
  check("the course's language was sent, not auto-detect", sub.json?.languageCode === "en-IN", sub.json);

  const firstPoll = await api(faculty.token, "POST", `/api/lectures/${lectureId}/poll`);
  check("an in-flight job reports `transcribing`", firstPoll.json?.status === "transcribing", firstPoll.json);

  let status = "transcribing";
  for (let i = 0; i < 60 && status === "transcribing"; i += 1) {
    await sleep(1000);
    const polled = await api(faculty.token, "POST", `/api/lectures/${lectureId}/poll`);
    status = polled.json?.status ?? "unknown";
  }
  check("the lecture reaches `transcribed`", status === "transcribed", status);

  section("6. Transcript, raw ASR and provenance");
  const view = await api(faculty.token, "GET", `/api/lectures/${lectureId}`);
  check("faculty can open the lecture", view.status === 200, view.json);
  const transcript = view.json?.transcript;
  check("a timestamped transcript is derived", !!transcript?.text && transcript.segments.length > 0);
  check("transcript carries [mm:ss] markers", /\[\d\d:\d\d\]/.test(transcript?.text ?? ""));
  check(
    "segments carry char offsets that slice back exactly",
    transcript.segments.every(
      (s: { charStart: number; charEnd: number; text: string }) =>
        transcript.text.slice(s.charStart, s.charEnd) === s.text,
    ),
  );
  console.log(`        ${transcript.segments.length} segments, ${transcript.text.length} chars`);

  const stored = await svc
    .from("lectures")
    .select("raw_transcription_response, provenance, storage_path, status")
    .eq("id", lectureId)
    .single();
  const row = stored.data as {
    raw_transcription_response: Record<string, unknown>;
    provenance: Record<string, unknown>;
    storage_path: string;
  };
  check("17. raw audio persists in storage", !!row?.storage_path);
  check("18. raw ASR response persists verbatim", typeof row?.raw_transcription_response?.transcript === "string");
  check("19. transcript is DERIVED at read time, never stored", !("transcript_normalized" in (row ?? {})));
  check("provenance is written alongside the transcript", !!row?.provenance?.engine);
  check(
    "provenance names the replay honestly",
    ((row?.provenance?.limitations as string[]) ?? []).some((l) => /REPLAYED/i.test(l)),
    row?.provenance?.limitations,
  );
  check("provenance records the configured language", row?.provenance?.configuredLanguage === "en-IN");

  section("7. Extract candidates");
  const extracted = await api(faculty.token, "POST", `/api/lectures/${lectureId}/extract`);
  check("extraction runs", extracted.status === 200, extracted.json);
  check("candidates were produced", (extracted.json?.candidateCount ?? 0) > 0, extracted.json);
  console.log(
    `        ${extracted.json?.candidateCount} candidates via ${extracted.json?.method} v${extracted.json?.version}`,
  );
  const again = await api(faculty.token, "POST", `/api/lectures/${lectureId}/extract`);
  check("re-running the same method does not duplicate", again.json?.skipped === true, again.json);

  section("8. Evidence");
  const withCands = await api(faculty.token, "GET", `/api/lectures/${lectureId}`);
  const candidates: Payload[] = withCands.json.candidates;
  check("faculty sees the candidate list", candidates.length > 0);
  check("every candidate carries evidence text", candidates.every((c) => !!c.evidence_text));
  check(
    "every candidate carries a timestamp anchor",
    candidates.every((c) => Number.isInteger(c.evidence_start_ms) && c.evidence_start_ms >= 0),
  );
  check(
    "evidence offsets resolve inside the transcript",
    candidates.every(
      (c) =>
        c.evidence_char_start === null ||
        withCands.json.transcript.text.slice(c.evidence_char_start, c.evidence_char_end).length > 0,
    ),
  );
  check(
    "every candidate names the method that produced it",
    candidates.every((c) => !!c.extraction_method && !!c.extraction_version),
  );
  check(
    "due phrases are verbatim, never silently resolved",
    candidates.every((c) => c.due_phrase === null || c.evidence_text.includes(c.due_phrase)),
  );
  for (const c of candidates.slice(0, 6)) {
    console.log(`        ${marker(c.evidence_start_ms)} ${c.kind}: ${c.title}`);
  }

  section("9. Confirm / edit / reject");
  check("at least three candidates, so all three verdicts can be exercised", candidates.length >= 3, candidates.length);
  if (candidates.length < 3) {
    // Stopping here would hide every check below it, and those are the ones
    // that prove a student cannot see unconfirmed work.
    throw new Error(`Only ${candidates.length} candidates; the review checks need three.`);
  }
  const [toConfirm, toEdit, toReject] = candidates;

  const rConfirm = await api(faculty.token, "POST", `/api/candidates/${toConfirm.id}/review`, {
    action: "confirm",
  });
  check("confirm is recorded", rConfirm.status === 200 && rConfirm.json?.review?.action === "confirm", rConfirm.json);

  const EDITED_TITLE = "Tutorial sheet submission (edited by faculty)";
  const rEdit = await api(faculty.token, "POST", `/api/candidates/${toEdit.id}/review`, {
    action: "edit",
    kind: "assignment",
    title: EDITED_TITLE,
    detail: "Tutorial sheets are submitted before the tutorial hour each week.",
    note: "Tightened the wording.",
  });
  check("edit is recorded", rEdit.status === 200 && rEdit.json?.review?.action === "edit", rEdit.json);

  const rReject = await api(faculty.token, "POST", `/api/candidates/${toReject.id}/review`, {
    action: "reject",
    note: "Not an academic instruction.",
  });
  check("reject is recorded", rReject.status === 200, rReject.json);

  const proposal = await svc
    .from("extraction_candidates")
    .select("title, detail")
    .eq("id", toEdit.id)
    .single();
  check("an edit never overwrites the machine's proposal", proposal.data?.title === toEdit.title, proposal.data);

  const rejects = await svc.from("candidate_reviews").select("id, action").eq("candidate_id", toReject.id);
  check(
    "a rejection is retained, not deleted",
    (rejects.data ?? []).length === 1 && rejects.data![0].action === "reject",
  );

  section("10. Confirmed course knowledge");
  const know = await api(faculty.token, "GET", `/api/courses/${course.id}/knowledge`);
  const items: Payload[] = know.json.items;
  check(
    "knowledge lists the confirmed item",
    items.some((i) => i.title === toConfirm.title),
    items.map((i) => i.title),
  );
  check("knowledge shows the EDITED wording, not the proposal", items.some((i) => i.title === EDITED_TITLE));
  check("24. the rejected item is absent", !items.some((i) => i.candidateId === toReject.id));
  check("24. unreviewed candidates are absent", items.length === 2, items.length);
  check(
    "every knowledge item keeps its provenance",
    items.every((i) => !!i.lectureId && Number.isInteger(i.evidenceStartMs) && !!i.evidenceText),
  );

  section("11-12. Student opens the course");
  const noAccess = await api(student.token, "GET", `/api/courses/${course.id}/knowledge`);
  check("a student who has not joined is refused", noAccess.status === 403, noAccess.json);

  const joined = await api(student.token, "POST", "/api/enroll", { joinCode: course.join_code });
  check("student joins with the code", joined.status === 200, joined.json);

  const sKnow = await api(student.token, "GET", `/api/courses/${course.id}/knowledge`);
  check("student sees confirmed knowledge", sKnow.status === 200 && sKnow.json.items.length === 2, sKnow.json);
  check("student sees the edited wording", sKnow.json.items.some((i: Payload) => i.title === EDITED_TITLE));

  section("13-14. Ask a grounded question");
  const ask = await api(
    student.token,
    "GET",
    `/api/courses/${course.id}/ask?q=${encodeURIComponent("what about the tutorial sheets?")}`,
  );
  check("ask returns an answer", ask.status === 200, ask.json);
  check(
    "the answer is grounded in confirmed items",
    ask.json?.answered === true && ask.json.items.length > 0,
    ask.json?.message,
  );
  const miss = await api(
    student.token,
    "GET",
    `/api/courses/${course.id}/ask?q=${encodeURIComponent("zzzz nonexistent topic qqqq")}`,
  );
  check("an unanswerable question says so rather than inventing", miss.json?.answered === false, miss.json?.message);

  section("15-16. Evidence and the source timestamp");
  const hit = ask.json.items[0];
  check("the answer carries its evidence text", !!hit?.evidenceText);
  check("the answer carries a lecture id and a timestamp", !!hit?.lectureId && Number.isInteger(hit?.evidenceStartMs));
  const sLecture = await api(student.token, "GET", `/api/lectures/${hit.lectureId}`);
  check("student can open the source lecture", sLecture.status === 200, sLecture.json);
  check("student gets the transcript", !!sLecture.json?.transcript?.text);
  check(
    "the cited timestamp lands inside the transcript",
    sLecture.json.transcript.segments.some(
      (s: { startMs: number; endMs: number }) =>
        hit.evidenceStartMs >= s.startMs && hit.evidenceStartMs <= s.endMs + 1,
    ),
    hit.evidenceStartMs,
  );
  check("student can play the audio at that point", !!sLecture.json?.audioUrl);

  section("24. No unverified information reaches students");
  check(
    "the student payload contains ZERO candidates",
    (sLecture.json.candidates ?? []).length === 0,
    sLecture.json.candidates?.length,
  );
  check("the student payload contains ZERO reviews", (sLecture.json.reviews ?? []).length === 0);
  check("isOwner is false for the student", sLecture.json.isOwner === false);

  const unreviewed = candidates[3] ?? toConfirm;
  const sReview = await api(student.token, "POST", `/api/candidates/${unreviewed.id}/review`, { action: "confirm" });
  check("a student cannot rule on a candidate", sReview.status === 403, sReview.json);
  const sExtract = await api(student.token, "POST", `/api/lectures/${lectureId}/extract`);
  check("a student cannot trigger extraction", sExtract.status === 403, sExtract.json);
  const sContext = await api(student.token, "POST", `/api/courses/${course.id}/context`, {
    kind: "note",
    title: "x",
    body: "y",
  });
  check("a student cannot write course context", sContext.status === 403, sContext.json);

  const anonDb = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  for (const table of ["extraction_candidates", "lectures", "courses", "candidate_reviews"]) {
    const probe = await anonDb.from(table).select("id").limit(1);
    check(`the anon key cannot read ${table} directly`, (probe.data ?? []).length === 0 || !!probe.error);
  }

  section("Course Context did not contaminate the transcription layer");
  check(
    "the raw ASR response contains nothing from the syllabus",
    !JSON.stringify(row.raw_transcription_response).includes("Assessment: two class tests"),
  );
  check(
    "provenance decodingParams mention no course context",
    !JSON.stringify(row.provenance).toLowerCase().includes("syllabus"),
  );

  section("Summary");
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log("  FAILED: " + f));
    process.exitCode = 1;
  }
  console.log(`\nCourse:  ${BASE}/courses/${course.id}`);
  console.log(`Lecture: ${BASE}/courses/${course.id}/lectures/${lectureId}`);
  console.log(`Join code: ${course.join_code}`);
}

main().catch((err) => {
  console.error("\nE2E ABORTED:", err);
  process.exitCode = 1;
});
