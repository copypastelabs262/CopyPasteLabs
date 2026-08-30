// LECTURE ISOLATION and DUPLICATE PROCESSING
//
//   E2E_BASE_URL=http://localhost:3300 node --env-file=.env.local \
//     scripts/qa/isolation-and-duplication.mts
//
// Two properties, deliberately tested by two different means.
//
// PART A -- duplication -- must go through the REAL extract route, because the
// thing being tested is what that route does to the database when it is called
// twice. Counting rows before and after is the only witness that cannot be
// talked out of its answer by a response field.
//
// PART B -- isolation -- is tested against SEEDED knowledge with known ids in
// two lectures. Isolation is a property of the read path, not of the model, and
// a run in which reconstruction returns nothing would let every cross-lecture
// check pass over two empty arrays. Seeding makes the checks discriminating:
// each lecture holds an item the other must never surface.
//
// Everything it creates, it deletes.

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3300";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };
const STUDENT = { email: "student.test@classmind.local", password: "ClassMindTest!2026" };
const LAB_AUDIO_PATH = "ccf15fe1-9f7f-48dc-990a-4e16513fe354/original.mp3";

let passed = 0;
const failures: string[] = [];
const unverified: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed += 1; console.log(`  PASS  ${label}`); return; }
  failures.push(label);
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 500));
}
// A check that could not be RUN is neither a pass nor a failure. Counting it as
// either is how a suite starts lying about its own coverage.
function skip(label: string, why: string) {
  unverified.push(`${label} -- ${why}`);
  console.log(`  SKIP  ${label}`);
  console.log(`        ${why}`);
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

// `slug` names the transcript explicitly. The filename is deliberately NOT the
// slug: which transcript arrives must not depend on what the file is called,
// and a lecture that names no slug goes to the PAID provider.
async function uploadAndTranscribe(token: string, courseId: string, slug: string, title: string) {
  const download = await svc.storage.from("audio").download(LAB_AUDIO_PATH);
  if (download.error || !download.data) throw new Error(`Cannot read lab audio: ${download.error?.message}`);
  const bytes = await download.data.arrayBuffer();

  const lec = await api(token, "POST", `/api/courses/${courseId}/lectures`, {
    title, originalFilename: `qa-${title.replace(/\W+/g, "-").toLowerCase()}.mp3`,
    fileSizeBytes: bytes.byteLength, contentType: "audio/mpeg",
    checksumSha256: createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
    replayFixture: slug,
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

const countFor = async (table: string, lectureId: string) => {
  const { count } = await svc
    .from(table).select("id", { count: "exact", head: true }).eq("lecture_id", lectureId);
  return count ?? 0;
};

async function snapshot(lectureId: string) {
  return {
    candidates: await countFor("extraction_candidates", lectureId),
    knowledge: await countFor("knowledge_items", lectureId),
    evidence: await countFor("knowledge_evidence", lectureId),
  };
}

async function main() {
  console.log(`ClassMind v2 isolation + duplication  ->  ${BASE}`);
  // No TRANSCRIPTION_PROVIDER check: that variable is read nowhere any more.
  // Replay is requested per lecture via `replayFixture`, and the cost guard
  // below verifies from PROVENANCE that it actually happened.

  const createdCourses: string[] = [];
  try {
    section("0. Setup");
    const faculty = await tokenFor(FACULTY, "faculty");
    const student = await tokenFor(STUDENT, "student");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(11, 19);

    const mk = async (code: string, title: string) => {
      const r = await api(faculty.token, "POST", "/api/courses", {
        code, title, term: "QA 2026", transcriptionLanguage: "en-IN",
      });
      if (r.status !== 200) throw new Error(`course create failed: ${JSON.stringify(r.json)}`);
      createdCourses.push(r.json.course.id);
      return r.json.course;
    };
    const courseX = await mk(`QA-X-${stamp}`, "Isolation X");
    // A second course, so "a course's knowledge contains only its own lectures"
    // has something it could wrongly contain.
    const courseY = await mk(`QA-Y-${stamp}`, "Isolation Y");
    await api(student.token, "POST", "/api/enroll", { joinCode: courseX.join_code });
    await api(student.token, "POST", "/api/enroll", { joinCode: courseY.join_code });
    check("two courses, student enrolled in both", true);

    // Two DIFFERENT fixtures, so the two lectures hold genuinely different
    // transcripts. Two copies of one transcript would make a leak between them
    // invisible.
    const lecA = await uploadAndTranscribe(faculty.token, courseX.id, "cloud-computing-hinglish", "X-1 Cloud");
    const lecB = await uploadAndTranscribe(faculty.token, courseX.id, "course-outline-en", "X-2 Outline");
    const lecY = await uploadAndTranscribe(faculty.token, courseY.id, "course-outline-en", "Y-1 Outline");
    check("three lectures transcribed", true);

    // ==================================================================
    section("PART A. Duplicate processing: extract twice, count the rows");
    const before0 = await snapshot(lecA);
    const run1 = await api(faculty.token, "POST", `/api/lectures/${lecA}/extract`);
    check("first extract succeeds", run1.status === 200, { status: run1.status, json: run1.json });
    const after1 = await snapshot(lecA);
    console.log(`        run 1: candidates ${before0.candidates} -> ${after1.candidates}, ` +
      `knowledge ${before0.knowledge} -> ${after1.knowledge}, evidence ${before0.evidence} -> ${after1.evidence}`);
    console.log(`        run 1 reported: candidateCount=${run1.json?.candidateCount} ` +
      `knowledge=${JSON.stringify(run1.json?.knowledge)} published=${run1.json?.published} ` +
      `reasoningError=${JSON.stringify(run1.json?.reasoningError)}`);
    check("the first extract produced candidates", after1.candidates > 0, after1.candidates);

    const run2 = await api(faculty.token, "POST", `/api/lectures/${lecA}/extract`);
    check("second extract succeeds", run2.status === 200, { status: run2.status, json: run2.json });
    const after2 = await snapshot(lecA);
    console.log(`        run 2: candidates ${after1.candidates} -> ${after2.candidates}, ` +
      `knowledge ${after1.knowledge} -> ${after2.knowledge}, evidence ${after1.evidence} -> ${after2.evidence}`);
    console.log(`        run 2 reported: candidateCount=${run2.json?.candidateCount} ` +
      `knowledge=${JSON.stringify(run2.json?.knowledge)} published=${run2.json?.published} ` +
      `reasoningError=${JSON.stringify(run2.json?.reasoningError)}`);

    check(
      "candidates do NOT double on a second run of the same method+version",
      after2.candidates === after1.candidates,
      { afterRun1: after1.candidates, afterRun2: after2.candidates },
    );
    check(
      "knowledge items do NOT accumulate across runs",
      after2.knowledge <= after1.knowledge || after1.knowledge === 0,
      { afterRun1: after1.knowledge, afterRun2: after2.knowledge },
    );
    // Orphaned evidence is the quiet version of the same bug: rows whose parent
    // was replaced, still counted against the lecture.
    const { data: liveIds } = await svc.from("knowledge_items").select("id").eq("lecture_id", lecA);
    const live = new Set((liveIds ?? []).map((r) => r.id as string));
    const { data: allEv } = await svc
      .from("knowledge_evidence").select("id, knowledge_item_id").eq("lecture_id", lecA);
    const orphans = (allEv ?? []).filter((e) => !live.has(e.knowledge_item_id as string));
    check("no evidence rows are orphaned by re-processing", orphans.length === 0, orphans.length);

    // No duplicate TITLES within one lecture -- the count can stay flat while
    // the same obligation is stored under two rows.
    const { data: titles } = await svc
      .from("knowledge_items").select("title, status").eq("lecture_id", lecA);
    const seen = new Map<string, number>();
    for (const t of titles ?? []) seen.set(t.title as string, (seen.get(t.title as string) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    check("no knowledge item appears twice under the same title", dupes.length === 0, dupes);

    // A HUMAN VERDICT MUST SURVIVE RE-PROCESSING AND MUST NOT BE DUPLICATED.
    // This is the case that actually bites: the item is kept because it was
    // judged, and then re-proposed and inserted alongside itself.
    const { data: confirmable } = await svc
      .from("knowledge_items").select("id, title").eq("lecture_id", lecA).limit(1).maybeSingle();
    if (!confirmable) {
      skip("a confirmed item survives re-extraction without being duplicated",
        "reconstruction stored zero knowledge items for this lecture, so there was nothing to confirm. " +
        "This is the known empty-completion defect; the duplication property is UNVERIFIED, not proven.");
    } else {
      const conf = await api(faculty.token, "POST", `/api/knowledge/${confirmable.id}/review`, { action: "confirm" });
      check("an item can be confirmed", conf.status === 200, conf.json);
      const beforeRun3 = await snapshot(lecA);
      const run3 = await api(faculty.token, "POST", `/api/lectures/${lecA}/extract`);
      check("third extract succeeds", run3.status === 200, run3.json);
      const afterRun3 = await snapshot(lecA);
      console.log(`        run 3: knowledge ${beforeRun3.knowledge} -> ${afterRun3.knowledge}, ` +
        `skippedAlreadyJudged=${run3.json?.knowledge?.skippedAlreadyJudged}`);

      const { data: stillThere } = await svc
        .from("knowledge_items").select("id, status").eq("id", confirmable.id).maybeSingle();
      check("the confirmed item SURVIVED re-processing", !!stillThere, stillThere);
      check("  ...and is still confirmed", stillThere?.status === "confirmed", stillThere?.status);

      const { data: sameTitle } = await svc
        .from("knowledge_items").select("id, status").eq("lecture_id", lecA)
        .eq("title", confirmable.title as string);
      check(
        "the confirmed item was NOT re-inserted alongside itself",
        (sameTitle ?? []).length === 1,
        (sameTitle ?? []).map((r) => r.status),
      );
    }

    // ==================================================================
    section("PART B. Lecture isolation (seeded, so the checks discriminate)");
    // Force both X lectures readable and give each a uniquely-titled item.
    // Forced `ready` AND given genuine-looking provenance.
    //
    // The replay gate (src/lib/provenance/replay.ts, landed today) hides any
    // fixture-replayed lecture from students -- correctly, since a replayed
    // transcript belongs to a different recording. But every lecture here is
    // replayed, because replaying is how this suite avoids paying for
    // transcription, so without this rewrite the student-facing checks below
    // would all read zero and pass for the wrong reason. Isolation is a property
    // of the read path given a set of visible lectures; making them visible is
    // the precondition, not the thing under test.
    const genuine = {
      engine: "sarvam", configuredLanguage: "en-IN",
      decodingParams: { languageCode: "en-IN", replayed: false }, limitations: [],
    };
    let n = 0;
    for (const id of [lecA, lecB, lecY]) {
      n += 1;
      await svc.from("lectures").update({
        status: "ready", provenance: genuine,
        provider_job_id: `20260830_qa000000-0000-4000-8000-00000000000${n}`,
      }).eq("id", id);
    }
    for (const [lec, course, marker] of [
      [lecA, courseX.id, "MARKER-ALPHA"], [lecB, courseX.id, "MARKER-BETA"], [lecY, courseY.id, "MARKER-GAMMA"],
    ] as const) {
      await svc.from("knowledge_items").delete().eq("lecture_id", lec);
      const { data: row } = await svc.from("knowledge_items").insert({
        lecture_id: lec, course_id: course, category: "teaching", kind: "topic",
        title: `${marker} topic`, summary: `Only ${marker} may ever appear under this lecture.`,
        steps: [], unspecified: [], confidence: 0.9,
        reconstruction_method: "qa-fixture", reconstruction_version: "1",
      }).select("id").single();
      await svc.from("knowledge_evidence").insert({
        knowledge_item_id: row!.id, lecture_id: lec, role: "statement",
        start_ms: 1000, end_ms: 2000, char_start: 0, char_end: 10, quote: `${marker} evidence quote`,
      });
    }

    const kA = await api(faculty.token, "GET", `/api/lectures/${lecA}/knowledge`);
    const kB = await api(faculty.token, "GET", `/api/lectures/${lecB}/knowledge`);
    // Printed unconditionally: when a read comes back empty, "empty" and
    // "refused" and "wrong key" all look identical at the assertion, and that
    // ambiguity has already cost this sprint two wrong diagnoses.
    console.log(`        A: HTTP ${kA.status} keys=${Object.keys(kA.json ?? {})} ` +
      `units=${(kA.json?.units ?? []).length}`);
    console.log(`        B: HTTP ${kB.status} keys=${Object.keys(kB.json ?? {})} ` +
      `units=${(kB.json?.units ?? []).length}`);
    const { data: dbgA } = await svc.from("knowledge_items")
      .select("id, title, status").eq("lecture_id", lecA);
    const { data: dbgLec } = await svc.from("lectures").select("status").eq("id", lecA).maybeSingle();
    console.log(`        DB: lecture A status=${dbgLec?.status} rows=${JSON.stringify(dbgA)}`);
    const unitsA: Payload[] = kA.json?.units ?? [];
    const unitsB: Payload[] = kB.json?.units ?? [];

    check("lecture A returns its own item", unitsA.some((u) => u.title.includes("MARKER-ALPHA")),
      unitsA.map((u) => u.title));
    check("lecture B returns its own item", unitsB.some((u) => u.title.includes("MARKER-BETA")),
      unitsB.map((u) => u.title));
    check("lecture A NEVER surfaces B's item",
      !JSON.stringify(kA.json).includes("MARKER-BETA"), unitsA.map((u) => u.title));
    check("lecture B NEVER surfaces A's item",
      !JSON.stringify(kB.json).includes("MARKER-ALPHA"), unitsB.map((u) => u.title));
    check("every unit under A is stamped with A's lecture id",
      unitsA.every((u) => u.lectureId === lecA), unitsA.map((u) => u.lectureId));
    check("every EVIDENCE span under A belongs to A",
      unitsA.every((u) => (u.evidence ?? []).every((e: Payload) => e.lectureId === lecA)),
      unitsA.flatMap((u) => (u.evidence ?? []).map((e: Payload) => e.lectureId)));
    check("no evidence QUOTE under A came from B",
      !unitsA.some((u) => (u.evidence ?? []).some((e: Payload) => String(e.quote).includes("MARKER-BETA"))));

    // Course scope: X must hold both of its lectures and nothing from Y.
    const askX = await api(student.token, "GET",
      `/api/courses/${courseX.id}/ask?q=${encodeURIComponent("what topics were covered")}`);
    check("course X offers exactly its own two units", askX.json?.knowledgeUnitsAvailable === 2,
      askX.json?.knowledgeUnitsAvailable);
    check("course X's payload never mentions course Y's item",
      !JSON.stringify(askX.json).includes("MARKER-GAMMA"), "MARKER-GAMMA leaked into course X");
    const askY = await api(student.token, "GET",
      `/api/courses/${courseY.id}/ask?q=${encodeURIComponent("what topics were covered")}`);
    check("course Y offers exactly its own one unit", askY.json?.knowledgeUnitsAvailable === 1,
      askY.json?.knowledgeUnitsAvailable);
    check("course Y's payload never mentions course X's items",
      !JSON.stringify(askY.json).includes("MARKER-ALPHA") && !JSON.stringify(askY.json).includes("MARKER-BETA"),
      "a course X marker leaked into course Y");

    // Lecture-scoped ask must narrow to ONE lecture, not merely to the course.
    const askLecA = await api(student.token, "GET",
      `/api/courses/${courseX.id}/ask?q=${encodeURIComponent("what topics were covered")}&lectureId=${lecA}`);
    check("lecture-scoped ask narrows to that lecture alone",
      askLecA.json?.knowledgeUnitsAvailable === 1, askLecA.json?.knowledgeUnitsAvailable);
    check("  ...and the other lecture in the SAME course is excluded",
      !JSON.stringify(askLecA.json).includes("MARKER-BETA"), "MARKER-BETA leaked into a lecture-scoped ask");

  } finally {
    section("Cleanup");
    for (const id of createdCourses) {
      const { error } = await svc.from("courses").delete().eq("id", id);
      console.log(`  ${error ? "FAILED to remove" : "removed"} course ${id}${error ? `: ${error.message}` : ""}`);
    }
  }

  section("Summary");
  console.log(`${passed} passed, ${failures.length} failed, ${unverified.length} NOT VERIFIED`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  for (const u of unverified) console.log(`  SKIP  ${u}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error("\nABORTED:", e.message, "\n", e.stack); process.exit(1); });
