// Security regression suite for the 2026-09-07 audit. Run with:
//
//   npm run test:security
//
// (which is `node --conditions=react-server scripts/test-security-regression.mts`
// -- the condition makes the `server-only` import in @/lib/faculty-code a no-op
// so this suite can load it under plain node, exactly as test:faculty does.)
//
// FREE and offline. No network, no database, no provider, no paid call of any
// kind -- every module it imports is pure, and the parts that are not are
// checked by reading the route source rather than by executing it.
//
// EVERY CASE HERE IS A FIXED VULNERABILITY, not a hypothetical. Each block names
// the defect it pins closed, so a future change that reopens one fails with the
// reason attached rather than with "assertion 27 failed". The negative cases
// are the point: this file is mostly about requests and inputs that MUST be
// refused.

import { readFileSync, readdirSync } from "node:fs";
import { safeNext } from "../src/lib/safe-next.ts";
import {
  checkMemoryLimit,
  tryAcquireClaim,
  releaseClaim,
  claimHeld,
  resetLimits,
  LIMITS,
} from "../src/lib/rate-limit-core.ts";
import {
  isAllowedAudio,
  canonicalAudioContentType,
  lectureObjectPath,
} from "../src/lib/storage.ts";
import {
  facultyAttemptBlocked,
  recordFacultyFailure,
  clearFacultyAttempts,
  resetFacultyGlobalThrottle,
} from "../src/lib/faculty-code.ts";

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}

// A literal NUL cannot be written into a source file without turning it into a
// binary blob for every tool that reads it, so it is constructed instead. Same
// reasoning as the character-code tests in src/lib/safe-next.ts: the bytes a
// security check must reject are exactly the bytes that are easiest to mangle
// in transit.
const NUL = String.fromCharCode(0);

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

// Several checks below scan for a code shape. This codebase explains itself at
// length, and its comments quote the very patterns being searched for -- so a
// scan that reads comments reports the explanation of a fixed bug as the bug.
function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

// ---------------------------------------------------------------------------
console.log("--- OPEN REDIRECT: safeNext (fixed 2026-09-07) ---");
// The URL parser DELETES tab, LF and CR before resolving. The old validator
// tested the raw string, so "/\t/evil.com" passed its two prefix checks and
// then resolved to https://evil.com/. Reproduced before the fix.
// ---------------------------------------------------------------------------
const OFF_SITE = [
  "/\t/evil.com",
  "/\n/evil.com",
  "/\r/evil.com",
  "/\tevil.com",
  "//evil.com",
  "/\\evil.com",
  "/\\\\evil.com",
  "/ /evil.com",
  "https://evil.com",
  "//evil.com/courses",
  "/" + NUL + "/evil.com",
  "/ /evil.com",
];
for (const payload of OFF_SITE) {
  const out = safeNext(payload);
  // The real test is not "was it rewritten" but "where does a browser go".
  const resolved = (() => {
    try {
      return new URL(out, "https://classmind.example").origin;
    } catch {
      return "PARSE-ERROR";
    }
  })();
  check(
    resolved === "https://classmind.example",
    `off-site next stays on-site: ${JSON.stringify(payload)}`,
    { returned: out, resolvesTo: resolved },
  );
}

const ON_SITE = [
  "/courses",
  "/courses/8f14e45f-ceea-467a-9f0e-1c2d3b4a5e6f/lectures",
  "/ask",
  "/profile",
  "/courses?tab=owned",
];
for (const dest of ON_SITE) {
  check(safeNext(dest) === dest, `legitimate destination survives: ${dest}`, safeNext(dest));
}
check(safeNext(null) === "/courses", "null falls back to /courses");
check(safeNext("") === "/courses", "empty falls back to /courses");
check(safeNext("courses") === "/courses", "relative (no leading slash) falls back");

// ---------------------------------------------------------------------------
console.log("\n--- PROTOTYPE KEYS: the audio extension map (fixed 2026-09-07) ---");
// AUDIO_EXTENSION_MIME is an object literal, so `"constructor" in map` was TRUE.
// A file named lecture.constructor passed as recognised audio, and
// canonicalAudioContentType returned the Object CONSTRUCTOR FUNCTION as the
// content type -- which was then stored and sent as an HTTP header value.
// ---------------------------------------------------------------------------
for (const key of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
  check(
    isAllowedAudio("", `lecture.${key}`) === false,
    `inherited key is not an audio extension: .${key}`,
  );
  const ct = canonicalAudioContentType("", `lecture.${key}`);
  check(
    typeof ct === "string" && ct.startsWith("audio/"),
    `canonical content type stays an audio/* STRING for .${key}`,
    { type: typeof ct, value: String(ct).slice(0, 40) },
  );
  check(
    lectureObjectPath("11111111-2222-3333-4444-555555555555", `lecture.${key}`) ===
      "11111111-2222-3333-4444-555555555555/original.bin",
    `object path falls back to .bin for .${key}`,
    lectureObjectPath("11111111-2222-3333-4444-555555555555", `lecture.${key}`),
  );
}
check(isAllowedAudio("", "lecture.mp3") === true, "a real extension still passes");
check(isAllowedAudio("audio/mpeg", "recording") === true, "a real audio/* type still passes");
check(isAllowedAudio("", "malware.exe") === false, "an unknown extension is still refused");

// ---------------------------------------------------------------------------
console.log("\n--- STORAGE PATH: no caller-controlled key (fixed 2026-09-07) ---");
// The extension used to be everything after the last dot of the uploader's
// filename, copied verbatim into the object key -- and the key is handed back
// as a signed UPLOAD url. transcribe/route.ts asserts in a comment that the
// extension "comes from the storage path this server generated, never from the
// name the uploader typed"; that is only true now.
// ---------------------------------------------------------------------------
const LECTURE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const HOSTILE_NAMES = [
  "lecture.mp3/../../victim/original.mp3",
  "lecture.mp3/../../../etc/passwd",
  "lecture.%2e%2e%2fvictim",
  "lecture.mp3" + NUL + ".txt",
  "lecture.MP3/..%2f..%2fvictim",
  "../../../../lecture.sh",
  "lecture.",
  "noextension",
];
for (const name of HOSTILE_NAMES) {
  const key = lectureObjectPath(LECTURE, name);
  const shaped = /^[0-9a-f-]{36}\/original\.[a-z0-9]{1,8}$/.test(key);
  check(shaped, `object key is server-shaped for ${JSON.stringify(name)}`, key);
  check(!key.includes(".."), `no traversal segment for ${JSON.stringify(name)}`, key);
  check(!key.includes(NUL), `no null byte for ${JSON.stringify(name)}`, key);
  check(key.startsWith(`${LECTURE}/`), `key stays under its own lecture id`, key);
}

// ---------------------------------------------------------------------------
console.log("\n--- HEADER INJECTION: content type is validated (fixed 2026-09-07) ---");
// The stored content_type is sent to the transcription provider as a header
// value. `.split(";")[0].trim()` strips only the ENDS, so an embedded CR/LF
// survived into a request header.
// ---------------------------------------------------------------------------
const HOSTILE_TYPES = [
  "audio/mpeg\r\nX-Injected: 1",
  "audio/mpeg\nX-Injected: 1",
  "audio/../../etc",
  "audio/mpeg; boundary=\r\nEvil: 1",
  "AUDIO/<script>",
  "audio/" + "a".repeat(500),
];
for (const t of HOSTILE_TYPES) {
  const out = canonicalAudioContentType(t, "recording-with-no-known-ext.zzz");
  check(
    /^audio\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/.test(out),
    `content type is a well-formed MIME token for ${JSON.stringify(t.slice(0, 30))}`,
    out,
  );
  check(!/[\r\n]/.test(out), "no CR/LF survives into the header value", out);
}
check(
  canonicalAudioContentType("audio/mpeg", "x.zzz") === "audio/mpeg",
  "a legitimate reported type is still honoured",
);
check(
  canonicalAudioContentType("application/octet-stream", "lecture.m4a") === "audio/mp4",
  "the curated extension mapping still outranks the browser's report",
);

// ---------------------------------------------------------------------------
console.log("\n--- COST: the sliding window (added 2026-09-07) ---");
// Before this there was NO rate limit on any paid path.
// ---------------------------------------------------------------------------
resetLimits();
const L = { max: 3, windowMs: 60_000 };
const verdicts = [1, 2, 3, 4, 5].map((i) => checkMemoryLimit("b", "userA", L, 1_000 + i));
check(verdicts.slice(0, 3).every((v) => v.allowed), "the first `max` events are allowed");
check(verdicts.slice(3).every((v) => !v.allowed), "everything past `max` is refused");
check(verdicts[3].retryAfterSeconds > 0, "a refusal says how long to wait", verdicts[3]);
check(
  checkMemoryLimit("b", "userB", L, 1_006).allowed,
  "the limit is PER KEY -- one account cannot exhaust another's budget",
);
check(
  checkMemoryLimit("b2", "userA", L, 1_006).allowed,
  "the limit is PER BUCKET -- asking does not consume the extract budget",
);
check(
  checkMemoryLimit("b", "userA", L, 1_001 + 60_000 + 1).allowed,
  "the window really slides: the budget returns after it expires",
);
// A fixed-boundary counter would let 2x through across the reset. Prove it does not.
resetLimits();
for (let i = 0; i < 3; i += 1) checkMemoryLimit("slide", "u", L, 59_000 + i);
check(
  !checkMemoryLimit("slide", "u", L, 60_100).allowed,
  "no double budget across a boundary (a sliding window, not a fixed bucket)",
);

console.log("\n--- COST: the budgets are sane ---");
for (const [name, limit] of Object.entries(LIMITS)) {
  check(
    limit.max > 0 && limit.windowMs > 0 && limit.max < 1000,
    `LIMITS.${name} is a real bound`,
    limit,
  );
}
check(LIMITS.extractBurst.max < LIMITS.extract.max, "the burst bound is tighter than the hourly one");
check(LIMITS.askBurst.max < LIMITS.ask.max, "same for ask");

// ---------------------------------------------------------------------------
console.log("\n--- COST: single flight on the double-spend race (added 2026-09-07) ---");
// findReusableRun SELECTs and recordRun INSERTs after the model is paid, with
// no unique constraint between them: two overlapping extracts of one lecture
// both miss the cache and both pay.
// ---------------------------------------------------------------------------
resetLimits();
check(tryAcquireClaim("extract:L1"), "the first extract takes the claim");
check(!tryAcquireClaim("extract:L1"), "a concurrent extract of the SAME lecture is refused");
check(tryAcquireClaim("extract:L2"), "a different lecture is unaffected");
// The ordering bug this pins: a REFUSED request must not release the holder's
// claim in its finally block.
{
  let claim: string | null = null;
  try {
    const key = "extract:L1";
    if (!tryAcquireClaim(key)) throw new Error("already running");
    claim = key;
  } catch {
    /* refused, as expected */
  } finally {
    releaseClaim(claim);
  }
  check(claimHeld("extract:L1"), "a refused request does NOT release the holder's claim");
}
releaseClaim("extract:L1");
check(!claimHeld("extract:L1"), "the holder's release frees the lecture");
check(tryAcquireClaim("extract:L1"), "and the next run may then start");

// ---------------------------------------------------------------------------
console.log("\n--- THE FACULTY GATE: bounded in aggregate (added 2026-09-07) ---");
// The per-user throttle is keyed by user id, and Google sign-up is free, so five
// guesses per account times unlimited accounts is unlimited guesses. That gate
// now protects course creation and, through requireCourseOwner, every teaching
// and paid route behind it -- so it needs a bound that a new email cannot reset.
// ---------------------------------------------------------------------------
{
  resetFacultyGlobalThrottle();
  const t0 = 1_000_000;
  clearFacultyAttempts("u1");
  for (let i = 0; i < 5; i += 1) recordFacultyFailure("u1", t0 + i);
  check(facultyAttemptBlocked("u1", t0 + 6), "five failures block that account");
  check(!facultyAttemptBlocked("u2", t0 + 6), "a different account is not blocked by it");

  // A fresh account per attempt must NOT buy unlimited guesses.
  resetFacultyGlobalThrottle();
  for (let i = 0; i < 100; i += 1) {
    const freshAccount = `attacker-${i}`;
    clearFacultyAttempts(freshAccount);
    recordFacultyFailure(freshAccount, t0 + i);
  }
  check(
    facultyAttemptBlocked("brand-new-account", t0 + 200),
    "100 failures across 100 DIFFERENT accounts still trips the global bound",
  );
  check(
    !facultyAttemptBlocked("brand-new-account", t0 + 60 * 60 * 1000 + 1_000),
    "the global bound is a window, not a permanent lockout",
  );
  resetFacultyGlobalThrottle();
}

// ---------------------------------------------------------------------------
console.log("\n--- AUTHORIZATION: the shape of the route sources ---");
// These read source rather than executing it: the routes need a server, a
// session and a database, and this suite must stay free and offline. A grep is
// a weaker test than a request -- it proves the call is present, not that it
// runs first -- so each one pins a specific line that a regression would delete.
// The live equivalents are scripts/verify-*.mts.
// ---------------------------------------------------------------------------
{
  const courses = source("src/app/api/courses/route.ts");
  check(
    /requireFaculty\(user\)/.test(courses),
    "POST /api/courses calls requireFaculty -- a student cannot create a course",
  );
  const postBody = courses.slice(courses.indexOf("export async function POST"));
  check(
    postBody.indexOf("requireFaculty(user)") < postBody.indexOf("from(\"courses\")"),
    "the faculty check runs BEFORE the insert",
  );
}
{
  const auth = source("src/lib/auth.ts");
  check(
    /export async function requireCourseOwner\(courseId: string, user: SessionUser\)/.test(auth),
    "requireCourseOwner takes the SessionUser, so it can check the role",
  );
  check(
    /requireCourseOwner[\s\S]{0,400}?requireFaculty\(user\);/.test(auth),
    "requireCourseOwner asserts faculty before anything else",
  );
  check(
    /course\.owner_id === user\.id && user\.role === "faculty"/.test(auth),
    "requireCourseAccess grants the OWNER view only to a faculty account",
  );
  check(
    /export function requireFaculty/.test(auth),
    "requireFaculty exists as a named boundary",
  );
  check(
    /export function dbFailure/.test(auth),
    "dbFailure exists so driver text stays server-side",
  );
}
{
  // No route may still hand a raw driver message to the wire.
  const routes = [
    "src/app/api/courses/route.ts",
    "src/app/api/enroll/route.ts",
    "src/app/api/courses/[id]/context/route.ts",
    "src/app/api/courses/[id]/lectures/route.ts",
    "src/app/api/candidates/[id]/review/route.ts",
    "src/app/api/knowledge/[id]/review/route.ts",
    "src/app/api/lectures/[id]/extract/route.ts",
    "src/app/api/lectures/[id]/poll/route.ts",
  ];
  for (const r of routes) {
    const s = source(r);
    // The test is about what reaches the WIRE, so it looks for a driver message
    // inside a NextResponse.json body -- not for the string anywhere in the
    // file. An internal helper may still pass error.message around; dbFailure is
    // what stops it leaving the server.
    const onTheWire = /NextResponse\.json\(\s*\{[^}]*error:\s*[A-Za-z_$][\w$]*(\?)?\.message/;
    check(!onTheWire.test(s), `no raw database message on the wire: ${r}`);
    // AND the shape that hid two of these from the first sweep: a driver message
    // SPLICED INTO A SENTENCE rather than used as the whole value. The original
    // version of this check looked only for `error: err.message` and passed on
    // `error: \`... : ${err.message}\``, which leaks exactly as much.
    check(
      !/\$\{[A-Za-z_$][\w$.]*\.message\}/.test(stripComments(s)),
      `no driver message interpolated into a response sentence: ${r}`,
    );
  }
}
{
  // Every paid path must consult the limiter.
  const paid: Array<[string, string]> = [
    ["src/app/api/lectures/[id]/extract/route.ts", "extract"],
    ["src/app/api/lectures/[id]/transcribe/route.ts", "transcribe"],
    ["src/app/api/courses/[id]/ask/route.ts", "ask"],
    ["src/app/api/ask/route.ts", "ask"],
    ["src/app/api/enroll/route.ts", "enroll"],
  ];
  for (const [file, bucket] of paid) {
    const s = source(file);
    check(s.includes("enforceMemoryLimit"), `${file} enforces a rate limit`);
    check(s.includes(`LIMITS.${bucket}`), `${file} uses the ${bucket} budget`);
    // PRESENCE IS NOT ORDERING. The two checks above pass identically if the
    // limiter were called AFTER the provider, which is the only thing that
    // actually matters. Assert the limiter precedes the spend.
    const body = stripComments(s);
    const limiter = body.indexOf("enforceMemoryLimit");
    const spend = Math.min(
      ...[
        "reconstructLecture(",
        "provider.submit(",
        "answerFromKnowledge(",
        "svc.storage",
      ]
        .map((needle) => body.indexOf(needle))
        .filter((i) => i >= 0)
        .concat([Number.MAX_SAFE_INTEGER]),
    );
    check(
      limiter >= 0 && limiter < spend,
      `${file}: the limiter runs BEFORE the expensive call`,
      { limiter, spend },
    );
  }
}
{
  const extract = source("src/app/api/lectures/[id]/extract/route.ts");
  check(extract.includes("acquireClaim"), "extract takes a single-flight claim");
  check(extract.includes("releaseClaim(claim)"), "extract releases it");
  check(
    /finally\s*\{\s*releaseClaim/.test(extract),
    "the release is in a finally -- a throw must not lock the lecture forever",
  );
  // The property is "assigned AFTER the acquire", so compare against the
  // ASSIGNMENT, not against the declaration. The original compared
  // `acquireClaim(...)` to `const claimKey`, which is true however the
  // assignment is ordered -- it named a property it did not check.
  check(
    extract.indexOf("claim = claimKey") > extract.indexOf("acquireClaim(claimKey"),
    "the claim key is assigned only after a successful acquire",
    {
      acquire: extract.indexOf("acquireClaim(claimKey"),
      assign: extract.indexOf("claim = claimKey"),
    },
  );
  check(
    /CLAIM_TTL_MS/.test(source("src/lib/rate-limit-core.ts")),
    "the single-flight claim expires, so a platform hard-kill cannot lock a lecture forever",
  );
  check(
    extract.includes("MAX_WINDOWS_PER_PASS"),
    "extract refuses an over-long recording before spending",
  );
}
{
  const mw = source("src/middleware.ts");
  check(/sec-fetch-mode/.test(mw), "middleware inspects Sec-Fetch-Mode");
  check(/cross-site/.test(mw), "middleware refuses cross-site API requests");
  check(
    /site === "cross-site" \|\| site === "same-site"/.test(mw),
    "same-site is refused too -- a sibling subdomain gets Lax cookies as well",
  );
  check(/mode === "navigate"/.test(mw), "a navigation to an API route is refused");
  check(/originHost !== expectedHost/.test(mw), "a foreign Origin is refused");
  check(
    /accept\.includes\("text\/html"\)/.test(mw),
    "an /api request that wants HTML is refused -- closes the navigation class " +
      "without depending on Sec-Fetch, which the browsers most at risk do not send",
  );
  check(
    /request\.headers\.get\("host"\) \?\?/.test(mw),
    "Origin is compared against Host (browser-set), not X-Forwarded-Host (forgeable)",
  );
  check(/Content-Security-Policy/.test(mw), "a CSP is set");
  check(/frame-ancestors 'none'/.test(mw), "framing is denied");
  check(/microphone=\(\)/.test(mw), "the microphone is denied -- this app records audio");
  check(!/unsafe-inline'\s*'unsafe-eval'.*\n.*production/.test(mw), "eval is dev-only");
  // The matcher decides what the gate and the headers even see. Two properties,
  // both of which have been wrong at some point in this file's history.
  check(
    /"\/api\/:path\*"/.test(mw),
    "/api is matched by its own entry, so no path shape can skip the gate",
  );
  check(
    /\.\*\\\\\.\(\?:svg\|png\|jpg\|jpeg\|gif\|webp\|mp3\)\$/.test(mw),
    "the extension exclusion still escapes its dot (a literal '.', not 'any character')",
  );
  check(
    /\(\?!api\|_next\/static/.test(mw),
    "the catch-all entry excludes /api, which the dedicated entry covers",
  );
}
{
  // Knowledge text is interpolated into a billed prompt. Nothing bounded its
  // size at either end, so one course owner could choose the prompt size for
  // every question their students ask.
  const answer = source("src/lib/knowledge/answer.ts");
  check(/function clip\(/.test(answer), "the prompt renderer has a clip() bound");
  for (const field of ["u.title", "u.summary", "e.quote"]) {
    check(
      new RegExp(`clip\\(${field.replace(".", "\\.")}`).test(answer),
      `the prompt bounds ${field}`,
    );
  }
  check(/MAX_STEPS_RENDERED/.test(answer), "the number of steps rendered is bounded");
  const review = source("src/app/api/knowledge/[id]/review/route.ts");
  check(/MAX_SUMMARY/.test(review) && /status: 400/.test(review), "oversized edits are refused at the write path");
}
{
  // The raw provider response is the whole verbatim transcript plus provider
  // metadata. Its gate was `transcript === null` with no isOwner term, so any
  // transcript this codebase could not normalize handed all of it to an
  // enrolled student.
  const lecture = source("src/app/api/lectures/[id]/route.ts");
  check(
    /isOwner && transcript === null \? lecture\.raw_transcription_response/.test(lecture),
    "the raw provider response is owner-only, not merely normalization-gated",
  );
}
{
  // ?error= is rendered on the sign-in page and set from an unauthenticated
  // query parameter. React escapes it (no XSS), but unbounded attacker text on
  // your own sign-in page is a phishing surface.
  const cb = source("src/app/auth/callback/route.ts");
  check(/MAX_ERROR_CHARS/.test(cb), "the reflected sign-in error is length-bounded");
  check(
    /replace\(\/\[\\r\\n\]\+\/g/.test(cb),
    "the reflected sign-in error is collapsed to one line",
  );
  check(/HOSTNAME\.test\(forwardedHost\)/.test(cb), "x-forwarded-host must look like a host");
}
{
  // NO TEST CREDENTIAL MAY BE A LITERAL IN THIS TREE.
  //
  // The password for faculty.test@ and student.test@ was a literal in 17 files
  // here and ~50 tracked at HEAD in a PUBLIC repo. Both accounts are now absent
  // from the live project (verified 2026-09-07) -- but six suites RE-CREATE them
  // on failure (scripts/e2e.mts:105-107 signs in, then admin.createUser), so a
  // literal here re-arms a published faculty credential on the next test run.
  // This sweep is what stops the next one being added.
  const tree: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
      if (["node_modules", ".next", ".git", ".auth"].includes(e.name)) continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(mts|ts|tsx|json|md|sh|mjs)$/.test(e.name)) tree.push(rel);
    }
  };
  for (const top of ["scripts", "design-loop", "src"]) {
    try { walk(top); } catch { /* absent is fine */ }
  }
  // The needle is BUILT, not written. A scanner that contains the string it
  // searches for reports itself -- which is exactly what happened the first time
  // this ran, and is the same self-match that made the comment-stripping helper
  // above necessary.
  const needle = ["Class", "Mind", "Test!"].join("");
  const offenders = tree.filter((f) => {
    try { return source(f).includes(needle); } catch { return false; }
  });
  check(offenders.length === 0, "no hardcoded test-account password anywhere in the tree", offenders);

  const helper = source("scripts/_test-credentials.mts");
  check(
    /process\.env\.CLASSMIND_TEST_PASSWORD/.test(helper),
    "the test credential is read from the environment",
  );
  check(
    !/=\s*["'][^"']{6,}["']\s*;?\s*$/m.test(helper.split("export function testPassword")[1] ?? ""),
    "...with NO fallback default (a default is a published credential again)",
  );
}
{
  const core = source("src/lib/rate-limit-core.ts");
  check(
    !/import .* from/.test(core),
    "rate-limit-core has NO imports, so it stays offline-testable",
  );
}
{
  const migration = source("supabase/migrations/20260907120000_security_hardening.sql");
  check(
    /alter column role drop default/.test(migration),
    "the profiles.role faculty default is dropped",
  );
  check(
    /revoke execute on function public\.claim_reconstruction_job/.test(migration),
    "PUBLIC loses EXECUTE on the claim functions",
  );
  check(
    /revoke all on all tables in schema public from anon, authenticated/.test(migration),
    "anon/authenticated lose the blanket table grants",
  );
}
{
  // The hardening migration's own defects, found by an independent review of it.
  // Each of these was a statement that would have succeeded, changed nothing,
  // and read in the diff exactly like a fix.
  const m = source("supabase/migrations/20260907120000_security_hardening.sql");
  check(
    (m.match(/from public, anon, authenticated/g) ?? []).length === 3,
    "function EXECUTE is revoked from anon and authenticated, not only from PUBLIC " +
      "(Supabase's default privileges give them their own direct ACL entry)",
  );
  check(
    /revoke all on functions from anon, authenticated/.test(m),
    "the default-privileges loop covers FUNCTIONS, not just tables and sequences",
  );
  check(
    !/^revoke all on all tables in schema public/m.test(m),
    "the table/sequence revokes are inside an exception handler, so a missing " +
      "role cannot abort the whole migration",
  );
  check(/raise exception/.test(m), "the migration asserts its own post-condition");
  check(
    (m.match(/set search_path = ''/g) ?? []).length === 3,
    "search_path is pinned on all three reconstruction functions",
  );
  const opens = (m.match(/do \$\$/g) ?? []).length;
  const closes = (m.match(/end \$\$;/g) ?? []).length;
  check(opens === closes && opens > 0, "every DO block is closed", { opens, closes });
}
{
  // Every table in every migration must have RLS enabled. This is the single
  // mechanism keeping the anon key away from product data.
  const dir = new URL("../supabase/migrations/", import.meta.url);
  // Comments are stripped first. These migrations explain themselves at length,
  // and one of them discusses `create table public.something` as a HYPOTHETICAL
  // -- which a naive scan reads as a real table with no RLS and reports as a
  // critical finding. A scanner that cries wolf about prose is a scanner that
  // gets muted.
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(new URL(f, dir), "utf8"))
    .join("\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const created = [...sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/g)].map(
    (m) => m[1],
  );
  const rls = new Set(
    [...sql.matchAll(/alter table public\.([a-z_]+)\s+enable row level security/g)].map(
      (m) => m[1],
    ),
  );
  for (const t of new Set(created)) {
    check(rls.has(t), `RLS is enabled on public.${t}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
