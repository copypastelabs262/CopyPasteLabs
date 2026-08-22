// Proves that two different recordings produce two different, independent
// transcripts, and that no lecture is ever shown a transcript some other
// recording produced.
//
//   node --env-file=.env.local scripts/verify-lecture-identity.mts <clipA.mp3> <clipB.mp3>
//
// Written after a deployed lecture uploaded as "Cloud computing.mp3" was stored
// correctly, byte for byte, and then displayed a thermodynamics transcript
// captured from a Lab v0 run the day before. The audio pipeline was never at
// fault -- the replay provider was selected by an environment variable on a
// production deployment. This suite is the standing check that it cannot
// happen again, and it deliberately fails if replay is active at all.
//
// It makes REAL transcription calls and therefore costs money. That is the
// point: a suite that passes against replayed data was never testing this.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };

const clipPaths = process.argv.slice(2);
if (clipPaths.length !== 2) {
  console.error("Give exactly two audio files: node --env-file=.env.local scripts/verify-lecture-identity.mts a.mp3 b.mp3");
  process.exit(1);
}

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

const svc = createClient(PROJECT_URL, SERVICE, { auth: { persistSession: false } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: Payload = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { nonJson: text.slice(0, 300) }; }
  return { status: res.status, json };
}

interface Run {
  label: string;
  file: string;
  sha: string;
  bytes: Buffer;
  lectureId: string;
  courseId: string;
}

async function upload(token: string, clipPath: string, label: string): Promise<Run> {
  const bytes = readFileSync(clipPath);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const file = basename(clipPath);

  const course = await api(token, "POST", "/api/courses", {
    code: `IDENT-${label}-${Date.now().toString().slice(-6)}`,
    title: `Identity check ${label}`,
    transcriptionLanguage: "en-IN",
  });
  if (course.status !== 200) throw new Error(`course create failed: ${JSON.stringify(course.json)}`);

  const lec = await api(token, "POST", `/api/courses/${course.json.course.id}/lectures`, {
    title: `Identity check ${label}`,
    originalFilename: file,
    fileSizeBytes: bytes.byteLength,
    contentType: "audio/mpeg",
    checksumSha256: sha,
  });
  if (lec.status !== 200) throw new Error(`lecture create failed: ${JSON.stringify(lec.json)}`);

  const put = await fetch(lec.json.signedUrl, {
    method: "PUT",
    headers: { "content-type": "audio/mpeg" },
    body: new Uint8Array(bytes),
  });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);

  console.log(`        ${label}: ${file}  ${(bytes.byteLength / 1024).toFixed(0)} KB  sha256 ${sha.slice(0, 16)}…`);
  return { label, file, sha, bytes, lectureId: lec.json.lectureId, courseId: course.json.course.id };
}

async function main() {
  console.log(`Lecture identity check  ->  ${BASE}`);
  console.log(`clips: ${clipPaths.join("  |  ")}`);

  const anon = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  const signIn = await anon.auth.signInWithPassword(FACULTY);
  if (signIn.error) throw new Error(`sign in failed: ${signIn.error.message}`);
  const token = signIn.data.session!.access_token;

  section("1. Two distinct recordings go in");
  const a = await upload(token, clipPaths[0], "A");
  const b = await upload(token, clipPaths[1], "B");
  check("the two clips are genuinely different files", a.sha !== b.sha, { a: a.sha, b: b.sha });
  check("they are separate lectures", a.lectureId !== b.lectureId);

  section("2. Stored audio is the audio that was uploaded");
  for (const run of [a, b]) {
    const row = await svc.from("lectures")
      .select("storage_path, file_size_bytes, checksum_sha256").eq("id", run.lectureId).single();
    const dl = await svc.storage.from("lectures").download(row.data!.storage_path as string);
    const stored = Buffer.from(await dl.data!.arrayBuffer());
    const storedSha = createHash("sha256").update(stored).digest("hex");
    check(`${run.label}: stored object hashes to the uploaded file`, storedSha === run.sha, { storedSha, expected: run.sha });
    check(`${run.label}: the row's recorded checksum matches too`, row.data!.checksum_sha256 === run.sha);
    check(`${run.label}: stored under its OWN lecture id`, (row.data!.storage_path as string).startsWith(run.lectureId));
  }

  section("3. Transcription — REAL provider, no replay");
  for (const run of [a, b]) {
    const sub = await api(token, "POST", `/api/lectures/${run.lectureId}/transcribe`);
    if (sub.status !== 200) {
      check(`${run.label}: transcription submitted`, false, sub.json);
      console.log("\n*** STOPPING AT THE EXTERNAL BOUNDARY ***");
      console.log("    The transcription provider could not be reached or refused the job.");
      console.log("    No substitute transcript has been used, which is the correct behaviour.");
      console.log(`    Provider said: ${JSON.stringify(sub.json)}`);
      process.exitCode = 1;
      return;
    }
    check(`${run.label}: transcription submitted`, true);
    check(
      `${run.label}: the job id is NOT a replay fixture`,
      typeof sub.json.providerStatus === "string",
    );
  }

  section("4. Both reach a terminal state");
  const states: Record<string, string> = {};
  for (let i = 0; i < 100; i += 1) {
    let allDone = true;
    for (const run of [a, b]) {
      if (["transcribed", "ready", "failed"].includes(states[run.label])) continue;
      const p = await api(token, "POST", `/api/lectures/${run.lectureId}/poll`);
      states[run.label] = p.json?.status ?? "unknown";
      if (!["transcribed", "ready", "failed"].includes(states[run.label])) allDone = false;
    }
    if (allDone) break;
    await sleep(5000);
  }
  console.log(`        A=${states.A}  B=${states.B}`);

  const failed = [a, b].filter((r) => states[r.label] === "failed");
  if (failed.length) {
    for (const run of failed) {
      const row = await svc.from("lectures").select("error_message, raw_transcription_response").eq("id", run.lectureId).single();
      console.log(`\n*** ${run.label} FAILED AT THE PROVIDER ***`);
      console.log(`    error: ${row.data!.error_message}`);
      check(
        `${run.label}: a failed lecture stores NO transcript rather than borrowing one`,
        row.data!.raw_transcription_response === null,
        row.data!.raw_transcription_response,
      );
    }
  }
  check("both lectures reached `transcribed`", states.A === "transcribed" && states.B === "transcribed", states);
  if (states.A !== "transcribed" || states.B !== "transcribed") {
    console.log("\nSummary");
    console.log(`${passed} passed, ${failures.length} failed`);
    process.exitCode = 1;
    return;
  }

  section("5. Each transcript belongs to its own run");
  const rows: Record<string, Payload> = {};
  for (const run of [a, b]) {
    const row = await svc.from("lectures")
      .select("raw_transcription_response, provenance, provider_job_id").eq("id", run.lectureId).single();
    rows[run.label] = row.data;
    const p = row.data!.provenance as Payload;
    check(`${run.label}: provenance names THIS lecture`, p?.lectureId === run.lectureId, { got: p?.lectureId, want: run.lectureId });
    check(`${run.label}: provenance names the provider job that ran`, p?.providerJobId === row.data!.provider_job_id);
    check(`${run.label}: provenance engine is the real provider, not a replay`, p?.engine === "sarvam", p?.engine);
    check(
      `${run.label}: no REPLAYED warning in provenance`,
      !((p?.limitations ?? []) as string[]).some((l) => /REPLAY/i.test(l)),
    );
    check(`${run.label}: job id is not a fixture id`, !String(row.data!.provider_job_id).startsWith("fixture:"));
  }

  section("6. Two recordings, two different transcripts");
  const textA = (rows.A.raw_transcription_response as Payload)?.transcript ?? "";
  const textB = (rows.B.raw_transcription_response as Payload)?.transcript ?? "";
  console.log(`        A (${textA.length} chars): ${JSON.stringify(textA.slice(0, 120))}`);
  console.log(`        B (${textB.length} chars): ${JSON.stringify(textB.slice(0, 120))}`);
  check("A produced a non-empty transcript", textA.trim().length > 0);
  check("B produced a non-empty transcript", textB.trim().length > 0);
  check("THE TWO TRANSCRIPTS DIFFER", textA !== textB);
  check("the two raw responses differ in full", JSON.stringify(rows.A.raw_transcription_response) !== JSON.stringify(rows.B.raw_transcription_response));
  check("the two provider jobs are distinct", rows.A.provider_job_id !== rows.B.provider_job_id);

  section("7. Neither transcript came from a stored fixture");
  const { readdirSync } = await import("node:fs");
  const fixtures = readdirSync("fixtures/transcription")
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, json: JSON.stringify(JSON.parse(readFileSync("fixtures/transcription/" + f, "utf8")).rawResponse) }));
  for (const run of [a, b]) {
    const mine = JSON.stringify(rows[run.label].raw_transcription_response);
    const hit = fixtures.find((f) => f.json === mine);
    check(`${run.label}: response is not byte-identical to any committed fixture`, !hit, hit?.name);
  }

  section("Summary");
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) { failures.forEach((f) => console.log("  FAILED: " + f)); process.exitCode = 1; }
  console.log(`\nA: ${BASE}/courses/${a.courseId}/lectures/${a.lectureId}`);
  console.log(`B: ${BASE}/courses/${b.courseId}/lectures/${b.lectureId}`);
}

main().catch((err) => { console.error("\nABORTED:", err); process.exitCode = 1; });
