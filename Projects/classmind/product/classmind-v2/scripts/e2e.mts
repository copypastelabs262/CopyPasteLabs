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
// Requires the dev server on BASE. No paid Sarvam call is made, because the
// lecture is created with `replayFixture: "course-outline-en"` -- an EXPLICIT,
// per-lecture request for a captured response. It used to be driven by
// `TRANSCRIPTION_PROVIDER=fixture` plus a file NAMED after the fixture it
// wanted, which is the mechanism that served a thermodynamics transcript to a
// lecture called "Cloud computing.mp3" on 2026-08-22. Both are gone.
//
// The upload below is deliberately named something that matches NO fixture
// slug, so this suite also demonstrates that the filename no longer selects
// anything: the transcript that arrives is the one that was asked for by name.
//
// Re-runnable: each run creates a fresh course and leaves earlier ones alone.

import { createHash } from "node:crypto";
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
// Names no fixture. Nothing keys off it any more, and this suite proves it.
const LECTURE_FILENAME = "Week 1 - opening session.mp3";
// The transcript this run expects, named rather than hoped for.
const REPLAY_FIXTURE = "course-outline-en";

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
// ---------------------------------------------------------------------------
// THE COST GUARD
// ---------------------------------------------------------------------------
//
// Reports what this run ACTUALLY did, and refuses to continue if a replay this
// suite asked for did not stick.
//
// It replaces a header line that read the now-dead TRANSCRIPTION_PROVIDER and
// therefore printed an environment variable nobody consults. That line could
// say "fixture" while the run billed Sarvam, or "sarvam (LIVE)" while it
// replayed -- a status line that states the opposite of the truth, which is the
// same defect as a guard that echoes its own configuration back at itself.
//
// Read back from the database, not from the response that asked for it. While
// migration 20260830150000 is unapplied the column does not exist; that case is
// NAMED and falls back to the API's own confirmation plus its explicit
// "process-memory" persistence flag. It never falls back to silence.
async function assertReplayStuck(
  lectureId: string,
  expected: string,
  createResponse: { replayFixture?: unknown; replayPersistence?: unknown } | null,
  label = "",
): Promise<void> {
  const refuse = (why: string) => {
    throw new Error(
      `Refusing to continue: this run is making live paid transcription calls. ${why}` +
      ` (lecture ${lectureId}, expected replay "${expected}")`,
    );
  };
  const { data, error } = await svc
    .from("lectures").select("replay_fixture_slug").eq("id", lectureId).maybeSingle();

  if (error) {
    const missingColumn = /replay_fixture_slug/.test(error.message) &&
      (error.code === "42703" || /does not exist/i.test(error.message));
    if (!missingColumn) refuse(`could not read the lecture back: ${error.message}.`);
    if (createResponse?.replayFixture !== expected) {
      refuse("the API did not record the replay.");
    }
    if (createResponse?.replayPersistence !== "process-memory") {
      refuse("the replay column is missing and the API did not fall back to process memory.");
    }
    console.log(
      `        transcription${label}: REPLAY of "${expected}" (server memory only -- ` +
      "migration 20260830150000_audio_identity.sql is NOT applied)",
    );
    return;
  }

  const stored = (data as { replay_fixture_slug?: string | null } | null)?.replay_fixture_slug ?? null;
  if (stored !== expected) refuse(`the row says replay_fixture_slug=${JSON.stringify(stored)}.`);
  console.log(`        transcription${label}: REPLAY of "${expected}" (recorded on the row)`);
}





// ---------------------------------------------------------------------------
// Extraction outlives Node's fetch timeout
// ---------------------------------------------------------------------------
//
// The extract route runs a multi-call reasoning pass over the whole transcript.
// On a 15,000-character lecture, with anything else sharing the model endpoint,
// it regularly takes longer than 300 seconds -- which is undici's
// `headersTimeout`, a CLIENT-side limit with no public knob in Node and no
// relation whatsoever to whether the server succeeded.
//
// Measured, not assumed: a run whose client aborted here left the lecture
// `ready` with 22 candidates and 3 knowledge items. Reporting that as a failure
// would be the suite mistaking its own impatience for a product defect.
//
// Retrying does not help, because every call redoes the reasoning -- knowledge
// is replaced wholesale on each pass, which section 7 relies on. So the ONE
// long request is issued over node:http instead, which imposes no such
// deadline. Built in; no dependency is added. Everything else still goes
// through fetch, and every assertion is still made against exactly what the
// server returned.
function postLongRunning(
  token: string,
  path: string,
): Promise<{ status: number; json: Payload }> {
  const url = new URL(BASE + path);
  return new Promise((resolve, reject) => {
    void (async () => {
      const transport = url.protocol === "https:" ? await import("node:https") : await import("node:http");
      const req = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            let json: Payload = null;
            try { json = body ? JSON.parse(body) : null; } catch { json = { nonJson: body.slice(0, 300) }; }
            resolve({ status: res.statusCode ?? 0, json });
          });
        },
      );
      req.on("error", reject);
      req.end();
    })().catch(reject);
  });
}

function marker(ms: number) {
  const m = String(Math.floor(ms / 60000)).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `[${m}:${s}]`;
}

async function main() {
  console.log(`ClassMind V1 end-to-end  ->  ${BASE}`);
  console.log(`transcription requested: replay of fixture "${REPLAY_FIXTURE}"`);
  console.log("        (what actually happened is printed after the lecture is created)");

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

  // The digest the create route now requires. It is the browser's claim, and
  // the server re-computes it over the bytes it hands the engine.
  const checksumSha256 = createHash("sha256").update(Buffer.from(bytes)).digest("hex");

  const lec = await api(faculty.token, "POST", `/api/courses/${course.id}/lectures`, {
    title: "Lecture 1 - Course outline",
    originalFilename: LECTURE_FILENAME,
    fileSizeBytes: bytes.byteLength,
    contentType: "audio/mpeg",
    checksumSha256,
    replayFixture: REPLAY_FIXTURE,
  });
  check("lecture row and signed upload URL", lec.status === 200 && !!lec.json?.signedUrl, lec.json);
  check(
    "the replay is recorded against THIS lecture, by name",
    lec.json?.replayFixture === REPLAY_FIXTURE,
    lec.json?.replayFixture,
  );
  const lectureId: string = lec.json.lectureId;
  await assertReplayStuck(lectureId, REPLAY_FIXTURE, lec.json);

  // A lecture that names no fixture must not be replayable, whatever it is
  // called. Named after a real fixture slug on purpose: under the old
  // mechanism that filename alone chose the transcript.
  const noReplay = await api(faculty.token, "POST", `/api/courses/${course.id}/lectures`, {
    title: "Control - filename must not select a fixture",
    originalFilename: "course-outline-en.mp3",
    fileSizeBytes: 4096,
    contentType: "audio/mpeg",
    checksumSha256: createHash("sha256").update("control").digest("hex"),
  });
  check(
    "a lecture created without naming a fixture records no replay",
    noReplay.status === 200 && noReplay.json?.replayFixture === null,
    { status: noReplay.status, replayFixture: noReplay.json?.replayFixture },
  );

  const missingChecksum = await api(faculty.token, "POST", `/api/courses/${course.id}/lectures`, {
    title: "Control - no checksum",
    originalFilename: "x.mp3",
    fileSizeBytes: 4096,
    contentType: "audio/mpeg",
  });
  check(
    "an upload with no checksum claim is refused with 400",
    missingChecksum.status === 400 && /checksumSha256/.test(JSON.stringify(missingChecksum.json)),
    { status: missingChecksum.status, json: missingChecksum.json },
  );

  const put = await fetch(lec.json.signedUrl, {
    method: "PUT",
    headers: { "content-type": "audio/mpeg" },
    body: bytes,
  });
  check("audio uploads to storage through the signed URL", put.ok, put.status);

  section("5. Processing status");
  // expectReplay can only cause a refusal, never a replay: it asserts that the
  // replay this suite asked for is still known to the server, so a lost request
  // aborts instead of quietly making a billable live call.
  const sub = await api(faculty.token, "POST", `/api/lectures/${lectureId}/transcribe`, {
    expectReplay: true,
  });
  check("transcription is submitted", sub.status === 200 && sub.json?.status === "transcribing", sub.json);
  check("the course's language was sent, not auto-detect", sub.json?.languageCode === "en-IN", sub.json);
  check(
    "the server hashed the bytes it actually sent, and they match the claim",
    sub.json?.audioIdentity?.code !== "stored_audio_mismatch" &&
      sub.json?.audioIdentity?.code !== "declared_size_mismatch",
    sub.json?.audioIdentity,
  );
  check(
    "the identity verdict is reported even when it cannot be stored",
    typeof sub.json?.audioIdentity?.verdict === "string",
    sub.json?.audioIdentity,
  );

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
  // The transcript that arrived is the one this run NAMED -- not one derived
  // from the filename, which matches no fixture at all.
  check(
    "the replayed transcript is the fixture that was named, not one chosen by filename",
    (row?.provenance?.decodingParams as Payload)?.replayFixtureSlug === REPLAY_FIXTURE,
    (row?.provenance?.decodingParams as Payload)?.replayFixtureSlug,
  );

  section("7. Extract candidates");
  const extracted = await postLongRunning(faculty.token, `/api/lectures/${lectureId}/extract`);
  check("extraction runs", extracted.status === 200, extracted.json);
  check("candidates were produced", (extracted.json?.candidateCount ?? 0) > 0, extracted.json);
  console.log(
    `        ${extracted.json?.candidateCount} candidates via ${extracted.json?.method} v${extracted.json?.version}`,
  );
  // RE-RUNNING MUST NOT DUPLICATE, and the only witness worth trusting is the
  // database. This previously asserted `again.json.skipped === true`; the
  // extract route has never returned a `skipped` key, so the check could not
  // pass and the duplicate property was in practice unverified.
  //
  // Counted rather than inferred, and counted on BOTH tables, because they
  // duplicate for different reasons: candidates are immutable and guarded by a
  // method+version lookup, while knowledge is replaced wholesale on every pass.
  const countRows = async (table: string) => {
    const { count } = await svc
      .from(table).select("id", { count: "exact", head: true }).eq("lecture_id", lectureId);
    return count ?? 0;
  };
  const candsBefore = await countRows("extraction_candidates");
  const knowBefore = await countRows("knowledge_items");

  const again = await postLongRunning(faculty.token, `/api/lectures/${lectureId}/extract`);
  check("re-running extraction succeeds", again.status === 200, again.json);

  const candsAfter = await countRows("extraction_candidates");
  const knowAfter = await countRows("knowledge_items");
  console.log(`        candidates ${candsBefore} -> ${candsAfter}, knowledge ${knowBefore} -> ${knowAfter}`);
  check(
    "re-running the same method+version adds NO new candidate rows",
    candsAfter === candsBefore,
    { before: candsBefore, after: candsAfter },
  );
  check(
    "re-running does not accumulate knowledge items",
    knowAfter <= knowBefore || knowBefore === 0,
    { before: knowBefore, after: knowAfter },
  );

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
  // The ask route answers with `sources`, not `items`. It returned `items` when
  // this script was written on 2026-08-22; f0fc84e rewrote the route on 08-24 to
  // compose a grounded answer and renamed the field, and nothing re-ran this
  // suite. `ask.json.items.length` then threw on undefined, which is not a
  // failing check but an ABORT -- sections 15-16 below have never executed since.
  const sources: Payload[] = ask.json?.sources ?? [];
  check(
    "the answer is grounded in confirmed items",
    ask.json?.answered === true && sources.length > 0,
    { answered: ask.json?.answered, sources: sources.length, available: ask.json?.knowledgeUnitsAvailable },
  );
  const miss = await api(
    student.token,
    "GET",
    `/api/courses/${course.id}/ask?q=${encodeURIComponent("zzzz nonexistent topic qqqq")}`,
  );
  check(
    "an unanswerable question says so rather than inventing",
    miss.json?.answered === false,
    { answered: miss.json?.answered, answer: miss.json?.answer, sources: (miss.json?.sources ?? []).length },
  );

  section("15-16. Evidence and the source timestamp");
  // A source carries its evidence as a LIST of spans, each with its own
  // timestamps and quote -- one reconstructed unit can be assembled from
  // several sentences, which is the entire point of the reconstruction layer.
  const hit = sources[0];
  const span = hit?.evidence?.[0];
  check("the answer carries its evidence text", !!span?.quote, span);
  check(
    "the answer carries a lecture id and a timestamp",
    !!hit?.lectureId && Number.isInteger(span?.startMs),
    { lectureId: hit?.lectureId, startMs: span?.startMs },
  );
  const sLecture = await api(student.token, "GET", `/api/lectures/${hit.lectureId}`);
  check("student can open the source lecture", sLecture.status === 200, sLecture.json);
  check("student gets the transcript", !!sLecture.json?.transcript?.text);
  check(
    "the cited timestamp lands inside the transcript",
    sLecture.json.transcript.segments.some(
      (s: { startMs: number; endMs: number }) =>
        span.startMs >= s.startMs && span.startMs <= s.endMs + 1,
    ),
    span?.startMs,
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
