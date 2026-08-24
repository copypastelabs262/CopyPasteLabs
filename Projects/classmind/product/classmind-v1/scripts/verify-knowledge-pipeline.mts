// End-to-end proof that the knowledge pipeline works as a GENERAL process, not
// as something tuned to one recording.
//
//   node --env-file=.env.local scripts/verify-knowledge-pipeline.mts
//
// Regression A: the real college lecture already in the system (cloud
// computing, Hinglish). It is re-processed through the same pipeline as
// everything else -- its stored rows are never hand-edited.
//
// Regression B: a lecture the pipeline has never seen (Class-12 physics,
// Devanagari Hindi, different lecturer, different subject). Uploaded, given a
// real transcription, and processed with no configuration of any kind. If a
// change helps A but not B, it was a lecture-specific hack and does not belong
// in the pipeline.
//
// This makes real transcription and real reasoning calls, and therefore costs
// money. That is the point: replayed data cannot demonstrate understanding.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OWNER_EMAIL = process.env.CLASSMIND_OWNER_EMAIL ?? "shyamworks06@gmail.com";
const LECTURE_A = process.env.CLASSMIND_LECTURE_A ?? "dfd7312d-8baf-44bc-8dcb-b9608d28e9d3";
const CLIP_B = process.env.CLASSMIND_CLIP_B ?? ".scratch/clip-physics-hi.mp3";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed += 1; console.log(`  PASS  ${label}`); return; }
  failures.push(label);
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 400));
}
const section = (t: string) => console.log(`\n--- ${t} ---`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mmss = (ms: number) =>
  `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

const svc = createClient(PROJECT_URL, SERVICE, { auth: { persistSession: false } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

async function ownerToken(): Promise<string> {
  const anon = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  const { data: link, error } = await svc.auth.admin.generateLink({ type: "magiclink", email: OWNER_EMAIL });
  if (error) throw new Error(`could not mint a session for ${OWNER_EMAIL}: ${error.message}`);
  const { data, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: "email",
  });
  if (verifyError) throw new Error(`could not verify: ${verifyError.message}`);
  return data.session!.access_token;
}

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: Payload = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { nonJson: text.slice(0, 300) }; }
  return { status: res.status, json };
}

// Shared assertions. Whatever the lecture, the pipeline must satisfy these --
// which is what makes them a test of the process rather than of one recording.
async function assertGeneralProperties(label: string, lectureId: string, token: string) {
  const know = await api(token, "GET", `/api/lectures/${lectureId}/knowledge`);
  check(`${label}: knowledge endpoint responds`, know.status === 200, know.json);
  const units: Payload[] = know.json?.units ?? [];
  check(`${label}: the pipeline produced knowledge units`, units.length > 0, units.length);

  const { data: lecture } = await svc
    .from("lectures").select("raw_transcription_response").eq("id", lectureId).single();
  const rawText: string = (lecture!.raw_transcription_response as Payload)?.transcript ?? "";
  const hay = rawText.replace(/\s+/g, " ").toLowerCase();

  // The load-bearing property: every stored quote must really have been said.
  let quotes = 0, unverifiable = 0;
  for (const u of units) {
    for (const e of u.evidence ?? []) {
      quotes += 1;
      if (!hay.includes(String(e.quote).replace(/\s+/g, " ").trim().toLowerCase())) unverifiable += 1;
    }
  }
  check(`${label}: every unit carries at least one evidence span`, units.every((u) => (u.evidence ?? []).length > 0));
  check(`${label}: all ${quotes} evidence quotes occur VERBATIM in the raw transcript`, unverifiable === 0, unverifiable);
  check(`${label}: every evidence span carries a timestamp`,
    units.every((u) => (u.evidence ?? []).every((e: Payload) => Number.isFinite(e.startMs) && e.startMs >= 0)));
  check(`${label}: every unit belongs to THIS lecture`, units.every((u) => u.lectureId === lectureId));
  check(`${label}: teaching knowledge is live without review`,
    units.filter((u) => u.category === "teaching").every((u) => u.status === "auto"));
  check(`${label}: actionable knowledge is gated`,
    units.filter((u) => ["assignment", "deadline", "exam_instruction"].includes(u.kind))
      .every((u) => u.status !== "auto"));
  return units;
}

async function main() {
  console.log(`Knowledge pipeline regression  ->  ${BASE}`);
  const token = await ownerToken();

  // =========================================================================
  section("REGRESSION A — the real college lecture, re-processed");
  // =========================================================================
  const a0 = Date.now();
  const procA = await api(token, "POST", `/api/lectures/${LECTURE_A}/extract`);
  check("A: pipeline ran", procA.status === 200, procA.json);
  if (procA.json?.reasoningError) {
    console.log(`\n*** STOPPING AT THE REASONING BOUNDARY ***\n    ${procA.json.reasoningError}`);
    process.exitCode = 1; return;
  }
  console.log(`        ${Math.round((Date.now() - a0) / 1000)}s · signals=${procA.json.candidateCount} · ` +
    `calls=${procA.json.reconstruction?.calls} · proposed=${procA.json.reconstruction?.itemsProposed} · ` +
    `dropped_unverifiable=${procA.json.reconstruction?.itemsDroppedUnverifiable}`);
  console.log(`        stored=${procA.json.knowledge?.stored} (pending=${procA.json.knowledge?.pending}, auto=${procA.json.knowledge?.auto})`);

  const unitsA = await assertGeneralProperties("A", LECTURE_A, token);

  section("A — contextual consolidation of the assignment");
  const assignments = unitsA.filter((u) => u.kind === "assignment");
  check("exactly ONE assignment, not one per sentence", assignments.length === 1,
    assignments.map((a) => a.title));
  const asg = assignments[0];
  if (asg) {
    console.log(`        title:   ${asg.title}`);
    console.log(`        summary: ${asg.summary}`);
    asg.steps.forEach((s: string, i: number) => console.log(`        step ${i + 1}:  ${s}`));
    asg.unspecified.forEach((s: string) => console.log(`        unspec:  ${s}`));
    (asg.evidence ?? []).forEach((e: Payload) => console.log(`        [${mmss(e.startMs)}] (${e.role}) "${String(e.quote).slice(0, 70)}"`));
    const blob = `${asg.title} ${asg.summary} ${asg.steps.join(" ")}`.toLowerCase();
    check("it mentions finding a research paper", /research paper/.test(blob));
    check("it mentions implementing it", /implement/.test(blob));
    check("it mentions deploying to the cloud", /deploy/.test(blob) && /cloud/.test(blob));
    check("the reference chain is resolved into ONE task with steps", asg.steps.length >= 2, asg.steps);
    check("it spans MULTIPLE evidence quotes", (asg.evidence ?? []).length >= 2, (asg.evidence ?? []).length);
    check("no deadline was invented", asg.unspecified.some((u: string) => /deadline|due|date/i.test(u)), asg.unspecified);
    check("it is awaiting the lecturer, not live", asg.status === "pending", asg.status);
  }

  section("A — the teacher's workload");
  const pendingA = unitsA.filter((u) => u.status === "pending");
  check("the teacher is asked to review only actionable items", pendingA.every((u) => u.category === "actionable"),
    pendingA.map((u) => `${u.kind}:${u.title}`));
  check("that is a handful of cards, not dozens", pendingA.length <= 5, pendingA.length);
  console.log(`        teacher sees ${pendingA.length} card(s); ${unitsA.length - pendingA.length} unit(s) entered automatically`);

  section("A — student questions answered from stored knowledge");
  const courseA = unitsA[0]?.courseId;
  const QUESTIONS = [
    "What exactly is the research paper assignment?",
    "Was there a deadline?",
    "What did the professor explain about resource management?",
    "What was taught in this lecture?",
  ];
  for (const q of QUESTIONS) {
    const r = await api(token, "GET", `/api/courses/${courseA}/ask?q=${encodeURIComponent(q)}`);
    console.log(`\n        Q: ${q}`);
    console.log(`        A: ${String(r.json?.answer ?? "").replace(/\n/g, "\n           ").slice(0, 700)}`);
    console.log(`           sources: ${(r.json?.sources ?? []).length}${r.json?.degraded ? " (DEGRADED — no model)" : ""}`);
    check(`answered: "${q.slice(0, 42)}…"`, r.status === 200 && r.json?.answered === true, r.json?.answer);
    check(`  cites its sources`, (r.json?.sources ?? []).length > 0);
    check(`  every source carries evidence`, (r.json?.sources ?? []).every((s: Payload) => (s.evidence ?? []).length > 0));
  }
  const asgAnswer = await api(token, "GET", `/api/courses/${courseA}/ask?q=${encodeURIComponent("What exactly is the research paper assignment?")}`);
  const answerText = String(asgAnswer.json?.answer ?? "").toLowerCase();
  check("the assignment answer is COMPLETE, not one fragment",
    /research paper/.test(answerText) && /implement/.test(answerText) && /deploy/.test(answerText), answerText.slice(0, 300));

  // =========================================================================
  section("REGRESSION B — a lecture the pipeline has never seen");
  // =========================================================================
  const bytes = readFileSync(CLIP_B);
  const sha = createHash("sha256").update(bytes).digest("hex");
  console.log(`        ${CLIP_B} · ${(bytes.byteLength / 1024).toFixed(0)} KB · sha256 ${sha.slice(0, 16)}…`);

  const course = await api(token, "POST", "/api/courses", {
    code: `UNSEEN-${Date.now().toString().slice(-6)}`, title: "Unseen lecture regression",
    transcriptionLanguage: "hi-IN",
  });
  check("B: course created", course.status === 200 && !!course.json?.course?.id, course.json);
  if (!course.json?.course?.id) {
    console.log(`
${passed} passed, ${failures.length} failed`); process.exitCode = 1; return;
  }
  const courseB = course.json.course.id;
  const lec = await api(token, "POST", `/api/courses/${courseB}/lectures`, {
    title: "Unseen physics lecture", originalFilename: "unseen-physics.mp3",
    fileSizeBytes: bytes.byteLength, contentType: "audio/mpeg", checksumSha256: sha,
  });
  check("B: lecture created", lec.status === 200, lec.json);
  const lectureB: string = lec.json.lectureId;
  const put = await fetch(lec.json.signedUrl, {
    method: "PUT", headers: { "content-type": "audio/mpeg" }, body: new Uint8Array(bytes),
  });
  check("B: audio uploaded", put.ok, put.status);

  const sub = await api(token, "POST", `/api/lectures/${lectureB}/transcribe`);
  check("B: real transcription submitted", sub.status === 200, sub.json);
  let status = "transcribing";
  for (let i = 0; i < 90 && status === "transcribing"; i += 1) {
    await sleep(4000);
    status = (await api(token, "POST", `/api/lectures/${lectureB}/poll`)).json?.status ?? "unknown";
  }
  check("B: transcribed", status === "transcribed", status);
  if (status !== "transcribed") {
    console.log(`\n${passed} passed, ${failures.length} failed`); process.exitCode = 1; return;
  }

  const b0 = Date.now();
  const procB = await api(token, "POST", `/api/lectures/${lectureB}/extract`);
  check("B: the SAME pipeline ran, with no configuration", procB.status === 200, procB.json);
  console.log(`        ${Math.round((Date.now() - b0) / 1000)}s · signals=${procB.json.candidateCount} · ` +
    `calls=${procB.json.reconstruction?.calls} · stored=${procB.json.knowledge?.stored}`);

  const unitsB = await assertGeneralProperties("B", lectureB, token);
  console.log("\n        knowledge automatically derived from a lecture never seen before:");
  for (const u of unitsB.slice(0, 8)) console.log(`          (${u.category}/${u.kind}) ${u.title}`);

  section("B — student questions work on the new lecture too");
  const rb = await api(token, "GET", `/api/courses/${courseB}/ask?q=${encodeURIComponent("What was taught in this lecture?")}`);
  console.log(`        A: ${String(rb.json?.answer ?? "").replace(/\n/g, "\n           ").slice(0, 500)}`);
  check("B: answered from its own stored knowledge", rb.json?.answered === true, rb.json);
  check("B: cites sources", (rb.json?.sources ?? []).length > 0);

  section("Lecture isolation");
  check("B's knowledge never references lecture A", unitsB.every((u) => u.lectureId === lectureB));
  check("A's knowledge never references lecture B", unitsA.every((u) => u.lectureId === LECTURE_A));
  const bAnswerRefs = (rb.json?.sources ?? []).map((s: Payload) => s.lectureId);
  check("B's answer draws only on B", bAnswerRefs.every((id: string) => id === lectureB), bAnswerRefs);

  section("Deletion removes derived knowledge with the lecture");
  const del = await api(token, "DELETE", `/api/lectures/${lectureB}`);
  check("B: deleted", del.status === 200, del.json);
  const { data: leftItems } = await svc.from("knowledge_items").select("id").eq("lecture_id", lectureB);
  const { data: leftEv } = await svc.from("knowledge_evidence").select("id").eq("lecture_id", lectureB);
  check("B: knowledge items cascaded away", (leftItems ?? []).length === 0);
  check("B: knowledge evidence cascaded away", (leftEv ?? []).length === 0);
  const { data: aStill } = await svc.from("knowledge_items").select("id").eq("lecture_id", LECTURE_A);
  check("A is untouched by B's deletion", (aStill ?? []).length === unitsA.length, (aStill ?? []).length);

  section("Summary");
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) { failures.forEach((f) => console.log("  FAILED: " + f)); process.exitCode = 1; }
}

main().catch((err) => { console.error("\nABORTED:", err); process.exitCode = 1; });
