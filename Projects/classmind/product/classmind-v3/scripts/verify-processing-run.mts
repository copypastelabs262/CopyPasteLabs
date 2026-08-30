// Drives ONE real /extract through the real route and reports exactly what it
// cost and what it produced.
//
//   node --env-file=.env.local scripts/verify-processing-run.mts <lectureId> [--force]
//
// VERIFICATION TOOLING. It changes nothing in the pipeline and asserts nothing
// into existence: every number below is read back from the database or from the
// route's own response, never computed here and reported as if observed.
//
// It exists because the three claims Phase 0 and 1A make -- the ledger meters,
// the reuse guard refuses to pay twice, and no knowledge is stored without
// verified evidence -- are all claims about what happens INSIDE the route.
// Calling reconstructLecture directly would test none of them.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { normalizeRawTranscript } from "../src/lib/transcript/normalize.ts";
// The ENGINE'S OWN verifier. An independent re-implementation here would test
// the re-implementation: the first version of this script matched quotes as
// substrings of transcript.text, which interleaves [mm:ss] reading markers, and
// reported six perfectly good quotes as ungrounded. locateQuote is what the
// pipeline actually uses, so it is what this must use.
import { __internals } from "../src/lib/reasoning/reconstruct.ts";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3300";
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const lectureId = process.argv[2];
const force = process.argv.includes("--force");
if (!lectureId) { console.error("usage: verify-processing-run.mts <lectureId> [--force]"); process.exit(1); }

let passed = 0;
const failures: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) { passed += 1; console.log(`  PASS  ${label}`); return; }
  failures.push(label);
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 400));
}
const section = (t: string) => console.log(`\n--- ${t} ---`);

// ---------------------------------------------------------------------------

const { data: lecture } = await svc.from("lectures")
  .select("id, course_id, title, status, raw_transcription_response").eq("id", lectureId).maybeSingle();
if (!lecture) { console.error("lecture not found"); process.exit(1); }

const transcript = normalizeRawTranscript(lecture.raw_transcription_response);
if (!transcript) { console.error("transcript will not normalize"); process.exit(1); }
const fingerprint = createHash("sha256").update(transcript.text, "utf8").digest("hex");

// An owner session, minted the same way verify-knowledge-pipeline.mts does. The
// route is behind requireCourseOwner and must stay that way for this test.
const { data: course } = await svc.from("courses").select("owner_id").eq("id", lecture.course_id).maybeSingle();
const { data: owner } = await svc.auth.admin.getUserById(course!.owner_id as string);
const ownerEmail = owner.user!.email!;
const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: "magiclink", email: ownerEmail });
if (linkErr) { console.error("could not mint owner session:", linkErr.message); process.exit(1); }
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const { data: session, error: otpErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
if (otpErr) { console.error("could not verify session:", otpErr.message); process.exit(1); }
const token = session.session!.access_token;

// ---- BEFORE ---------------------------------------------------------------

async function knowledgeSnapshot() {
  const { data } = await svc.from("knowledge_items")
    .select("id,category,kind,title,status,reconstruction_method,reconstruction_version,created_at")
    .eq("lecture_id", lectureId).order("created_at");
  const { count: ev } = await svc.from("knowledge_evidence")
    .select("id", { count: "exact", head: true }).eq("lecture_id", lectureId);
  return { items: data ?? [], evidence: ev ?? 0 };
}

const before = await knowledgeSnapshot();
const { count: runsBefore } = await svc.from("processing_runs").select("id", { count: "exact", head: true });

console.log("=== BEFORE ===");
console.log("  lecture      :", lecture.title, `(${lectureId})`);
console.log("  status       :", lecture.status);
console.log("  transcript   :", transcript.text.length, "chars |", fingerprint.slice(0, 16) + "...");
console.log("  knowledge    :", before.items.length, "items /", before.evidence, "evidence");
console.log("  by status    :", JSON.stringify(before.items.reduce((a: Record<string, number>, i) => ({ ...a, [i.status as string]: (a[i.status as string] ?? 0) + 1 }), {})));
console.log("  by method    :", JSON.stringify([...new Set(before.items.map((i) => `${i.reconstruction_method} v${i.reconstruction_version}`))]));
console.log("  ledger rows  :", runsBefore);
console.log("  FORCE        :", force);

// Ids that exist BEFORE the run. Anything not in this set afterwards was
// produced by this run; anything still in it survived a human verdict. This is
// the only honest way to separate the two, and reporting the final total as
// "what the model produced" would be a lie of exactly the size of that set.
const beforeIds = new Set(before.items.map((i) => i.id as string));
const beforeConfirmed = before.items.filter((i) => i.status === "confirmed" || i.status === "rejected");

// ---- RUN ------------------------------------------------------------------

section("Running /extract" + (force ? "?force=1" : ""));
const started = Date.now();
const res = await fetch(`${BASE}/api/lectures/${lectureId}/extract${force ? "?force=1" : ""}`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}` },
});
const wall = Date.now() - started;
const body = await res.json().catch(() => ({}));
console.log("  HTTP", res.status, "in", (wall / 1000).toFixed(1), "s");
if (!res.ok) { console.log("  body:", JSON.stringify(body).slice(0, 600)); process.exit(1); }

const p = body.processing ?? {};
console.log("\n=== ROUTE RESPONSE: processing ===");
console.log(JSON.stringify(p, null, 2));
console.log("\n=== ROUTE RESPONSE: reconstruction ===");
console.log(JSON.stringify(body.reconstruction, null, 2));
console.log("\n=== ROUTE RESPONSE: knowledge / readiness ===");
console.log(JSON.stringify({ knowledge: body.knowledge, status: body.status, published: body.published, readiness: body.readiness, reasoningError: body.reasoningError }, null, 2));

// ---- AFTER ----------------------------------------------------------------

const after = await knowledgeSnapshot();
const newItems = after.items.filter((i) => !beforeIds.has(i.id as string));
const survivors = after.items.filter((i) => beforeIds.has(i.id as string));

section("Ledger");
const { data: runs } = await svc.from("processing_runs").select("*").eq("lecture_id", lectureId).order("created_at", { ascending: false });
const run = runs?.[0];
check(Boolean(run), "a processing_runs row was written");
if (run) {
  console.log(JSON.stringify(run, null, 2));
  check(run.transcript_sha256 === fingerprint, "the ledger keyed on THIS transcript", run.transcript_sha256);
  check(typeof run.provider === "string" && run.provider.length > 0, "provider recorded", run.provider);
  check(typeof run.model === "string" && run.model.length > 0, "model recorded", run.model);
  check(run.forced === force, `forced flag is ${force}`, run.forced);
  check(typeof run.duration_ms === "number" && run.duration_ms > 0, "duration recorded", run.duration_ms);
  if (p.reused) {
    check(run.outcome === "reused", "outcome is 'reused'", run.outcome);
    check(run.calls === 0, "ZERO model calls on a reused run", run.calls);
    check(run.prompt_tokens === null && run.completion_tokens === null, "no tokens charged on a reused run", { p: run.prompt_tokens, c: run.completion_tokens });
  } else {
    check(run.calls > 0, "a paid run recorded its call count", run.calls);
    // Tokens are only owed when something was actually generated. A run whose
    // every window was REJECTED (429, 503) burns requests but produces no
    // completion and therefore no usage -- demanding tokens there would fail
    // the test for behaving correctly.
    const anySucceeded = (run.calls as number) > (run.failed_windows as number);
    if (anySucceeded) {
      check(run.prompt_tokens !== null || run.completion_tokens !== null,
        "token usage recorded for a run that generated something",
        { p: run.prompt_tokens, c: run.completion_tokens });
    } else {
      check(run.prompt_tokens === null && run.completion_tokens === null,
        "no tokens recorded, because every window was rejected before generating",
        { failed: run.failed_windows, calls: run.calls });
      console.log("        NOTE: all", run.failed_windows, "windows failed. This run cost requests, not tokens.");
    }
  }
}

section("Knowledge accounting");
console.log(`  before: ${before.items.length} items / ${before.evidence} evidence`);
console.log(`  after : ${after.items.length} items / ${after.evidence} evidence`);
console.log(`  NEW this run (model-produced) : ${newItems.length}`);
console.log(`  SURVIVED from before          : ${survivors.length}  ${survivors.map((s) => `[${s.status}] ${s.title}`).join(" | ")}`);
// What SHOULD have survived depends on whether a write happened at all.
//
// storeKnowledge refuses to let an INCOMPLETE pass overwrite a populated
// lecture -- it returns outcome 'preserved' and touches nothing. In that case
// everything survives, and that is the guard working, not a failure. Only when
// a write really occurred does "human verdicts and nothing else" apply.
const writeOutcome = body.knowledge?.outcome ?? "(none)";
if (writeOutcome === "preserved" || newItems.length === 0) {
  check(survivors.length === before.items.length,
    `nothing was overwritten (outcome='${writeOutcome}'), so all ${before.items.length} prior items survive`,
    { survivors: survivors.length, before: before.items.length });
  check((body.knowledge?.replaced ?? 0) === 0, "and the ledger agrees nothing was replaced", body.knowledge);
} else {
  check(survivors.length === beforeConfirmed.length,
    "every human-judged item survived, and nothing else did",
    { survivors: survivors.length, expected: beforeConfirmed.length });
  check(survivors.every((s) => s.status === "confirmed" || s.status === "rejected"),
    "survivors are exactly the human verdicts");
}

section("Evidence grounding -- every stored quote must be real speech");
const { data: evidence } = await svc.from("knowledge_evidence")
  .select("id,knowledge_item_id,quote,start_ms,end_ms").eq("lecture_id", lectureId);
// Same three inputs the engine builds once per lecture and reuses per quote.
const spoken = __internals.buildSpoken(transcript);
const collapsedSpoken = __internals.collapse(spoken.text);
let located = 0, missing = 0;
const misses: string[] = [];
for (const e of evidence ?? []) {
  const q = String(e.quote ?? "");
  if (q.trim() && __internals.locateQuote(q, transcript, spoken, collapsedSpoken)) { located += 1; continue; }
  missing += 1;
  misses.push(q.trim() ? q.slice(0, 90) : "(empty quote)");
}
console.log(`  ${located} locatable in the spoken transcript | ${missing} NOT FOUND`);
for (const m of misses.slice(0, 5)) console.log("    MISSING:", JSON.stringify(m));
check(missing === 0, "EVERY stored evidence quote is locatable by the engine's own verifier", { missing });

const itemsWithoutEvidence = after.items.filter(
  (i) => !(evidence ?? []).some((e) => e.knowledge_item_id === i.id),
);
check(itemsWithoutEvidence.length === 0,
  "no knowledge item is stored without evidence",
  itemsWithoutEvidence.map((i) => i.title));

section("Final state");
const { data: lecAfter } = await svc.from("lectures").select("status,error_message").eq("id", lectureId).maybeSingle();
console.log("  lecture status:", lecAfter?.status, lecAfter?.error_message ? `(${lecAfter.error_message})` : "");
console.log("\n  Items produced by this run:");
for (const i of newItems) console.log(`    [${i.category}/${i.kind}] ${i.title}`);

console.log(`\n--- Summary ---\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exitCode = 1; }
