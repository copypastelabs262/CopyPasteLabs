// Self-test for the audio-identity guard: does a transcript belong to THIS
// recording?
//
//   node scripts/test-audio-identity.mts                  (pure, no server)
//   node --env-file=.env.local scripts/test-audio-identity.mts --http
//
// TWO HALVES, AND WHY BOTH ARE NEEDED
//
// Part A is pure. It drives src/lib/provenance/audio-identity.ts directly with
// a SIMULATED LEDGER -- a Map keyed exactly as the real primary key is, applied
// with the same insert-or-read semantics the poll route uses. That is what
// makes the cross-contamination invariant testable at all today: the migration
// that creates `provider_audio_identities` is WRITTEN BUT NOT APPLIED, so the
// real table does not exist and no end-to-end run can exercise it. This is
// stated rather than hidden, because a suite that quietly proves less than it
// claims is the exact failure this whole guard exists to stop.
//
// Part B (--http) drives the real routes against a running server and the real
// database. It proves the things a pure test cannot: that a filename can no
// longer select a fixture, that replay is refused where it must be, that a
// missing checksum is refused at creation, and that an ordinary genuine upload
// still passes end to end.
//
// The transcript's CONTENT is never read here. That is transcript-validation's
// job, and the two guards are deliberately orthogonal.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateResult, evaluateSubmission, blocksDerivation, isMissingSchemaError,
  FRESHNESS_TOLERANCE_MS, type AudioIdentity,
} from "../src/lib/provenance/audio-identity.ts";
import { providerFilename, replayIsAllowedIn } from "../src/lib/transcription/types.ts";

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) { passed += 1; console.log(`  PASS  ${label}`); return; }
  failed += 1;
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 400));
}
function section(title: string): void { console.log(`\n--- ${title} ---`); }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------------------
// The simulated ledger
// ---------------------------------------------------------------------------
//
// `insert ... on conflict (provider_audio_id) do nothing returning *`, in a
// Map. The key is the provider identity, exactly as the real primary key is,
// so the property under test -- one identity, one piece of audio -- is the same
// property Postgres would enforce. What it does NOT reproduce is atomicity
// under concurrency; that is the reason the real thing is a primary key and not
// this, and it cannot be tested here.
interface Binding { submittedSha256: string; firstLectureId: string }

class Ledger {
  private rows = new Map<string, Binding>();
  bind(providerAudioId: string, submittedSha256: string, lectureId: string): Binding {
    const existing = this.rows.get(providerAudioId);
    if (existing) return existing;
    const row = { submittedSha256, firstLectureId: lectureId };
    this.rows.set(providerAudioId, row);
    return row;
  }
  get size(): number { return this.rows.size; }
}

// The shape the poll route assembles, minus the I/O.
function pollVerdict(opts: {
  lectureId: string;
  providerJobId: string;
  prior: AudioIdentity | null;
  claimedSha256: string | null;
  submittedSha256: string | null;
  providerAudioId: string | null;
  ledger: Ledger | null;
  submittedAt?: string | null;
  providerCreatedAt?: string | null;
  replayFixtureSlug?: string | null;
}): AudioIdentity {
  let bound: Binding | null = null;
  if (opts.ledger && opts.providerAudioId && opts.submittedSha256) {
    bound = opts.ledger.bind(opts.providerAudioId, opts.submittedSha256, opts.lectureId);
  }
  return evaluateResult({
    lectureId: opts.lectureId,
    providerJobId: opts.providerJobId,
    prior: opts.prior,
    claimedSha256: opts.claimedSha256,
    submittedSha256: opts.submittedSha256,
    declaredBytes: null,
    observedBytes: null,
    providerAudioId: opts.providerAudioId,
    boundToLectureId: bound?.firstLectureId ?? null,
    boundSubmittedSha256: bound?.submittedSha256 ?? null,
    submittedAt: opts.submittedAt ?? null,
    providerCreatedAt: opts.providerCreatedAt ?? null,
    provenanceLectureId: opts.lectureId,
    provenanceProviderJobId: opts.providerJobId,
    replayFixtureSlug: opts.replayFixtureSlug ?? null,
    ledgerAvailable: opts.ledger !== null,
    storageAvailable: opts.ledger !== null,
  });
}

// ===========================================================================
console.log("Audio identity guard\n====================");

section("1. THE CROSS-CONTAMINATION INVARIANT (the core test)");
// Two DIFFERENT uploads whose transcripts come back carrying the SAME provider
// audio identity. This is the 2026-08-22 shape: one recording is told its
// transcript came from audio another recording already claimed.
//
// Nothing here mentions a filename, a course, a language, a lecturer or a
// fixture. The only inputs are two digests and one shared identity.
{
  const ledger = new Ledger();
  const audioA = sha("recording-A");
  const audioB = sha("recording-B");
  const sharedIdentity = "2cb46c01b28a8d4664ef51db8536e02d";

  const first = pollVerdict({
    lectureId: "lecture-A", providerJobId: "job-A", prior: null,
    claimedSha256: audioA, submittedSha256: audioA,
    providerAudioId: sharedIdentity, ledger,
  });
  check(first.verdict === "pass", "the FIRST lecture to claim an identity passes", first);

  const second = pollVerdict({
    lectureId: "lecture-B", providerJobId: "job-B", prior: null,
    claimedSha256: audioB, submittedSha256: audioB,
    providerAudioId: sharedIdentity, ledger,
  });
  check(
    second.verdict === "reject" && second.code === "foreign_audio_identity",
    "a SECOND, DIFFERENT recording claiming the same provider identity is REJECTED",
    second,
  );
  check(
    second.metrics.boundToLectureId === "lecture-A",
    "the rejection names the lecture that already holds the identity",
    second.metrics.boundToLectureId,
  );
  check(
    blocksDerivation(second),
    "and that verdict BLOCKS derivation through the shared gate",
  );
  check(ledger.size === 1, "the identity is bound once, not overwritten by the intruder", ledger.size);

  // The reason a faculty member reads must not require a provenance panel.
  check(
    typeof second.reason === "string" && second.reason.length > 60 &&
      !/sha|hash|sql|ledger|null/i.test(second.reason),
    "the reason is written for a faculty member, not an engineer",
    second.reason,
  );
}

section("2. Legitimate re-transcription is NOT flagged");
// The same audio transcribed twice -- a re-run, or two faculty uploading the
// same recording -- yields the same identity for the same digest. Production
// already contains such pairs. A naive UNIQUE constraint would forbid this,
// which is why the invariant is a functional dependency and not uniqueness.
{
  const ledger = new Ledger();
  const audio = sha("one-and-the-same-recording");
  const identity = "9203e4ef662183be0b907f715efda07b";

  const run1 = pollVerdict({
    lectureId: "lecture-1", providerJobId: "job-1", prior: null,
    claimedSha256: audio, submittedSha256: audio, providerAudioId: identity, ledger,
  });
  const run2 = pollVerdict({
    lectureId: "lecture-2", providerJobId: "job-2", prior: null,
    claimedSha256: audio, submittedSha256: audio, providerAudioId: identity, ledger,
  });
  check(run1.verdict === "pass", "the first transcription passes", run1);
  check(run2.verdict === "pass", "THE SAME AUDIO re-transcribed under a new lecture also passes", run2);
  check(run2.code === null, "and carries no code at all", run2.code);

  // Re-polling the SAME lecture must also stay clean -- the orphan case in the
  // design: the ledger may hold a binding whose lecture write never landed.
  const rePoll = pollVerdict({
    lectureId: "lecture-1", providerJobId: "job-1", prior: run1,
    claimedSha256: audio, submittedSha256: audio, providerAudioId: identity, ledger,
  });
  check(rePoll.verdict === "pass", "re-polling the same lecture is idempotent, not a self-collision", rePoll);
}

section("3. A missing browser checksum is UNVERIFIABLE, not a pass");
// 42 of the 50 production rows have no claim: only the browser path ever sent
// one. Absence must never read as agreement, and must never break an upload.
{
  const bytes = sha("audio-with-no-claim");
  const submit = evaluateSubmission({
    claimedSha256: null, submittedSha256: bytes,
    declaredBytes: 1000, observedBytes: 1000,
    replayFixtureSlug: null, storageAvailable: true,
  });
  check(submit.verdict === "uncertain", "no claim yields `uncertain`", submit);
  check(submit.code === "upload_claim_missing", "with code upload_claim_missing", submit.code);
  check(submit.verdict !== "pass", "it is NOT a pass", submit.verdict);
  check(!blocksDerivation(submit), "and it does NOT block the upload", submit.verdict);

  const ledger = new Ledger();
  const result = pollVerdict({
    lectureId: "legacy-lecture", providerJobId: "job-legacy", prior: submit,
    claimedSha256: null, submittedSha256: bytes,
    providerAudioId: "38e49c1af076af73b52279a793f72ed3", ledger,
  });
  check(
    result.verdict === "uncertain" && result.code === "upload_claim_missing",
    "and it survives to the stored verdict rather than being upgraded at poll",
    result,
  );

  // The same lecture with no claim must still be caught if it collides.
  const collision = pollVerdict({
    lectureId: "other-lecture", providerJobId: "job-other", prior: null,
    claimedSha256: null, submittedSha256: sha("completely-different-audio"),
    providerAudioId: "38e49c1af076af73b52279a793f72ed3", ledger,
  });
  check(
    collision.verdict === "reject" && collision.code === "foreign_audio_identity",
    "an unverified upload is still caught by the invariant -- the claim is not what enforces it",
    collision,
  );
}

section("4. The server-side hash mismatch path");
// The browser hashed file A and something else reached storage. Detected BEFORE
// the provider is called, so no money is spent on audio we cannot vouch for.
{
  const mismatch = evaluateSubmission({
    claimedSha256: sha("the file the teacher chose"),
    submittedSha256: sha("the bytes that actually arrived"),
    declaredBytes: 2048, observedBytes: 2048,
    replayFixtureSlug: null, storageAvailable: true,
  });
  check(mismatch.verdict === "reject", "a digest disagreement is REJECTED", mismatch);
  check(mismatch.code === "stored_audio_mismatch", "with code stored_audio_mismatch", mismatch.code);

  const truncated = evaluateSubmission({
    claimedSha256: sha("whole file"), submittedSha256: sha("whole file"),
    declaredBytes: 5_000_000, observedBytes: 1_200_000,
    replayFixtureSlug: null, storageAvailable: true,
  });
  check(
    truncated.verdict === "reject" && truncated.code === "declared_size_mismatch",
    "a truncated upload is rejected as a size mismatch, which names the real cause",
    truncated,
  );

  // Case sensitivity is not a failure. A client that uppercases its hex must
  // not be quarantined for it.
  const upper = evaluateSubmission({
    claimedSha256: sha("same file").toUpperCase(), submittedSha256: sha("same file"),
    declaredBytes: 10, observedBytes: 10,
    replayFixtureSlug: null, storageAvailable: true,
  });
  check(upper.verdict === "pass", "an uppercase hex claim still matches", upper);

  // A reject decided before the provider ran must not be talked out of it by a
  // provider that later answers politely.
  const ledger = new Ledger();
  const carried = pollVerdict({
    lectureId: "bad-lecture", providerJobId: "job-bad", prior: mismatch,
    claimedSha256: sha("the file the teacher chose"),
    submittedSha256: sha("the bytes that actually arrived"),
    providerAudioId: "brand-new-identity", ledger,
  });
  check(
    carried.verdict === "reject" && carried.code === "stored_audio_mismatch",
    "a submit-time rejection survives the poll rather than being overwritten",
    carried,
  );
}

section("5. Freshness, and the honest limit on it");
{
  const ledger = new Ledger();
  const audio = sha("fresh-audio");
  const submittedAt = "2026-08-22T10:00:00.000Z";

  const stale = pollVerdict({
    lectureId: "stale-lecture", providerJobId: "job-stale", prior: null,
    claimedSha256: audio, submittedSha256: audio, providerAudioId: "id-stale", ledger,
    submittedAt, providerCreatedAt: "2026-08-21T09:00:00.000Z",
  });
  check(
    stale.verdict === "reject" && stale.code === "result_predates_submission",
    "a provider job stamped the DAY BEFORE our submission is rejected (the 5ced44b6 shape)",
    stale,
  );

  const skewed = pollVerdict({
    lectureId: "skewed-lecture", providerJobId: "job-skew", prior: null,
    claimedSha256: audio, submittedSha256: audio, providerAudioId: "id-skew", ledger,
    submittedAt, providerCreatedAt: new Date(Date.parse(submittedAt) - FRESHNESS_TOLERANCE_MS + 1000).toISOString(),
  });
  check(
    skewed.verdict === "pass",
    "clock skew inside the tolerance does NOT quarantine a healthy lecture",
    skewed,
  );

  // Named as a limit, not asserted as a strength: concurrent contamination
  // passes this check, and no tolerance that survives skew could catch it.
  const concurrent = pollVerdict({
    lectureId: "concurrent-lecture", providerJobId: "job-conc", prior: null,
    claimedSha256: audio, submittedSha256: audio, providerAudioId: "id-conc", ledger,
    submittedAt, providerCreatedAt: "2026-08-22T09:59:30.000Z",
  });
  check(
    concurrent.verdict === "pass",
    "KNOWN LIMIT: a mixup 30 seconds before our submit is NOT caught by freshness",
    concurrent,
  );
}

section("6. A provider that echoes no identity, and a job that names the wrong run");
{
  const ledger = new Ledger();
  const audio = sha("silent-provider-audio");
  const noIdentity = pollVerdict({
    lectureId: "quiet-lecture", providerJobId: "job-quiet", prior: null,
    claimedSha256: audio, submittedSha256: audio, providerAudioId: null, ledger,
  });
  check(
    noIdentity.verdict === "uncertain" && noIdentity.code === "provider_audio_id_absent",
    "no provider identity is `uncertain`, not `reject` -- refusing it would refuse every future provider",
    noIdentity,
  );
  check(!blocksDerivation(noIdentity), "and it does not block derivation", noIdentity.verdict);

  const crossed = evaluateResult({
    lectureId: "lecture-X", providerJobId: "job-X", prior: null,
    claimedSha256: audio, submittedSha256: audio, declaredBytes: null, observedBytes: null,
    providerAudioId: "id-x", boundToLectureId: null, boundSubmittedSha256: null,
    submittedAt: null, providerCreatedAt: null,
    provenanceLectureId: "lecture-Y", provenanceProviderJobId: "job-X",
    replayFixtureSlug: null, ledgerAvailable: true, storageAvailable: true,
  });
  check(
    crossed.verdict === "reject" && crossed.code === "job_binding_mismatch",
    "a provenance record naming a DIFFERENT lecture is rejected",
    crossed,
  );
}

section("7. Degrading safely while the migration is unapplied");
// The columns and the ledger do not exist on the current database. The verdict
// must SAY the check did not run -- never report a pass over an absent check.
{
  const audio = sha("degraded-audio");
  const degraded = evaluateResult({
    lectureId: "degraded-lecture", providerJobId: "job-degraded", prior: null,
    claimedSha256: audio, submittedSha256: null, declaredBytes: null, observedBytes: null,
    providerAudioId: "id-degraded", boundToLectureId: null, boundSubmittedSha256: null,
    submittedAt: null, providerCreatedAt: null,
    provenanceLectureId: "degraded-lecture", provenanceProviderJobId: "job-degraded",
    replayFixtureSlug: null, ledgerAvailable: false, storageAvailable: false,
  });
  check(
    degraded.verdict === "uncertain" && degraded.code === "identity_check_unavailable",
    "with no ledger and no columns the verdict is `uncertain`, code identity_check_unavailable",
    degraded,
  );
  check(degraded.verdict !== "pass", "it is NOT a silent pass", degraded.verdict);
  check(
    degraded.metrics.ledgerAvailable === false && degraded.metrics.storageAvailable === false,
    "and the metrics record which facts were unreachable",
    degraded.metrics,
  );
  check(!blocksDerivation(degraded), "an unavailable check does not block the pipeline", degraded.verdict);

  // The predicate that drives the fallback, against the real error codes
  // Postgres and PostgREST return -- these are the ones observed on this
  // database on 2026-08-30.
  check(
    isMissingSchemaError({ code: "42703", message: "column lectures.submitted_audio_sha256 does not exist" }),
    "a missing column is recognised (42703)",
  );
  check(
    isMissingSchemaError({ code: "PGRST205", message: "Could not find the table 'public.provider_audio_identities' in the schema cache" }),
    "a missing table is recognised (PGRST205)",
  );
  check(
    isMissingSchemaError({ code: "PGRST204", message: "Could not find the 'audio_identity' column of 'lectures' in the schema cache" }),
    "a missing column on WRITE is recognised (PGRST204)",
  );
  check(
    !isMissingSchemaError({ code: "23505", message: "duplicate key value violates unique constraint" }),
    "a REAL error is not swallowed as a missing column",
  );
  check(!isMissingSchemaError(null), "no error is not a missing column");
}

section("8. A deliberate replay is never reported as a pass");
{
  const ledger = new Ledger();
  const audio = sha("replayed-lecture-audio");
  const replay = pollVerdict({
    lectureId: "replay-lecture", providerJobId: "fixture:course-outline-en:1787402755651", prior: null,
    claimedSha256: audio, submittedSha256: audio,
    providerAudioId: "2cb46c01b28a8d4664ef51db8536e02d", ledger,
    replayFixtureSlug: "course-outline-en",
  });
  check(
    replay.verdict === "uncertain" && replay.code === "replayed_transcript",
    "a replay is `uncertain` and names the fixture, never `pass`",
    replay,
  );
  check(
    (replay.reason ?? "").includes("course-outline-en"),
    "and the reason names which sample was replayed",
    replay.reason,
  );
}

section("9. Nothing is keyed to the incident");
// Every check above is driven by digests, an identity, timestamps and a job id.
// This asserts the negative directly against the module's own source: if a
// future edit reintroduces a filename, a course, a language or a subject as an
// input to the verdict, it fails here.
{
  const source = readFileSync(join(process.cwd(), "src/lib/provenance/audio-identity.ts"), "utf8");
  // Comments AND string literals are stripped. The reason strings are prose
  // written for a faculty member and legitimately contain the word
  // "transcript"; what must not appear is the module READING such a thing.
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
  for (const forbidden of [
    "original_filename", "originalFilename", "filename",
    "course_id", "courseId", "owner_id", "ownerId",
    "language_code", "languageCode", "transcript",
    "Cloud computing", "thermodynamics",
  ]) {
    check(
      !code.includes(forbidden),
      `the verdict never reads "${forbidden}"`,
    );
  }
  // And the fixture slug appears only as an opaque string in a metric and a
  // reason, never as a value anything branches on by name.
  const slugs = readdirSync(join(process.cwd(), "fixtures", "transcription"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  check(
    slugs.every((slug) => !code.includes(slug)),
    "no fixture slug is named in the verdict logic",
    slugs.filter((slug) => code.includes(slug)),
  );
  check(slugs.length >= 3, "…and there really are fixtures to have named", slugs.length);
}

section("10. The provider is told OUR identifier, not the uploader's filename");
{
  const name = providerFilename({
    bytes: new ArrayBuffer(0),
    lectureId: "5ced44b6-e156-4ddb-9146-14035d366620",
    fileExtension: "mp3",
    contentType: "audio/mpeg",
  });
  check(
    name === "5ced44b6-e156-4ddb-9146-14035d366620.mp3",
    "the provider-side filename is <lectureId>.<ext>",
    name,
  );
  check(
    !/cloud|computing|lecture|\s/i.test(name),
    "and carries nothing the uploader chose",
    name,
  );
  const odd = providerFilename({
    bytes: new ArrayBuffer(0), lectureId: "abc", fileExtension: "../../etc/passwd",
    contentType: "audio/mpeg",
  });
  check(
    odd === "abc.etcpasswd" && !odd.includes("/") && !odd.includes(".."),
    "a hostile extension keeps no separator and no traversal",
    odd,
  );
  const none = providerFilename({
    bytes: new ArrayBuffer(0), lectureId: "abc", fileExtension: "", contentType: "audio/mpeg",
  });
  check(none === "abc.bin", "an empty extension falls back to .bin", none);
}

section("11. Replay CANNOT be selected on a deployment, and no env var can buy it back");
// The real rule, EXECUTED against simulated environments -- not a copy of it,
// and not a comment about it. `replayIsAllowedHere()` is this function bound to
// process.env, so what passes here is what runs in the route.
{
  check(replayIsAllowedIn({}), "replay is allowed on a bare developer machine");
  check(!replayIsAllowedIn({ VERCEL: "1" }), "VERCEL=1 refuses replay (production AND preview)");
  check(
    !replayIsAllowedIn({ NODE_ENV: "production" }),
    "a production build refuses replay even off Vercel",
  );
  check(
    !replayIsAllowedIn({ VERCEL: "1", NODE_ENV: "production" }),
    "both signals together still refuse",
  );

  // THE ASYMMETRY. ALLOW_LIVE_SARVAM permits deliberate SPENDING on a
  // developer machine. It must never permit replay anywhere -- the two
  // switches point in opposite directions, and a future edit that wired them
  // together would undo the whole guarantee.
  check(
    !replayIsAllowedIn({ VERCEL: "1", ALLOW_LIVE_SARVAM: "1" } as Record<string, string>),
    "ALLOW_LIVE_SARVAM cannot re-enable replay on a deployment",
  );
  for (const rogue of ["TRANSCRIPTION_PROVIDER", "ALLOW_LIVE_SARVAM", "FORCE_FIXTURE", "CI"]) {
    check(
      !replayIsAllowedIn({ VERCEL: "1", [rogue]: "fixture" } as Record<string, string>),
      `no value of ${rogue} re-enables replay on a deployment`,
    );
  }

  // And the binding is the real one: index.ts must hand it process.env rather
  // than re-deriving the rule, or the two could drift apart.
  const indexSource = readFileSync(join(process.cwd(), "src/lib/transcription/index.ts"), "utf8");
  check(
    /replayIsAllowedHere\(\): boolean \{\s*return replayIsAllowedIn\(process\.env\);\s*\}/.test(indexSource),
    "the route's replayIsAllowedHere() is exactly this rule bound to process.env",
  );
  check(
    !/process\.env\.TRANSCRIPTION_PROVIDER/.test(indexSource),
    "TRANSCRIPTION_PROVIDER is read nowhere in provider selection",
  );
}

section("12. AudioIdentity is shape-identical to TranscriptValidation");
// The two verdicts are read by ONE helper. If their shapes drift, the gate
// silently starts covering only one of them.
{
  const identity = evaluateSubmission({
    claimedSha256: sha("x"), submittedSha256: sha("x"),
    declaredBytes: 1, observedBytes: 1, replayFixtureSlug: null, storageAvailable: true,
  });
  const keys = Object.keys(identity).sort().join(",");
  check(keys === "code,metrics,reason,verdict", "same four top-level fields", keys);
  for (const verdict of ["pass", "uncertain", "reject"]) {
    check(
      blocksDerivation({ verdict }) === (verdict === "reject"),
      `the shared gate blocks on "${verdict}" iff it is a rejection`,
    );
  }
  check(
    blocksDerivation({ verdict: "pass" }, { verdict: "reject" }),
    "and it blocks when EITHER record rejects",
  );
  check(!blocksDerivation(null, undefined), "a missing record blocks nothing");
}

// ===========================================================================
// Part B -- the real routes, the real database
// ===========================================================================

async function httpChecks(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3300";
  const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const FACULTY = { email: "faculty.test@classmind.local", password: "ClassMindTest!2026" };
  const LAB_AUDIO_PATH = "ccf15fe1-9f7f-48dc-990a-4e16513fe354/original.mp3";

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

  const anon = createClient(PROJECT_URL, ANON, { auth: { persistSession: false } });
  let signIn = await anon.auth.signInWithPassword(FACULTY);
  if (signIn.error) {
    await svc.auth.admin.createUser({ ...FACULTY, email_confirm: true });
    signIn = await anon.auth.signInWithPassword(FACULTY);
    if (signIn.error) throw new Error(`sign in failed: ${signIn.error.message}`);
  }
  const token = signIn.data.session!.access_token;
  await api(token, "POST", "/api/profile", { fullName: "Test Faculty", role: "faculty" });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(11, 19);
  const created = await api(token, "POST", "/api/courses", {
    code: `IDENT-${stamp}`, title: "Audio identity checks",
    term: "Autumn 2026", transcriptionLanguage: "en-IN",
  });
  if (created.status !== 200) throw new Error(`course create failed: ${JSON.stringify(created.json)}`);
  const courseId: string = created.json.course.id;

  const dl = await svc.storage.from("audio").download(LAB_AUDIO_PATH);
  if (dl.error || !dl.data) throw new Error(`cannot read lab audio: ${dl.error?.message}`);
  const bytes = Buffer.from(await dl.data.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");

  section("HTTP 1. A filename can no longer select a fixture");
  // The exact shape of the 2026-08-22 failure, driven through the real route.
  for (const filename of ["course-outline-en.mp3", "Cloud computing.mp3", "fft-lecture-misdetected.mp3"]) {
    const lec = await api(token, "POST", `/api/courses/${courseId}/lectures`, {
      title: `filename control: ${filename}`, originalFilename: filename,
      fileSizeBytes: 4096, contentType: "audio/mpeg",
      checksumSha256: createHash("sha256").update(filename).digest("hex"),
    });
    check(
      lec.status === 200 && lec.json?.replayFixture === null,
      `"${filename}" selects no fixture`,
      { status: lec.status, replayFixture: lec.json?.replayFixture },
    );
  }

  section("HTTP 2. Replay is per-lecture, named, and validated");
  const unknown = await api(token, "POST", `/api/courses/${courseId}/lectures`, {
    title: "unknown fixture", originalFilename: "x.mp3",
    fileSizeBytes: 4096, contentType: "audio/mpeg",
    checksumSha256: sha("unknown"), replayFixture: "not-a-real-fixture",
  });
  check(unknown.status === 400, "an unknown fixture slug is refused with 400", unknown.json);

  section("HTTP 3. A missing checksum claim is refused at creation");
  const noClaim = await api(token, "POST", `/api/courses/${courseId}/lectures`, {
    title: "no checksum", originalFilename: "y.mp3",
    fileSizeBytes: 4096, contentType: "audio/mpeg",
  });
  check(noClaim.status === 400, "no checksumSha256 is a 400", { status: noClaim.status, json: noClaim.json });
  check(
    /checksumSha256/.test(JSON.stringify(noClaim.json)),
    "and the message names the field, so a script author can fix it",
    noClaim.json,
  );
  const badClaim = await api(token, "POST", `/api/courses/${courseId}/lectures`, {
    title: "bad checksum", originalFilename: "z.mp3",
    fileSizeBytes: 4096, contentType: "audio/mpeg", checksumSha256: "not-a-digest",
  });
  check(badClaim.status === 400, "a malformed digest is refused rather than compared", badClaim.json);

  section("HTTP 4. POSITIVE CONTROL — an ordinary genuine upload passes end to end");
  // A real object, a correct claim, the real routes. Replay is named so this
  // costs nothing; what is under test is the identity path, not the ASR call.
  const good = await api(token, "POST", `/api/courses/${courseId}/lectures`, {
    title: "Ordinary lecture", originalFilename: "Week 2 recording.mp3",
    fileSizeBytes: bytes.byteLength, contentType: "audio/mpeg",
    checksumSha256: digest, replayFixture: "course-outline-en",
  });
  check(good.status === 200, "the lecture is created", good.json);
  const lectureId: string = good.json.lectureId;

  // THE COST GUARD. Read back from the database, not from the response that
  // asked for it. If the replay did not stick, the transcribe below would make
  // a live, billable Sarvam call -- so this THROWS rather than continuing.
  // While migration 20260830150000 is unapplied the column does not exist; that
  // case is named explicitly and falls back to the API's own "process-memory"
  // persistence flag, never to silence.
  {
    const back = await svc
      .from("lectures").select("replay_fixture_slug").eq("id", lectureId).maybeSingle();
    const refuse = (why: string) => {
      throw new Error(
        `Refusing to continue: this run is making live paid transcription calls. ${why}`,
      );
    };
    if (back.error) {
      const missingColumn = /replay_fixture_slug/.test(back.error.message) &&
        (back.error.code === "42703" || /does not exist/i.test(back.error.message));
      if (!missingColumn) refuse(`could not read the lecture back: ${back.error.message}.`);
      if (good.json?.replayFixture !== "course-outline-en") refuse("the API did not record the replay.");
      if (good.json?.replayPersistence !== "process-memory") {
        refuse("the column is missing and the API did not fall back to process memory.");
      }
      console.log('        transcription: REPLAY of "course-outline-en" (server memory only -- ' +
        "migration 20260830150000_audio_identity.sql is NOT applied)");
    } else {
      const stored = (back.data as { replay_fixture_slug?: string | null } | null)?.replay_fixture_slug ?? null;
      if (stored !== "course-outline-en") refuse(`the row says replay_fixture_slug=${JSON.stringify(stored)}.`);
      console.log('        transcription: REPLAY of "course-outline-en" (recorded on the row)');
    }
  }

  const put = await fetch(good.json.signedUrl, {
    method: "PUT", headers: { "content-type": "audio/mpeg" }, body: new Uint8Array(bytes),
  });
  check(put.ok, "the audio uploads through the signed URL", put.status);

  const sub = await api(token, "POST", `/api/lectures/${lectureId}/transcribe`, { expectReplay: true });
  check(sub.status === 200, "transcription is submitted", sub.json);
  check(
    sub.json?.audioIdentity?.verdict !== "reject",
    "the identity check does NOT reject a genuine upload",
    sub.json?.audioIdentity,
  );
  check(
    sub.json?.audioIdentity?.code !== "stored_audio_mismatch",
    "the server's own digest agrees with the browser's claim",
    sub.json?.audioIdentity,
  );
  check(
    typeof sub.json?.hashMs === "number" && sub.json.hashMs < 5000,
    `server-side SHA-256 of ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB is cheap (measured, not assumed)`,
    { hashMs: sub.json?.hashMs, bytes: bytes.byteLength },
  );
  if (sub.json?.identityStored === false) {
    console.log("        NOTE: audio_identity could not be STORED -- migration 20260830150000 is not applied.");
  }

  let status = "transcribing";
  let poll: Payload = null;
  for (let i = 0; i < 30 && status === "transcribing"; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    poll = await api(token, "POST", `/api/lectures/${lectureId}/poll`);
    status = poll.json?.status ?? "unknown";
  }
  check(status === "transcribed", "the lecture reaches `transcribed`, not quarantined", status);
  check(
    poll?.json?.audioIdentity?.verdict !== "reject",
    "and its stored identity verdict is not a rejection",
    poll?.json?.audioIdentity,
  );
  check(
    typeof poll?.json?.audioIdentity?.verdict === "string",
    "the verdict is reported even when it cannot be stored",
    poll?.json?.audioIdentity,
  );
  if (poll?.json?.identityStored === false) {
    check(
      poll.json.audioIdentity.verdict !== "pass",
      "an UNAVAILABLE check never reports `pass`",
      poll.json.audioIdentity,
    );
  }

  console.log(`\ncourse: ${courseId}\nlecture: ${lectureId}`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--http")) {
    await httpChecks();
  } else {
    console.log("\n(pure checks only; pass --http with a running dev server for the route checks)");
  }

  section("Summary");
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => { console.error("\nABORTED:", err); process.exitCode = 1; });
