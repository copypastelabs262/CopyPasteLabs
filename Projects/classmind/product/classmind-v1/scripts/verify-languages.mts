// Language verification for the ClassMind V1 transcription path, driven over
// HTTP against a running server exactly as scripts/e2e.mts drives it.
//
// e2e.mts proves the happy path in English. This script proves the two things
// English cannot: that a non-Latin script survives the whole round trip
// byte-for-byte, and that a run whose language the engine got wrong SAYS SO
// in provenance instead of quietly shipping a fluent-looking wrong transcript.
//
//   node --env-file=.env.local scripts/verify-languages.mts
//
// Requires the dev server on BASE and TRANSCRIPTION_PROVIDER=fixture. The
// fixture provider picks its payload by matching a fixture slug inside the
// uploaded filename, so the filenames below are load-bearing, not cosmetic.
// Re-runnable: each run creates its own two courses and leaves earlier ones
// alone.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };

// Lab v0's `audio` bucket, not the product's `lectures` bucket. Uploading the
// audio that actually produced each fixture means the replayed timestamps line
// up with what you hear, which is the only thing that makes checks 5 and 6
// mean anything.
const LAB_BUCKET = "audio";

// Devanagari physics lecture: 160 Sarvam chunks, hi-IN at 0.999 confidence.
const HINDI_AUDIO_PATH = "4a9e144e-434c-4b9e-93af-f9f78a8b4517/original.mp3";
const HINDI_SLUG = "physics-class12-hi";
const HINDI_FILENAME = HINDI_SLUG + ".mp3";

// The real failure: an English DSP lecture that Sarvam returned as romanized
// Arabic while still reporting language_code en-IN at 0.617 confidence.
const MISDETECTED_RUN_ID = "ddc4a12e-75fe-46ad-b384-e842991a7ea4";
const MISDETECTED_SLUG = "fft-lecture-misdetected";
const MISDETECTED_FILENAME = MISDETECTED_SLUG + ".mp3";

const FIXTURE_DIR = join(process.cwd(), "fixtures", "transcription");
const DEVANAGARI = /[\u0900-\u097F]/;
const FILE_SIZE_LIMIT_BYTES = 52_428_800;

// A segment longer than this on average means the chunk grouping in
// normalize.ts has started swallowing whole chunks again. Sarvam's own chunks
// run ~15s; a median above 20s cannot be explained by the input.
const MEDIAN_SEGMENT_ALARM_S = 20;

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
// type would mean checking them against this file's beliefs instead. Same
// reasoning, and the same shape, as scripts/e2e.mts.
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

interface Segment {
  startMs: number;
  endMs: number;
  text: string;
  charStart: number;
  charEnd: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Key order is not part of the artefact: jsonb does not preserve it. Sorting
// keys before comparing means "verbatim" is tested as the value it is, not as
// the serialisation Postgres happened to hand back.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(rec).sort()) out[key] = canonical(rec[key]);
    return out;
  }
  return value;
}

function readFixture(slug: string): { rawResponse: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, slug + ".json"), "utf8"));
}

async function labAudio(path: string): Promise<ArrayBuffer> {
  const download = await svc.storage.from(LAB_BUCKET).download(path);
  if (download.error || !download.data) {
    throw new Error(`Could not read lab audio ${path}: ${download.error?.message}`);
  }
  const bytes = await download.data.arrayBuffer();
  const mb = (bytes.byteLength / 1024 / 1024).toFixed(1);
  if (bytes.byteLength > FILE_SIZE_LIMIT_BYTES) {
    // Reported loudly rather than silently padded: a truncated upload is still
    // an upload of a different artefact, and the report has to say so.
    console.log(
      `        WARNING: ${path} is ${mb} MB, over the ${FILE_SIZE_LIMIT_BYTES}-byte route limit.`,
    );
    console.log("        Uploading a TRUNCATED buffer. The stored audio is NOT the whole file.");
    return bytes.slice(0, FILE_SIZE_LIMIT_BYTES);
  }
  console.log(`        audio: ${mb} MB (${bytes.byteLength} bytes), whole file`);
  return bytes;
}

interface LectureRun {
  courseId: string;
  lectureId: string;
  transcript: { text: string; segments: Segment[] } | null;
  row: {
    raw_transcription_response: Record<string, unknown>;
    provenance: Record<string, unknown>;
    storage_path: string;
    status: string;
  };
  reachedTranscribed: boolean;
}

// Everything both languages do identically, so the assertions below can be
// about language and nothing else.
async function runLecture(opts: {
  token: string;
  courseCode: string;
  courseTitle: string;
  language: string;
  audioPath: string;
  filename: string;
  lectureTitle: string;
}): Promise<LectureRun> {
  const created = await api(opts.token, "POST", "/api/courses", {
    code: opts.courseCode,
    title: opts.courseTitle,
    term: "Autumn 2026",
    transcriptionLanguage: opts.language,
  });
  if (created.status !== 200 || !created.json?.course?.id) {
    throw new Error(`Course creation failed: ${JSON.stringify(created.json)}`);
  }
  const courseId: string = created.json.course.id;
  check(
    `course is created with transcriptionLanguage ${opts.language}`,
    created.json.course.transcription_language === opts.language,
    created.json.course,
  );

  const bytes = await labAudio(opts.audioPath);

  const lec = await api(opts.token, "POST", `/api/courses/${courseId}/lectures`, {
    title: opts.lectureTitle,
    originalFilename: opts.filename,
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

  const sub = await api(opts.token, "POST", `/api/lectures/${lectureId}/transcribe`);
  check(
    "transcription is submitted",
    sub.status === 200 && sub.json?.status === "transcribing",
    sub.json,
  );
  check(
    `the course's language ${opts.language} was sent, not auto-detect`,
    sub.json?.languageCode === opts.language,
    sub.json,
  );

  let status = "transcribing";
  for (let i = 0; i < 60 && status === "transcribing"; i += 1) {
    await sleep(1000);
    const polled = await api(opts.token, "POST", `/api/lectures/${lectureId}/poll`);
    status = polled.json?.status ?? "unknown";
  }

  const view = await api(opts.token, "GET", `/api/lectures/${lectureId}`);
  if (view.status !== 200) throw new Error(`Cannot open lecture: ${JSON.stringify(view.json)}`);

  const stored = await svc
    .from("lectures")
    .select("raw_transcription_response, provenance, storage_path, status")
    .eq("id", lectureId)
    .single();
  if (stored.error || !stored.data) {
    throw new Error(`Cannot read the lecture row: ${stored.error?.message}`);
  }

  return {
    courseId,
    lectureId,
    transcript: view.json?.transcript ?? null,
    row: stored.data as LectureRun["row"],
    reachedTranscribed: status === "transcribed",
  };
}

async function main() {
  console.log(`ClassMind V1 language verification  ->  ${BASE}`);
  console.log(
    `transcription provider: ${process.env.TRANSCRIPTION_PROVIDER ?? "sarvam (LIVE -- this costs money)"}`,
  );

  section("0. Sign in");
  const faculty = await tokenFor(FACULTY, "faculty");
  check("faculty signs in and has a profile", !!faculty.token);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(11, 19);

  // ------------------------------------------------------------------
  section("HINDI. Devanagari survives the round trip (hi-IN course)");
  // ------------------------------------------------------------------
  const hi = await runLecture({
    token: faculty.token,
    courseCode: `LANG-HI-${stamp}`,
    courseTitle: "Class 12 Physics (Hindi)",
    language: "hi-IN",
    audioPath: HINDI_AUDIO_PATH,
    filename: HINDI_FILENAME,
    lectureTitle: "Electric Charges and Fields 01",
  });

  check("1. the lecture reaches `transcribed`", hi.reachedTranscribed, hi.row.status);

  const hiRaw = hi.row.raw_transcription_response;
  const hiRawTranscript = hiRaw?.transcript;
  check(
    "2. the raw ASR response persisted with a transcript string",
    typeof hiRawTranscript === "string" && hiRawTranscript.length > 0,
    typeof hiRawTranscript,
  );
  check(
    "2. the stored raw transcript contains Devanagari",
    typeof hiRawTranscript === "string" && DEVANAGARI.test(hiRawTranscript),
    typeof hiRawTranscript === "string" ? hiRawTranscript.slice(0, 80) : hiRawTranscript,
  );
  const hiFixture = readFixture(HINDI_SLUG);
  check(
    "2. the raw ASR response persisted VERBATIM (deep-equal to the fixture)",
    JSON.stringify(canonical(hiRaw)) === JSON.stringify(canonical(hiFixture.rawResponse)),
    Object.keys(hiRaw ?? {}),
  );

  const hiTranscript = hi.transcript;
  check("3. normalizeRawTranscript returned a transcript", !!hiTranscript, hiTranscript);
  if (!hiTranscript) throw new Error("No normalized Hindi transcript; the rest cannot be checked.");
  const hiSegments = hiTranscript.segments as Segment[];
  check("3. the derived transcript is non-empty", hiTranscript.text.trim().length > 0);
  check("3. more than one segment", hiSegments.length > 1, hiSegments.length);
  check("3. transcript carries [mm:ss] markers", /\[\d\d:\d\d\]/.test(hiTranscript.text));
  check(
    "3. the derived transcript is Devanagari too, not transliterated on the way out",
    DEVANAGARI.test(hiTranscript.text),
    hiTranscript.text.slice(0, 80),
  );

  check(
    "4. every segment's charStart/charEnd slices back to exactly its own text",
    hiSegments.every((s) => hiTranscript.text.slice(s.charStart, s.charEnd) === s.text),
    hiSegments
      .filter((s) => hiTranscript.text.slice(s.charStart, s.charEnd) !== s.text)
      .slice(0, 2),
  );

  check(
    "5. segments are in non-decreasing startMs order",
    hiSegments.every((s, i) => i === 0 || s.startMs >= hiSegments[i - 1].startMs),
    hiSegments
      .map((s, i) => ({ i, startMs: s.startMs, prev: i > 0 ? hiSegments[i - 1].startMs : null }))
      .filter((s) => s.prev !== null && s.startMs < s.prev)
      .slice(0, 3),
  );
  check(
    "5. no segment ends before it starts",
    hiSegments.every((s) => s.endMs >= s.startMs),
    hiSegments.filter((s) => s.endMs < s.startMs).slice(0, 3),
  );

  const durationsS = hiSegments.map((s) => (s.endMs - s.startMs) / 1000);
  const medianS = median(durationsS);
  console.log(
    `        6. ${hiSegments.length} segments, ${hiTranscript.text.length} chars, ` +
      `median segment ${medianS.toFixed(2)}s ` +
      `(min ${Math.min(...durationsS).toFixed(2)}s, max ${Math.max(...durationsS).toFixed(2)}s)`,
  );
  if (medianS > MEDIAN_SEGMENT_ALARM_S) {
    console.log("");
    console.log("        ############################################################");
    console.log(`        # MEDIAN SEGMENT DURATION IS ${medianS.toFixed(2)}s, OVER ${MEDIAN_SEGMENT_ALARM_S}s.`);
    console.log("        # The chunk-grouping regression in normalize.ts is BACK:");
    console.log("        # segments are swallowing whole Sarvam chunks and the");
    console.log("        # timing resolution the response paid for is being lost.");
    console.log("        ############################################################");
    console.log("");
  }
  check(
    `6. median segment duration stays under ${MEDIAN_SEGMENT_ALARM_S}s (chunk-grouping regression)`,
    medianS <= MEDIAN_SEGMENT_ALARM_S,
    medianS,
  );

  let hiExtract: ApiResult | null = null;
  let extractThrew: string | null = null;
  try {
    hiExtract = await api(faculty.token, "POST", `/api/lectures/${hi.lectureId}/extract`);
  } catch (err) {
    extractThrew = err instanceof Error ? err.message : String(err);
  }
  check(
    "7. extraction runs on a Devanagari transcript without throwing",
    extractThrew === null,
    extractThrew,
  );
  check("7. extraction returns 200", hiExtract?.status === 200, hiExtract?.json);
  // Zero is an honest answer, not a failure: the rules method matches English
  // cues, so a Hindi lecture producing nothing is a measurement.
  console.log(
    `        7. ${hiExtract?.json?.candidateCount} candidates via ` +
      `${hiExtract?.json?.method} v${hiExtract?.json?.version} ` +
      `(zero is an acceptable, honest result for Hindi read by English cues)`,
  );

  // ------------------------------------------------------------------
  section("MISDETECTED. A wrong-language run says so (en-IN course)");
  // ------------------------------------------------------------------
  const misRunPath = await svc
    .from("runs")
    .select("storage_path")
    .eq("id", MISDETECTED_RUN_ID)
    .single();
  if (misRunPath.error || !misRunPath.data?.storage_path) {
    throw new Error(`Cannot resolve the misdetected run's audio: ${misRunPath.error?.message}`);
  }
  console.log(`        run ${MISDETECTED_RUN_ID} -> ${misRunPath.data.storage_path}`);

  const mis = await runLecture({
    token: faculty.token,
    courseCode: `LANG-EN-${stamp}`,
    courseTitle: "Digital Signal Processing",
    language: "en-IN",
    audioPath: misRunPath.data.storage_path as string,
    filename: MISDETECTED_FILENAME,
    lectureTitle: "8-point DIT FFT algorithm",
  });

  check("8. the lecture reaches `transcribed`", mis.reachedTranscribed, mis.row.status);

  const prov = mis.row.provenance ?? {};
  const limitations = (prov.limitations as string[]) ?? [];
  console.log("        9. provenance.limitations, verbatim:");
  limitations.forEach((l, i) => console.log(`             [${i}] ${l}`));

  const mismatchWarning = limitations.some((l) =>
    /reported language .* but the run was configured/i.test(l),
  );
  const lowConfidenceWarning = limitations.some((l) => /language confidence/i.test(l));
  check(
    "9. limitations warn about a language mismatch OR low language confidence",
    mismatchWarning || lowConfidenceWarning,
    limitations,
  );
  console.log(
    `        9. mismatch warning: ${mismatchWarning ? "present" : "absent"}; ` +
      `low-confidence warning: ${lowConfidenceWarning ? "present" : "absent"}`,
  );

  const misRaw = mis.row.raw_transcription_response;
  const engineLanguage = misRaw?.language_code;
  console.log(
    `        10. provenance.language=${JSON.stringify(prov.language)}  ` +
      `provenance.configuredLanguage=${JSON.stringify(prov.configuredLanguage)}  ` +
      `raw.language_code=${JSON.stringify(engineLanguage)}  ` +
      `raw.language_probability=${JSON.stringify(misRaw?.language_probability)}`,
  );
  check(
    "10. provenance.language records what the ENGINE reported",
    prov.language === engineLanguage,
    { provenanceLanguage: prov.language, engineLanguage },
  );
  check(
    "10. provenance.configuredLanguage records the configured en-IN",
    prov.configuredLanguage === "en-IN",
    prov.configuredLanguage,
  );
  check(
    "10. the two are separate fields, so a reader can see them disagree",
    "language" in prov && "configuredLanguage" in prov,
    Object.keys(prov),
  );
  if (prov.language === prov.configuredLanguage) {
    console.log(
      "        10. NOTE: on this fixture the engine reported the SAME code it was " +
        "configured with (en-IN); what it hid is confidence, not the code.",
    );
  }

  const misFixture = readFixture(MISDETECTED_SLUG);
  check(
    "11. the raw response is still stored VERBATIM despite being wrong",
    JSON.stringify(canonical(misRaw)) === JSON.stringify(canonical(misFixture.rawResponse)),
    Object.keys(misRaw ?? {}),
  );
  const misRawTranscript = misRaw?.transcript;
  check(
    "11. nothing filtered or 'corrected' the romanized-Arabic transcript",
    typeof misRawTranscript === "string" &&
      misRawTranscript === (misFixture.rawResponse.transcript as string),
    typeof misRawTranscript === "string" ? misRawTranscript.slice(0, 80) : misRawTranscript,
  );
  console.log(
    `        11. stored transcript begins: ${JSON.stringify(
      typeof misRawTranscript === "string" ? misRawTranscript.slice(0, 100) : misRawTranscript,
    )}`,
  );

  section("Summary");
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log("  FAILED: " + f));
    process.exitCode = 1;
  }
  console.log(`\nHindi lecture:       ${BASE}/courses/${hi.courseId}/lectures/${hi.lectureId}`);
  console.log(`Misdetected lecture: ${BASE}/courses/${mis.courseId}/lectures/${mis.lectureId}`);
}

main().catch((err) => {
  console.error("\nVERIFY-LANGUAGES ABORTED:", err);
  process.exitCode = 1;
});
