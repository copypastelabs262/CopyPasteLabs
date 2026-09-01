// REGRESSION SUITE for the read-time replay gate.
//
//   node --env-file=.env.local scripts/test-replay-gate.mts
//
// WHAT IS BEING PROVED
//
// On 2026-08-22 lecture 5ced44b6-e156-4ddb-9146-14035d366620 ("Cloud
// computing.mp3") was stored `ready` holding the transcript of an engineering
// THERMODYNAMICS course outline replayed from a Lab v0 run. It is still `ready`
// today, retained unmodified as evidence, and until this gate existed a student
// could read the whole of it. 41 of the 49 lectures in production carry the
// same replayed engine.
//
// Nothing here modifies a historical row. Part 1 reads production READ-ONLY and
// asserts the predicate's judgement on rows that already exist, including
// 5ced44b6 itself. Part 2 creates its own course, its own lectures and its own
// knowledge, drives the real routes over real HTTP with real auth, and deletes
// only what it created.
//
// THE ASSERTIONS THAT MATTER MOST ARE THE POSITIVE ONES. A suite made only of
// "the student got nothing" passes just as well when the whole product is
// broken. So every negative below is paired: the genuine lecture must stay
// fully visible to the student, and the owner must still see the replayed
// lecture's transcript and knowledge in full -- it is their evidence.
//
// THE STRONG TEST is /ask. The replayed transcript contains a coined word that
// appears nowhere else in the database. The student asks a question built from
// that word and must get nothing; the OWNER asks the identical question and
// must get the replayed unit back. Without that pair, "fewer results" would be
// indistinguishable from "the right results excluded".

import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { replayVerdict, isReplayedOrUnverifiable } from "../src/lib/provenance/replay.ts";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3300";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };
const STUDENT = { email: "student.test@classmind.local", password: "ClassMindTest!2026" };

// The contaminated production row, named so the suite fails loudly if anyone
// ever "fixes" it. It is evidence and must stay exactly as it is.
const CONTAMINATED_LECTURE = "5ced44b6-e156-4ddb-9146-14035d366620";
// A genuine live Sarvam lecture in the same production database. The gate must
// leave it alone; if this ever flips to hidden the rule is too broad.
const GENUINE_LECTURE = "dfd7312d-8baf-44bc-8dcb-b9608d28e9d3";

// A word that exists in no lecture, no transcript and no knowledge unit
// anywhere -- until this run writes it into the REPLAYED lecture only. Any
// route that echoes it back to a student has leaked replayed content.
const NONCE = "quenzoril";
// The genuine lecture's own distinctive term, for the positive controls.
const GENUINE_TERM = "brayton";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed += 1; console.log(`  PASS  ${label}`); return; }
  failures.push(label);
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 600));
}
function section(title: string) { console.log(`\n--- ${title} ---`); }

const svc = createClient(PROJECT_URL, SERVICE, { auth: { persistSession: false } });

// Route payloads are read untyped on purpose: this script must assert on what
// the server ACTUALLY returns, not on what a local type says it should.
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
  return { status: res.status, json, text };
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

// ---------------------------------------------------------------------------
// PART 1 -- the predicate, as a pure function
// ---------------------------------------------------------------------------

// The exact provenance of the contaminated production row, copied verbatim.
const FIXTURE_REPLAY_PROVENANCE = {
  engine: "fixture-replay",
  language: "en-IN",
  apiVersion: "sarvam-batch-v1 (replayed)",
  commitHash: "e9b71e569ca44b21d249915f63d88ec03720353a",
  limitations: [
    "REPLAYED, NOT TRANSCRIBED. No live ASR call was made; this response was captured from Lab v0 RUN 1 on 2026-08-21 and is being replayed by TRANSCRIPTION_PROVIDER=fixture.",
    "The audio stored against this lecture is NOT the audio that produced this transcript.",
  ],
  processedAt: "2026-08-22T12:46:00.991Z",
  modelVersion: "saarika:v2.5",
  modelSnapshot: "saarika:v2.5 (replayed from Lab v0 RUN 1, 2026-08-21)",
  decodingParams: { model: "saarika:v2.5", replayed: true, language_code: "hi-IN" },
  configuredLanguage: "hi-IN",
};

// The exact provenance of a genuine live Sarvam row, copied verbatim.
const SARVAM_PROVENANCE = {
  engine: "sarvam",
  language: "hi-IN",
  lectureId: GENUINE_LECTURE,
  apiVersion: "speech-to-text/job/v1",
  commitHash: "63d3fb4d2640a86f416829731bcce000a937aac0",
  limitations: [
    "Sarvam exposes only the floating model alias saaras:v3; no dated model snapshot is published, so the dated-snapshot requirement in Constitution IV is unmet and this transcript is not pinned to an immutable model version.",
    "Sarvam returns no cost figure for a batch job; costEstimate is null.",
  ],
  processedAt: "2026-08-22T13:09:20.350Z",
  modelVersion: "saaras:v3",
  modelSnapshot: "saaras:v3",
  providerJobId: "20260822_1e44ad2c-5bf3-419b-92e8-8704c2e773ca",
  decodingParams: { mode: "translit", model: "saaras:v3", language_code: "hi-IN" },
  configuredLanguage: "hi-IN",
};
const SARVAM_JOB_ID = "20260822_1e44ad2c-5bf3-419b-92e8-8704c2e773ca";

function unitTests() {
  section("1. The predicate, unit-tested on every shape");

  const cases: { label: string; facts: Parameters<typeof replayVerdict>[0]; hidden: boolean; code?: string }[] = [
    {
      label: "fixture-replay provenance is hidden",
      facts: { provenance: FIXTURE_REPLAY_PROVENANCE, providerJobId: "fixture:course-outline-en:1787402755651" },
      hidden: true, code: "replay_engine",
    },
    {
      label: "a fixture: job id is hidden even with otherwise genuine provenance",
      facts: { provenance: SARVAM_PROVENANCE, providerJobId: "fixture:course-outline-en:1787402755651" },
      hidden: true, code: "replay_job_id",
    },
    {
      label: "a seed: job id is hidden",
      facts: { provenance: SARVAM_PROVENANCE, providerJobId: "seed:thermo-week-2" },
      hidden: true, code: "replay_job_id",
    },
    {
      label: "absent provenance on a lecture with a transcript is hidden (fail closed)",
      facts: { provenance: null, providerJobId: null },
      hidden: true, code: "provenance_missing",
    },
    {
      label: "an empty provenance object is hidden (fail closed)",
      facts: { provenance: {}, providerJobId: null },
      hidden: true, code: "provenance_missing",
    },
    {
      label: "an UNKNOWN engine string is hidden (fail closed -- the future-engine case)",
      facts: { provenance: { ...SARVAM_PROVENANCE, engine: "whisper-large-v3" }, providerJobId: "wjob_9912" },
      hidden: true, code: "provenance_engine_unrecognised",
    },
    {
      label: "an engine that merely CONTAINS a replay marker is hidden",
      facts: { provenance: { ...SARVAM_PROVENANCE, engine: "sarvam-fixture" }, providerJobId: SARVAM_JOB_ID },
      hidden: true, code: "replay_engine",
    },
    {
      label: "decodingParams.replayed is hidden even under a genuine engine name",
      facts: {
        provenance: { ...SARVAM_PROVENANCE, decodingParams: { model: "saaras:v3", replayed: true } },
        providerJobId: SARVAM_JOB_ID,
      },
      hidden: true, code: "replay_decoding_params",
    },
    {
      label: "a provenance limitation confessing replay is hidden",
      facts: {
        provenance: {
          ...SARVAM_PROVENANCE,
          limitations: ["The audio stored against this lecture is NOT the audio that produced this transcript."],
        },
        providerJobId: SARVAM_JOB_ID,
      },
      hidden: true, code: "replay_limitation",
    },
    {
      label: "replay_fixture_slug is hidden (the column migration 20260830150000 adds)",
      facts: { provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID, replayFixtureSlug: "course-outline-en" },
      hidden: true, code: "replay_fixture_slug",
    },
    {
      label: "A GENUINE SARVAM LECTURE IS VISIBLE (the control that stops the rule eating everything)",
      facts: { provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID },
      hidden: false,
    },
    {
      label: "a genuine lecture is still visible when audio_identity is ABSENT (today's schema)",
      facts: { provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID, audioIdentity: undefined },
      hidden: false,
    },
    {
      label: "a genuine lecture is still visible when audio_identity is null",
      facts: { provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID, audioIdentity: null },
      hidden: false,
    },
    {
      label: "FUTURE SHAPE: audio_identity verdict 'reject' is hidden",
      facts: {
        provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID,
        audioIdentity: { verdict: "reject", code: "provider_audio_id_bound_elsewhere", reason: "…", metrics: {} },
      },
      hidden: true, code: "audio_identity_reject",
    },
    {
      label: "FUTURE SHAPE: audio_identity verdict 'pass' stays visible",
      facts: {
        provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID,
        audioIdentity: { verdict: "pass", code: "digests_agree", reason: "…", metrics: {} },
      },
      hidden: false,
    },
    {
      label: "FUTURE SHAPE: a bare 'reject' string is hidden",
      facts: { provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID, audioIdentity: "reject" },
      hidden: true, code: "audio_identity_reject",
    },
    {
      label: "FUTURE SHAPE: an unrecognised verdict word is hidden (fail closed)",
      facts: { provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID, audioIdentity: { verdict: "probably-fine" } },
      hidden: true, code: "audio_identity_unrecognised",
    },
    {
      label: "FUTURE SHAPE: 'uncertain' does NOT hide on its own (a recognised non-rejection)",
      facts: { provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID, audioIdentity: { verdict: "uncertain" } },
      hidden: false,
    },
    {
      label: "a lecture with NO transcript is not flagged: there is nothing to leak",
      facts: { provenance: null, providerJobId: null, hasTranscript: false },
      hidden: false,
    },
    {
      label: "a lecture with no transcript but a fixture: job id is STILL flagged",
      facts: { provenance: null, providerJobId: "fixture:course-outline-en:1", hasTranscript: false },
      hidden: true, code: "replay_job_id",
    },
  ];

  for (const c of cases) {
    const v = replayVerdict(c.facts);
    const ok = v.replayedOrUnverifiable === c.hidden && (c.code === undefined || v.code === c.code);
    check(c.label, ok, ok ? undefined : { expected: { hidden: c.hidden, code: c.code }, got: v });
  }

  check(
    "isReplayedOrUnverifiable agrees with replayVerdict",
    isReplayedOrUnverifiable({ provenance: FIXTURE_REPLAY_PROVENANCE }) === true &&
      isReplayedOrUnverifiable({ provenance: SARVAM_PROVENANCE, providerJobId: SARVAM_JOB_ID }) === false,
  );
}

// ---------------------------------------------------------------------------
// PART 2 -- the predicate against PRODUCTION rows, read-only
// ---------------------------------------------------------------------------

async function productionReadOnly() {
  section("2. The predicate against production rows (READ-ONLY -- nothing is written)");

  const { data, error } = await svc
    .from("lectures")
    .select("id, title, status, provider_job_id, provenance");
  if (error) throw new Error(`cannot read lectures: ${error.message}`);
  const rows = data ?? [];

  const facts = (l: (typeof rows)[number]) => ({
    provenance: l.provenance,
    providerJobId: l.provider_job_id as string | null,
  });

  const contaminated = rows.find((l) => l.id === CONTAMINATED_LECTURE);
  check("the contaminated lecture 5ced44b6 is still present and untouched", !!contaminated);
  if (contaminated) {
    check(
      "5ced44b6 is still status 'ready' -- this suite must not have repaired anything",
      contaminated.status === "ready",
      contaminated.status,
    );
    const v = replayVerdict(facts(contaminated));
    check("5ced44b6 is HIDDEN from students by the predicate", v.replayedOrUnverifiable, v);
    console.log(`        reason: ${v.reason}`);
  }

  const genuine = rows.find((l) => l.id === GENUINE_LECTURE);
  check("the genuine Sarvam lecture dfd7312d is present", !!genuine);
  if (genuine) {
    const v = replayVerdict(facts(genuine));
    check(
      "dfd7312d (genuine live Sarvam, status ready) is NOT hidden -- the rule is not eating real lectures",
      !v.replayedOrUnverifiable,
      v,
    );
  }

  const replayEngine = rows.filter(
    (l) => (l.provenance as { engine?: string } | null)?.engine === "fixture-replay",
  );
  check(
    `every fixture-replay row is hidden (${replayEngine.length} rows)`,
    replayEngine.length > 0 && replayEngine.every((l) => isReplayedOrUnverifiable(facts(l))),
  );

  const sarvamEngine = rows.filter(
    (l) => (l.provenance as { engine?: string } | null)?.engine === "sarvam",
  );
  check(
    `every live sarvam row is visible (${sarvamEngine.length} rows)`,
    sarvamEngine.length > 0 && sarvamEngine.every((l) => !isReplayedOrUnverifiable(facts(l))),
    sarvamEngine.filter((l) => isReplayedOrUnverifiable(facts(l))).map((l) => l.id),
  );

  const hidden = rows.filter((l) => isReplayedOrUnverifiable(facts(l)));
  console.log(
    `        production: ${hidden.length} of ${rows.length} lectures are hidden from students by this gate`,
  );
}

// ---------------------------------------------------------------------------
// PART 3 -- the routes, over real HTTP
// ---------------------------------------------------------------------------

// A lecture created through the real upload route, then given a transcript and
// a provenance record directly. Transcription itself is not under test here --
// what is under test is what a READER may see once a row exists in each shape.
async function makeLecture(
  facultyToken: string,
  courseId: string,
  title: string,
  transcript: string,
  provenance: unknown,
  providerJobId: string,
) {
  // Distinct bytes per lecture, so the two rows carry two different digests --
  // identical audio would be a legitimate reason for two lectures to share an
  // identity and would muddy what this suite is asserting.
  const bytes = new Uint8Array(4096);
  bytes.set(new TextEncoder().encode(title));
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");

  const created = await api(facultyToken, "POST", `/api/courses/${courseId}/lectures`, {
    title, originalFilename: `${title.toLowerCase().replace(/\s+/g, "-")}.mp3`,
    fileSizeBytes: bytes.byteLength, contentType: "audio/mpeg", checksumSha256,
  });
  if (created.status !== 200 || !created.json?.signedUrl) {
    throw new Error(`lecture create failed: ${JSON.stringify(created.json)}`);
  }
  const put = await fetch(created.json.signedUrl, {
    method: "PUT", headers: { "content-type": "audio/mpeg" }, body: bytes,
  });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);

  const lectureId = created.json.lectureId as string;
  const { error } = await svc.from("lectures").update({
    status: "ready",
    provider_status: "completed",
    provider_job_id: providerJobId,
    raw_transcription_response: { transcript, language_code: "en-IN" },
    provenance,
    completed_at: new Date().toISOString(),
  }).eq("id", lectureId);
  if (error) throw new Error(`could not prepare lecture: ${error.message}`);
  return lectureId;
}

async function addKnowledge(
  lectureId: string, courseId: string, title: string, summary: string, quote: string,
) {
  const { data, error } = await svc.from("knowledge_items").insert({
    lecture_id: lectureId, course_id: courseId,
    category: "teaching", kind: "concept",
    title, summary, steps: [], unspecified: [],
    status: "auto", confidence: 0.9,
    reconstruction_method: "replay-gate-test", reconstruction_version: "1",
  }).select("id").single();
  if (error || !data) throw new Error(`knowledge insert failed: ${error?.message}`);
  const { error: evError } = await svc.from("knowledge_evidence").insert({
    knowledge_item_id: data.id, lecture_id: lectureId,
    role: "introduces", start_ms: 0, end_ms: 8000, quote,
  });
  if (evError) throw new Error(`evidence insert failed: ${evError.message}`);
  return data.id as string;
}

// The LEGACY Layer-1 store: an immutable candidate plus a confirming verdict.
async function addConfirmedCandidate(
  lectureId: string, courseId: string, actorId: string, title: string, detail: string,
) {
  const { data, error } = await svc.from("extraction_candidates").insert({
    lecture_id: lectureId, course_id: courseId,
    kind: "announcement", title, detail,
    evidence_start_ms: 0, evidence_end_ms: 8000, evidence_text: detail,
    confidence: 0.9, extraction_method: "replay-gate-test", extraction_version: "1",
  }).select("id").single();
  if (error || !data) throw new Error(`candidate insert failed: ${error?.message}`);
  const { error: revError } = await svc.from("candidate_reviews").insert({
    candidate_id: data.id, actor_id: actorId, action: "confirm",
  });
  if (revError) throw new Error(`review insert failed: ${revError.message}`);
  return data.id as string;
}

// Everything this run wrote, recorded as it is written so a crash can still
// name it. Nothing else in the database is ever touched.
const created: { courseId?: string; replayedId?: string; genuineId?: string } = {};

async function main() {
  console.log(`Read-time replay gate  ->  ${BASE}`);
  console.log("NOTHING historical is modified: production is read only, and only rows this run creates are written.\n");

  unitTests();
  await productionReadOnly();

  section("3. Sign in, course, enrolment");
  const faculty = await tokenFor(FACULTY, "faculty");
  const student = await tokenFor(STUDENT, "student");
  check("faculty signs in", !!faculty.token);
  check("student signs in", !!student.token);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const createdCourse = await api(faculty.token, "POST", "/api/courses", {
    code: `RG-${stamp.slice(11, 19)}`,
    title: "Replay gate regression",
    term: "Autumn 2026",
    transcriptionLanguage: "en-IN",
  });
  if (createdCourse.status !== 200) throw new Error(`course create failed: ${JSON.stringify(createdCourse.json)}`);
  const course = createdCourse.json.course;
  created.courseId = course?.id as string | undefined;
  check("course created", !!course?.id);

  const joined = await api(student.token, "POST", "/api/enroll", { joinCode: course.join_code });
  check("student enrolled", joined.status === 200, joined.json);

  section("4. Two lectures: one replayed, one genuine");

  // The replayed one. Its transcript is the ONLY place NONCE exists.
  const replayedTranscript =
    `Today we continue with ${NONCE} theory. The ${NONCE} coefficient governs how the ` +
    `system dissipates energy, and every ${NONCE} problem in the tutorial sheet reduces to ` +
    `the same three steps. Memorise the ${NONCE} identity before the class test.`;
  const replayedId = await makeLecture(
    faculty.token, course.id, "Replayed lecture",
    replayedTranscript,
    {
      ...FIXTURE_REPLAY_PROVENANCE,
      lectureId: null,
      providerJobId: null,
      processedAt: new Date().toISOString(),
    },
    `fixture:course-outline-en:${Date.now()}`,
  );
  created.replayedId = replayedId;

  // The genuine one. Live-engine provenance, a real-shaped Sarvam job id, and
  // no replay marker anywhere in the record.
  const genuineTranscript =
    `The ${GENUINE_TERM} cycle has four processes: isentropic compression, constant ` +
    `pressure heat addition, isentropic expansion and constant pressure heat rejection. ` +
    `Efficiency rises with the pressure ratio.`;
  const genuineJobId = `20260830_${randomUUID()}`;
  const genuineId = await makeLecture(
    faculty.token, course.id, "Genuine lecture",
    genuineTranscript,
    {
      ...SARVAM_PROVENANCE,
      lectureId: null,
      providerJobId: genuineJobId,
      processedAt: new Date().toISOString(),
      limitations: [
        "Sarvam exposes only the floating model alias saaras:v3; no dated model snapshot is published.",
        "SYNTHETIC ROW written by the read-time visibility gate suite as a positive control; not a live provider call.",
      ],
    },
    genuineJobId,
  );
  created.genuineId = genuineId;
  check("both lectures created", !!replayedId && !!genuineId);
  console.log(`        replayed: ${replayedId}`);
  console.log(`        genuine:  ${genuineId}`);

  await addKnowledge(
    replayedId, course.id,
    `The ${NONCE} coefficient`,
    `The ${NONCE} coefficient governs energy dissipation and every ${NONCE} tutorial problem reduces to three steps.`,
    `Today we continue with ${NONCE} theory.`,
  );
  await addKnowledge(
    genuineId, course.id,
    `The ${GENUINE_TERM} cycle`,
    `The ${GENUINE_TERM} cycle has four processes and its efficiency rises with the pressure ratio.`,
    `The ${GENUINE_TERM} cycle has four processes`,
  );
  await addConfirmedCandidate(
    replayedId, course.id, faculty.userId,
    `${NONCE} notes uploaded`, `The ${NONCE} notes are on the portal.`,
  );
  await addConfirmedCandidate(
    genuineId, course.id, faculty.userId,
    `${GENUINE_TERM} notes uploaded`, `The ${GENUINE_TERM} notes are on the portal.`,
  );
  check("knowledge and legacy candidates written for both lectures", true);

  section("5. NEGATIVE -- a student cannot reach the replayed lecture");

  const sLectureKnowledge = await api(student.token, "GET", `/api/lectures/${replayedId}/knowledge`);
  check(
    "student gets NO knowledge for the replayed lecture",
    sLectureKnowledge.status === 200 && (sLectureKnowledge.json?.units ?? []).length === 0,
    sLectureKnowledge.json,
  );
  check(
    "the nonce appears nowhere in that response",
    !sLectureKnowledge.text.toLowerCase().includes(NONCE),
  );

  const sLecture = await api(student.token, "GET", `/api/lectures/${replayedId}`);
  check("student is refused the replayed lecture itself", sLecture.status === 403, sLecture.json);
  check(
    "no transcript, no audioUrl and no raw response in that refusal",
    sLecture.json?.transcript === undefined &&
      sLecture.json?.audioUrl === undefined &&
      sLecture.json?.rawTranscriptionResponse === undefined,
    sLecture.json,
  );
  check("the refusal body does not contain the nonce", !sLecture.text.toLowerCase().includes(NONCE));
  console.log(`        withheld because: ${sLecture.json?.reason}`);

  const sUnits = await api(student.token, "GET", `/api/courses/${course.id}/units`);
  const sUnitList: Payload[] = sUnits.json?.units ?? [];
  check(
    "the replayed lecture contributes nothing to COURSE knowledge for a student",
    sUnits.status === 200 && sUnitList.every((u) => u.lectureId !== replayedId),
    sUnitList.map((u) => u.lectureId),
  );
  check("course knowledge does not mention the nonce", !sUnits.text.toLowerCase().includes(NONCE));

  const sLegacy = await api(student.token, "GET", `/api/courses/${course.id}/knowledge`);
  const sLegacyItems: Payload[] = sLegacy.json?.items ?? [];
  check(
    "the LEGACY Layer-1 course view withholds the replayed lecture too",
    sLegacy.status === 200 && sLegacyItems.every((i) => i.lectureId !== replayedId),
    sLegacyItems.map((i) => i.lectureId),
  );

  const sOverview = await api(student.token, "GET", "/api/me/overview");
  check(
    "the student's home overview does not carry the nonce either",
    sOverview.status === 200 && !sOverview.text.toLowerCase().includes(NONCE),
  );

  section("6. THE STRONG TEST -- /ask, with words only the replayed transcript contains");

  const sAsk = await api(
    student.token, "GET",
    `/api/courses/${course.id}/ask?q=${encodeURIComponent(`what is the ${NONCE} coefficient and how do I solve a ${NONCE} problem`)}`,
  );
  const sSources: Payload[] = sAsk.json?.sources ?? [];
  check(
    "/ask never cites the replayed lecture as a source for a student",
    sAsk.status === 200 && sSources.every((s) => s.lectureId !== replayedId),
    sSources.map((s) => ({ lectureId: s.lectureId, title: s.title })),
  );
  check(
    "no source text returned to the student contains the nonce",
    !JSON.stringify(sSources).toLowerCase().includes(NONCE),
  );
  check(
    "the replayed unit is not even counted as available to the student",
    sAsk.json?.knowledgeUnitsAvailable === 1,
    sAsk.json?.knowledgeUnitsAvailable,
  );

  const sAskScoped = await api(
    student.token, "GET",
    `/api/courses/${course.id}/ask?lectureId=${replayedId}&q=${encodeURIComponent(`explain ${NONCE}`)}`,
  );
  check(
    "/ask scoped DIRECTLY at the replayed lecture still returns nothing from it",
    sAskScoped.status === 200 &&
      (sAskScoped.json?.sources ?? []).length === 0 &&
      sAskScoped.json?.knowledgeUnitsAvailable === 0,
    sAskScoped.json,
  );

  // The control that makes the two checks above mean something. The identical
  // question, asked by the owner, MUST come back with the replayed unit -- which
  // proves the query matches it and the student's empty result is an exclusion,
  // not a miss.
  const oAsk = await api(
    faculty.token, "GET",
    `/api/courses/${course.id}/ask?q=${encodeURIComponent(`what is the ${NONCE} coefficient and how do I solve a ${NONCE} problem`)}`,
  );
  const oSources: Payload[] = oAsk.json?.sources ?? [];
  check(
    "CONTROL: the same question asked by the OWNER does cite the replayed lecture",
    oAsk.status === 200 && oSources.some((s) => s.lectureId === replayedId),
    { status: oAsk.status, sources: oSources.map((s) => s.lectureId) },
  );

  section("7. POSITIVE CONTROLS -- the genuine lecture, and the owner's evidence");

  const sGenuine = await api(student.token, "GET", `/api/lectures/${genuineId}`);
  check(
    "student CAN read the genuine lecture's transcript",
    sGenuine.status === 200 && typeof sGenuine.json?.transcript?.text === "string" &&
      sGenuine.json.transcript.text.toLowerCase().includes(GENUINE_TERM),
    { status: sGenuine.status, text: sGenuine.json?.transcript?.text?.slice(0, 80) },
  );
  check(
    "student CAN play the genuine lecture's audio",
    typeof sGenuine.json?.audioUrl === "string" && sGenuine.json.audioUrl.length > 0,
  );

  const sGenuineKnowledge = await api(student.token, "GET", `/api/lectures/${genuineId}/knowledge`);
  check(
    "student CAN read the genuine lecture's knowledge",
    sGenuineKnowledge.status === 200 && (sGenuineKnowledge.json?.units ?? []).length === 1,
    sGenuineKnowledge.json?.units?.length,
  );
  check(
    "the genuine lecture DOES appear in course knowledge for a student",
    sUnitList.some((u) => u.lectureId === genuineId),
    sUnitList.map((u) => u.lectureId),
  );
  check(
    "the genuine lecture DOES appear in the legacy course view for a student",
    sLegacyItems.some((i) => i.lectureId === genuineId),
    sLegacyItems.map((i) => i.lectureId),
  );

  const sAskGenuine = await api(
    student.token, "GET",
    `/api/courses/${course.id}/ask?q=${encodeURIComponent(`explain the ${GENUINE_TERM} cycle`)}`,
  );
  check(
    "/ask answers a student from the genuine lecture",
    sAskGenuine.status === 200 &&
      (sAskGenuine.json?.sources ?? []).some((s: Payload) => s.lectureId === genuineId),
    sAskGenuine.json?.sources?.map((s: Payload) => s.lectureId),
  );

  const oLecture = await api(faculty.token, "GET", `/api/lectures/${replayedId}`);
  check(
    "OWNER still sees the replayed lecture's transcript IN FULL -- it is their evidence",
    oLecture.status === 200 &&
      typeof oLecture.json?.transcript?.text === "string" &&
      oLecture.json.transcript.text.toLowerCase().includes(NONCE),
    { status: oLecture.status, text: oLecture.json?.transcript?.text?.slice(0, 80) },
  );
  check(
    "OWNER still gets the replayed lecture's audio URL",
    typeof oLecture.json?.audioUrl === "string" && oLecture.json.audioUrl.length > 0,
  );
  check(
    "OWNER still sees its provenance, which is what says the transcript is replayed",
    (oLecture.json?.lecture?.provenance?.engine ?? "") === "fixture-replay",
    oLecture.json?.lecture?.provenance?.engine,
  );

  const oLectureKnowledge = await api(faculty.token, "GET", `/api/lectures/${replayedId}/knowledge`);
  check(
    "OWNER still sees the replayed lecture's knowledge in full",
    oLectureKnowledge.status === 200 && (oLectureKnowledge.json?.units ?? []).length === 1,
    oLectureKnowledge.json?.units?.length,
  );

  const oUnits = await api(faculty.token, "GET", `/api/courses/${course.id}/units`);
  check(
    "OWNER's course knowledge still contains BOTH lectures",
    oUnits.status === 200 &&
      (oUnits.json?.units ?? []).some((u: Payload) => u.lectureId === replayedId) &&
      (oUnits.json?.units ?? []).some((u: Payload) => u.lectureId === genuineId),
    (oUnits.json?.units ?? []).map((u: Payload) => u.lectureId),
  );

}

let crashed: unknown = null;
try {
  await main();
} catch (err) {
  crashed = err;
}

// Rows this run created are removed when everything passed. On a failure they
// are LEFT IN PLACE and named, because a gate that fails is worth inspecting and
// deleting the evidence would be the same mistake this whole feature is about.
//
// `created` is filled in as each row is written rather than returned at the
// end, so a crash halfway through still knows what it left behind. The first
// version returned it from main() and a crash therefore leaked an unnamed,
// untracked course.
if (failures.length === 0 && !crashed) {
  section("8. Cleanup (only rows this run created)");
  for (const id of [created.replayedId, created.genuineId]) {
    if (!id) continue;
    await svc.storage.from("lectures").remove([`${id}/original.mp3`]);
    await svc.from("lectures").delete().eq("id", id);
  }
  if (created.courseId) await svc.from("courses").delete().eq("id", created.courseId);
  console.log("  removed this run's two lectures, their knowledge and the test course");
  console.log("  production rows, including 5ced44b6 and dfd7312d, were never written to");
} else if (created.courseId) {
  console.log(
    `\n  Rows kept for inspection: course ${created.courseId}` +
      `, lectures ${created.replayedId ?? "(none)"} / ${created.genuineId ?? "(none)"}`,
  );
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (crashed) {
  console.log("\nCRASHED before finishing:");
  console.log(crashed instanceof Error ? crashed.stack ?? crashed.message : String(crashed));
}
if (failures.length || crashed) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
