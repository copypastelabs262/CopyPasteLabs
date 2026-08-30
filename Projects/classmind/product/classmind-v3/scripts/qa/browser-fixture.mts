// Sets up (or tears down) ONE course a human can actually walk through in a
// browser, and prints the URLs.
//
//   node --env-file=.env.local scripts/qa/browser-fixture.mts setup
//   node --env-file=.env.local scripts/qa/browser-fixture.mts teardown
//
// WHY THIS IS NEEDED AT ALL, which is itself a finding:
//
// The replay gate landed today hides every fixture-replayed lecture from
// students (src/lib/provenance/replay.ts). Replay is also the only way to get a
// transcript without paying Sarvam. So the two facts together mean there is no
// way to see the STUDENT experience of a lecture without either spending money
// or constructing the row -- and 41 of 49 production lectures are replayed, so
// "just look at a real one" is not available either.
//
// This constructs one: a real replayed transcript (so the timestamps and the
// words are genuine and line up with real audio), with the provenance rewritten
// to the shape a live Sarvam run leaves behind, so the lecture is visible to a
// student. The knowledge is seeded with evidence spans taken FROM THAT
// TRANSCRIPT, so clicking a citation seeks to a real moment in real audio --
// which is the single thing the browser pass exists to check.
//
// Everything it creates is removed by `teardown`.

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3300";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };
const STUDENT = { email: "student.test@classmind.local", password: "ClassMindTest!2026" };
const LAB_AUDIO_PATH = "ccf15fe1-9f7f-48dc-990a-4e16513fe354/original.mp3";
const COURSE_CODE = "QA-BROWSER";

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

async function tokenFor(creds: { email: string; password: string }, role: string) {
  const anon = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  const signIn = await anon.auth.signInWithPassword(creds);
  if (signIn.error) throw new Error(signIn.error.message);
  const token = signIn.data.session!.access_token;
  await api(token, "POST", "/api/profile", { fullName: `Test ${role}`, role });
  return token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function teardown() {
  const { data } = await svc.from("courses").select("id, code").eq("code", COURSE_CODE);
  for (const c of data ?? []) {
    await svc.from("courses").delete().eq("id", c.id);
    console.log(`removed course ${c.id} (${c.code})`);
  }
  if (!data?.length) console.log("nothing to remove");
}

async function setup() {
  await teardown();
  const faculty = await tokenFor(FACULTY, "faculty");
  const student = await tokenFor(STUDENT, "student");

  const c = await api(faculty, "POST", "/api/courses", {
    code: COURSE_CODE, title: "Cloud Computing (QA walkthrough)",
    term: "Autumn 2026", transcriptionLanguage: "en-IN",
  });
  if (c.status !== 200) throw new Error(`course create failed: ${JSON.stringify(c.json)}`);
  const course = c.json.course;

  const download = await svc.storage.from("audio").download(LAB_AUDIO_PATH);
  const bytes = await download.data!.arrayBuffer();
  const sha = createHash("sha256").update(Buffer.from(bytes)).digest("hex");

  const lec = await api(faculty, "POST", `/api/courses/${course.id}/lectures`, {
    title: "Lecture 1 - The cloud control layer",
    originalFilename: "qa-browser-walkthrough.mp3",
    fileSizeBytes: bytes.byteLength, contentType: "audio/mpeg",
    checksumSha256: sha, replayFixture: "cloud-computing-hinglish",
  });
  if (lec.status !== 200) throw new Error(`lecture create failed: ${JSON.stringify(lec.json)}`);
  const lectureId = lec.json.lectureId as string;
  await fetch(lec.json.signedUrl, { method: "PUT", headers: { "content-type": "audio/mpeg" }, body: bytes });

  await api(faculty, "POST", `/api/courses/${course.id}/lectures/${lectureId}/transcribe`);
  let status = "";
  for (let i = 0; i < 40; i += 1) {
    const p = await api(faculty, "POST", `/api/courses/${course.id}/lectures/${lectureId}/poll`);
    status = p.json?.status ?? "";
    if (status && !["transcribing", "uploaded"].includes(status)) break;
    await sleep(1000);
  }
  if (status !== "transcribed") throw new Error(`lecture reached '${status}', not transcribed`);

  // Make it look like a genuine live run so the student gate lets it through.
  // Stated plainly: this is CONSTRUCTED state for a walkthrough, not a claim
  // that this audio was transcribed by Sarvam.
  await svc.from("lectures").update({
    status: "ready",
    provenance: {
      engine: "sarvam", configuredLanguage: "en-IN",
      decodingParams: { languageCode: "en-IN", replayed: false }, limitations: [],
    },
    provider_job_id: "20260830_qa000000-0000-4000-8000-0000000000ff",
  }).eq("id", lectureId);

  // Evidence spans taken from the REAL transcript, so a citation click seeks to
  // a moment the audio actually contains.
  const { data: row } = await svc.from("lectures")
    .select("raw_transcription_response").eq("id", lectureId).single();
  const raw = row?.raw_transcription_response as Payload;
  const segments: Payload[] =
    raw?.diarized_transcript?.entries ?? raw?.entries ?? raw?.segments ?? [];
  const pick = (n: number) => segments[Math.min(n, Math.max(segments.length - 1, 0))] ?? null;

  await svc.from("knowledge_items").delete().eq("lecture_id", lectureId);
  const seeds = [
    { category: "actionable", kind: "assignment", status: "confirmed",
      title: "Find a recent research paper and deploy it on the cloud",
      summary: "Choose a current paper, implement what it describes, and run the implementation on a cloud provider.",
      steps: ["Pick a recent paper", "Implement it", "Deploy it on the cloud"],
      unspecified: ["No submission date was given in this lecture"], seg: 2 },
    { category: "teaching", kind: "topic", status: "auto",
      title: "What the control layer does",
      summary: "The control layer decides where work runs and keeps the fleet in the state it was asked for.",
      steps: [], unspecified: [], seg: 6 },
    { category: "actionable", kind: "assignment", status: "pending",
      title: "PENDING - must not be visible to a student",
      summary: "If this appears on the student page, that is a P0 leak.",
      steps: ["This step must never render for a student"], unspecified: [], seg: 10 },
  ];

  for (const s of seeds) {
    const { data: item } = await svc.from("knowledge_items").insert({
      lecture_id: lectureId, course_id: course.id,
      category: s.category, kind: s.kind, title: s.title, summary: s.summary,
      steps: s.steps, unspecified: s.unspecified, status: s.status, confidence: 0.9,
      reconstruction_method: "qa-fixture", reconstruction_version: "1",
    }).select("id").single();
    const seg = pick(s.seg);
    const startMs = Number(seg?.start_time_seconds ?? seg?.startMs ?? s.seg * 12) * (seg?.start_time_seconds ? 1000 : 1);
    const endMs = Number(seg?.end_time_seconds ?? seg?.endMs ?? (s.seg + 1) * 12) * (seg?.end_time_seconds ? 1000 : 1);
    await svc.from("knowledge_evidence").insert({
      knowledge_item_id: item!.id, lecture_id: lectureId, role: "statement",
      start_ms: Math.round(startMs), end_ms: Math.round(endMs),
      char_start: null, char_end: null,
      quote: (seg?.transcript ?? seg?.text ?? "the lecturer's words at this point").slice(0, 300),
    });
  }

  const enrol = await api(student, "POST", "/api/enroll", { joinCode: course.join_code });
  console.log(`enrolled student: HTTP ${enrol.status}`);

  const sLec = await api(student, "GET", `/api/courses/${course.id}/lectures/${lectureId}`);
  const sKnow = await api(student, "GET", `/api/courses/${course.id}/lectures/${lectureId}/knowledge`);
  console.log("\n--- READY FOR THE BROWSER ---");
  console.log(`course:  ${BASE}/courses/${course.id}`);
  console.log(`lecture: ${BASE}/courses/${course.id}/lectures/${lectureId}`);
  console.log(`student sees the lecture: HTTP ${sLec.status}, transcript ${sLec.json?.transcript ? "yes" : "NO"}, audio ${sLec.json?.audioUrl ? "yes" : "NO"}`);
  console.log(`student knowledge units: ${(sKnow.json?.units ?? []).length} (expect 2: the confirmed assignment and the topic)`);
  console.log(`student payload mentions PENDING: ${JSON.stringify(sKnow.json).includes("PENDING") ? "YES -- P0 LEAK" : "no"}`);
  console.log(`\nteardown with: node --env-file=.env.local scripts/qa/browser-fixture.mts teardown`);
}

const mode = process.argv[2] ?? "setup";
(mode === "teardown" ? teardown() : setup()).catch((e) => {
  console.error("ABORTED:", e.message);
  process.exit(1);
});
