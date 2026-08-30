// Proves that two different recordings produce two different, independent
// transcripts, and that no lecture is ever shown a transcript some other
// recording produced.
//
//   LIVE   (costs money, needs the deliberate opt-in):
//     ALLOW_LIVE_SARVAM=1 node --env-file=.env.local
//       scripts/verify-lecture-identity.mts clipA.mp3 clipB.mp3
//
//   REPLAY (free, proves the same independence property):
//     node --env-file=.env.local scripts/verify-lecture-identity.mts
//       --replay[=slugA,slugB] [clipA.mp3 clipB.mp3]
//
// Written after a deployed lecture uploaded as "Cloud computing.mp3" was stored
// correctly, byte for byte, and then displayed a thermodynamics transcript
// captured from a Lab v0 run the day before. The audio pipeline was never at
// fault -- the replay provider was selected by an environment variable on a
// production deployment, and the fixture it replayed was chosen by the
// FILENAME. Both mechanisms are gone; this suite is the standing check.
//
// WHY TWO MODES, AND WHAT EACH ONE PROVES
//
// The live mode is unchanged and its assertions are unchanged: a real provider,
// a real job id, no REPLAYED limitation, and a response that is byte-identical
// to no committed fixture. That is the only mode that can prove the live path,
// and it costs money -- which is why it now requires ALLOW_LIVE_SARVAM=1. An
// unmigrated caller must not be able to spend by accident.
//
// The replay mode proves, for free, the property this suite is named for: TWO
// DIFFERENT RECORDINGS PRODUCE TWO DIFFERENT, INDEPENDENT TRANSCRIPTS. It uses
// two DIFFERENT fixture slugs, one per lecture, each named explicitly, so a bug
// that crossed the two lectures would show up as one transcript appearing
// twice. Sections 5 and 7 assert the replay DUALS of their live claims rather
// than being skipped: the engine must be the replay engine, each provenance
// must name its own lecture, and each response must equal the fixture that
// lecture named and not the other one.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };

const args = process.argv.slice(2);
const replayArg = args.find((a) => a === "--replay" || a.startsWith("--replay="));
const clipPaths = args.filter((a) => !a.startsWith("--"));

// Two DIFFERENT captured responses, one per lecture. Never one slug twice: the
// whole point of this suite is that two lectures do not share a transcript, and
// replaying the same fixture into both would make that check vacuous.
const DEFAULT_REPLAY_SLUGS = ["course-outline-en", "physics-class12-hi"];
const replaySlugs = replayArg
  ? (replayArg.includes("=") ? replayArg.split("=")[1].split(",") : DEFAULT_REPLAY_SLUGS)
  : null;
const REPLAY = replaySlugs !== null;

if (replaySlugs && (replaySlugs.length !== 2 || replaySlugs[0] === replaySlugs[1])) {
  console.error("--replay needs TWO DIFFERENT fixture slugs: --replay=slugA,slugB");
  process.exit(1);
}

// Two distinct recordings out of Lab v0's bucket, used when no local clips are
// given. Different files, so the "two recordings" premise holds either way.
const LAB_AUDIO_PATHS = [
  "ccf15fe1-9f7f-48dc-990a-4e16513fe354/original.mp3",
  "4a9e144e-434c-4b9e-93af-f9f78a8b4517/original.mp3",
];

if (!REPLAY && clipPaths.length !== 2) {
  console.error("Live mode needs exactly two audio files: scripts/verify-lecture-identity.mts a.mp3 b.mp3");
  console.error("Or run it free: scripts/verify-lecture-identity.mts --replay");
  process.exit(1);
}
if (REPLAY && clipPaths.length !== 0 && clipPaths.length !== 2) {
  console.error("Replay mode takes either no clips or exactly two.");
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

async function clipBytes(index: number): Promise<{ bytes: Buffer; file: string }> {
  if (clipPaths.length === 2) {
    return { bytes: readFileSync(clipPaths[index]), file: basename(clipPaths[index]) };
  }
  const path = LAB_AUDIO_PATHS[index];
  const dl = await svc.storage.from("audio").download(path);
  if (dl.error || !dl.data) throw new Error(`Cannot read lab audio ${path}: ${dl.error?.message}`);
  // Named after neither fixture. Under the old mechanism the filename chose the
  // transcript; here it must choose nothing at all.
  return {
    bytes: Buffer.from(await dl.data.arrayBuffer()),
    file: `identity-check-${index === 0 ? "A" : "B"}.mp3`,
  };
}

async function upload(token: string, index: number, label: string): Promise<Run> {
  const { bytes, file } = await clipBytes(index);
  const sha = createHash("sha256").update(bytes).digest("hex");

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
    ...(replaySlugs ? { replayFixture: replaySlugs[index] } : {}),
  });
  if (lec.status !== 200) throw new Error(`lecture create failed: ${JSON.stringify(lec.json)}`);
  // If the replay were not recorded, the transcribe below would make a live,
  // billable call and every assertion after it would measure the wrong thing.
  if (replaySlugs) {
    await assertReplayStuck(lec.json.lectureId as string, replaySlugs[index], lec.json, ` (${label})`);
  }

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
  console.log(`clips: ${(clipPaths.length ? clipPaths : LAB_AUDIO_PATHS).join("  |  ")}`);
  console.log(
    replaySlugs
      ? `mode requested: REPLAY, two different fixtures: ${replaySlugs.join(" | ")}`
      : "mode: LIVE -- real Sarvam calls, this costs money (needs ALLOW_LIVE_SARVAM=1)",
  );
  if (replaySlugs) console.log("        (what actually happened is printed per lecture below)");

  const anon = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  const signIn = await anon.auth.signInWithPassword(FACULTY);
  if (signIn.error) throw new Error(`sign in failed: ${signIn.error.message}`);
  const token = signIn.data.session!.access_token;

  section("1. Two distinct recordings go in");
  const a = await upload(token, 0, "A");
  const b = await upload(token, 1, "B");
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

  section(REPLAY
    ? "3. Transcription — two DIFFERENT named replays"
    : "3. Transcription — REAL provider, no replay");
  for (const run of [a, b]) {
    const sub = await api(token, "POST", `/api/lectures/${run.lectureId}/transcribe`,
      REPLAY ? { expectReplay: true } : undefined);
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
    // This used to read "the job id is NOT a replay fixture" while asserting
    // only that providerStatus was a string -- a label that claimed more than
    // the check made. Both modes now assert the thing the label names, against
    // the job id the row will be polled with.
    const slug = replaySlugs?.[run.label === "A" ? 0 : 1];
    check(
      slug
        ? `${run.label}: the job id names the fixture this lecture asked for (${slug})`
        : `${run.label}: the job id is NOT a replay fixture`,
      typeof sub.json.providerStatus === "string" &&
        (slug
          ? String(sub.json.replayFixture) === slug
          : sub.json.replayFixture === null),
      sub.json,
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
    if (replaySlugs) {
      // The replay duals of the three live claims below. Each lecture must have
      // replayed the fixture IT named -- if the two crossed, or if one filename
      // had selected for both, these are what would catch it.
      const slug = replaySlugs[run.label === "A" ? 0 : 1];
      check(`${run.label}: provenance engine is the replay engine, named honestly`, p?.engine === "fixture-replay", p?.engine);
      check(
        `${run.label}: provenance says REPLAYED out loud`,
        ((p?.limitations ?? []) as string[]).some((l) => /REPLAY/i.test(l)),
      );
      check(
        `${run.label}: the fixture replayed is the one THIS lecture named (${slug})`,
        (p?.decodingParams as Payload)?.replayFixtureSlug === slug,
        (p?.decodingParams as Payload)?.replayFixtureSlug,
      );
      check(
        `${run.label}: the job id names that same fixture and no other`,
        String(row.data!.provider_job_id).startsWith(`fixture:${slug}:`),
        row.data!.provider_job_id,
      );
    } else {
      check(`${run.label}: provenance engine is the real provider, not a replay`, p?.engine === "sarvam", p?.engine);
      check(
        `${run.label}: no REPLAYED warning in provenance`,
        !((p?.limitations ?? []) as string[]).some((l) => /REPLAY/i.test(l)),
      );
      check(`${run.label}: job id is not a fixture id`, !String(row.data!.provider_job_id).startsWith("fixture:"));
    }
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

  section(REPLAY
    ? "7. Each transcript is the fixture ITS lecture named, and not the other one"
    : "7. Neither transcript came from a stored fixture");
  const { readdirSync } = await import("node:fs");
  const fixtures = readdirSync("fixtures/transcription")
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const parsed = JSON.parse(readFileSync("fixtures/transcription/" + f, "utf8"));
      return { name: f, slug: parsed.slug as string, json: JSON.stringify(parsed.rawResponse) };
    });
  for (const run of [a, b]) {
    const mine = JSON.stringify(rows[run.label].raw_transcription_response);
    const hit = fixtures.find((f) => f.json === mine);
    if (replaySlugs) {
      const slug = replaySlugs[run.label === "A" ? 0 : 1];
      const other = replaySlugs[run.label === "A" ? 1 : 0];
      check(`${run.label}: response IS the fixture it named (${slug})`, hit?.slug === slug, hit?.slug);
      check(`${run.label}: response is NOT the other lecture's fixture (${other})`, hit?.slug !== other, hit?.slug);
    } else {
      check(`${run.label}: response is not byte-identical to any committed fixture`, !hit, hit?.name);
    }
  }

  section("Summary");
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) { failures.forEach((f) => console.log("  FAILED: " + f)); process.exitCode = 1; }
  console.log(`\nA: ${BASE}/courses/${a.courseId}/lectures/${a.lectureId}`);
  console.log(`B: ${BASE}/courses/${b.courseId}/lectures/${b.lectureId}`);
}

main().catch((err) => { console.error("\nABORTED:", err); process.exitCode = 1; });
