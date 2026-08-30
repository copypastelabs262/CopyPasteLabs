// HOW LONG DOES ONE EXTRACT ACTUALLY TAKE?
//
//   TRANSCRIPTION_PROVIDER=fixture E2E_BASE_URL=http://localhost:3200 \
//     node --env-file=.env.local scripts/qa/extract-timing.mts
//
// `extract/route.ts` declares `maxDuration = 300`, and reconstruct.ts carries a
// budget table predicting ~440s for a 50-minute lecture. Both are claims. This
// measures the real thing, on the real route, for every fixture available.
//
// It exists because scripts/e2e.mts aborted at section 7 with UND_ERR_HEADERS_
// TIMEOUT -- node's fetch gives up waiting for response headers after 300s. That
// abort is itself a data point: the request had not answered in five minutes.
// curl is used for the timed call precisely because it imposes no such ceiling,
// so a run that exceeds the platform budget is MEASURED rather than inferred
// from a client-side timeout.
//
// Creates its own course and lectures and deletes them afterwards.

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3200";
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };
const LAB_AUDIO_PATH = "ccf15fe1-9f7f-48dc-990a-4e16513fe354/original.mp3";

// The declared serverless budget for this route, and the ceiling the deploy
// notes say applies on Vercel's Hobby plan.
const DECLARED_MAX_DURATION_S = 300;
const HOBBY_CEILING_S = 60;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const anon = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  const signIn = await anon.auth.signInWithPassword(FACULTY);
  if (signIn.error) throw new Error(signIn.error.message);
  const token = signIn.data.session!.access_token;
  await api(token, "POST", "/api/profile", { fullName: "Test faculty", role: "faculty" });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(11, 19);
  const c = await api(token, "POST", "/api/courses", {
    code: `QA-T-${stamp}`, title: "Extract timing", term: "QA 2026", transcriptionLanguage: "en-IN",
  });
  const courseId = c.json.course.id as string;

  const download = await svc.storage.from("audio").download(LAB_AUDIO_PATH);
  const bytes = await download.data!.arrayBuffer();

  // Every fixture that is not the quarantine case: a quarantined transcript
  // never reaches reconstruction, so timing it would measure the guard, not the
  // work.
  const fixtures = ["cloud-computing-hinglish", "course-outline-en", "physics-class12-hi"];
  const sha = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const results: { fixture: string; seconds: number; http: string; body: string }[] = [];

  try {
    for (const slug of fixtures) {
      const filename = slug;
      const lec = await api(token, "POST", `/api/courses/${courseId}/lectures`, {
        title: `timing ${slug}`, originalFilename: `qa-timing-${slug}.mp3`,
        fileSizeBytes: bytes.byteLength, contentType: "audio/mpeg",
        checksumSha256: sha, replayFixture: slug,
      });
      if (lec.status !== 200 || !lec.json?.signedUrl) {
        console.log(`\n${filename}: lecture create failed -> ${lec.status} ${JSON.stringify(lec.json)}`);
        continue;
      }
      const id = lec.json.lectureId as string;
      await fetch(lec.json.signedUrl, { method: "PUT", headers: { "content-type": "audio/mpeg" }, body: bytes });
      await api(token, "POST", `/api/lectures/${id}/transcribe`);
      let status = "";
      for (let i = 0; i < 40; i += 1) {
        const p = await api(token, "POST", `/api/lectures/${id}/poll`);
        status = p.json?.status ?? "";
        if (status && !["transcribing", "uploaded"].includes(status)) break;
        await sleep(1000);
      }
      if (status !== "transcribed") {
        console.log(`\n${filename}: reached '${status}', not transcribed -- skipping (no reconstruction to time)`);
        continue;
      }

      const { data: lecRow } = await svc.from("lectures")
        .select("raw_transcription_response").eq("id", id).single();
      const raw = JSON.stringify(lecRow?.raw_transcription_response ?? {});

      console.log(`\n=== ${filename} ===`);
      console.log(`  transcript payload: ${(raw.length / 1024).toFixed(1)} KB`);

      // curl, not fetch: no headers timeout, and it reports the wall clock and
      // the status code for the SAME request rather than for a retry.
      const out = execFileSync("curl", [
        "-s", "-o", "-", "-w", "\\n__HTTP__%{http_code}__TIME__%{time_total}",
        "-X", "POST", "-H", `authorization: Bearer ${token}`,
        "--max-time", "1800",
        `${BASE}/api/lectures/${id}/extract`,
      ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

      const m = out.match(/__HTTP__(\d+)__TIME__([\d.]+)$/);
      const http = m?.[1] ?? "?";
      const seconds = Number(m?.[2] ?? 0);
      const body = out.slice(0, out.lastIndexOf("\n__HTTP__"));
      results.push({ fixture: filename, seconds, http, body });

      let parsed: Payload = null;
      try { parsed = JSON.parse(body); } catch { /* non-JSON */ }
      console.log(`  extract: HTTP ${http} in ${seconds.toFixed(1)}s`);
      if (parsed) {
        console.log(`  windows=${parsed.reconstruction?.windows} calls=${parsed.reconstruction?.calls} ` +
          `failures=${(parsed.reconstruction?.failures ?? []).length} published=${parsed.published}`);
        console.log(`  knowledge=${JSON.stringify(parsed.knowledge)}`);
        if (parsed.reasoningError) console.log(`  reasoningError=${parsed.reasoningError}`);
      }
      const over300 = seconds > DECLARED_MAX_DURATION_S;
      const over60 = seconds > HOBBY_CEILING_S;
      console.log(`  vs maxDuration=${DECLARED_MAX_DURATION_S}s: ${over300 ? "OVER BUDGET" : "within budget"}` +
        `   vs Hobby ${HOBBY_CEILING_S}s: ${over60 ? "OVER" : "within"}`);
    }
  } finally {
    await svc.from("courses").delete().eq("id", courseId);
    console.log(`\nremoved course ${courseId}`);
  }

  console.log("\n--- Summary ---");
  for (const r of results) {
    console.log(`  ${r.fixture.padEnd(34)} ${r.seconds.toFixed(1)}s  HTTP ${r.http}`);
  }
  const worst = results.reduce((a, b) => (b.seconds > a.seconds ? b : a), results[0]);
  if (worst) {
    // These fixtures are short. The number that matters is what they imply for
    // a real lecture, so the extrapolation is stated rather than left to the
    // reader -- and stated as an extrapolation, not as a measurement.
    console.log(`\n  worst measured: ${worst.seconds.toFixed(1)}s on ${worst.fixture}`);
    console.log("  NOTE: these fixtures are minutes long, not 50 minutes. Reconstruction cost");
    console.log("  scales with the number of windows, so treat the above as a floor for a real");
    console.log("  lecture, never as the expected cost of one.");
  }
}

main().catch((e) => { console.error("\nABORTED:", e.message); process.exit(1); });
