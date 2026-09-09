import "server-only";
import { timingSafeEqual } from "node:crypto";

// THE FACULTY GATE, server-side and nowhere else.
//
// Becoming faculty is a privileged act: a faculty account creates courses,
// uploads lectures, and sees the teaching console. So it is gated by a shared
// secret the institution holds, checked HERE, on the server, at the moment the
// role is written -- never in the browser.
//
// The secret lives only in FACULTY_ACCESS_CODE (a server env var, deliberately
// NOT prefixed NEXT_PUBLIC_ so Next never inlines it into the client bundle).
// It is never sent to the client, never logged, never returned in a response.
// The client only ever sends the code the USER typed; this module decides.
//
// FAIL CLOSED. If no code is configured, faculty creation is refused outright
// rather than silently opened -- a missing secret must never mean "anyone may
// be faculty".

export function facultyCodeConfigured(): boolean {
  const secret = process.env.FACULTY_ACCESS_CODE;
  return typeof secret === "string" && secret.length > 0;
}

// Constant-time comparison: a plain `===` leaks, through timing, how many
// leading characters matched, which is exactly the signal a brute-force wants.
// Length is compared first (timingSafeEqual throws on unequal lengths), and a
// mismatched length is itself a "no" -- the length of the real secret is not
// something we defend, only its contents.
export function verifyFacultyCode(candidate: unknown): boolean {
  const secret = process.env.FACULTY_ACCESS_CODE;
  if (typeof secret !== "string" || secret.length === 0) return false; // fail closed
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Best-effort abuse throttle for the faculty code, keyed by the authenticated
// user id. It lives in module memory, so it holds within a warm server
// instance and resets on a cold start -- imperfect on serverless, but it costs
// nothing, needs no new infrastructure, and adds real friction to a
// scripted brute force from one account. A durable limiter is future work; the
// primary control is a strong secret compared in constant time.
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

// THE PER-USER THROTTLE IS NOT A BRUTE-FORCE CONTROL ON ITS OWN (2026-09-07,
// security audit).
//
// It is keyed by the authenticated user id, and a user id is free: Google
// sign-up is open, so an attacker mints a new account, spends its five guesses,
// and mints another. Five per account times unlimited accounts is unlimited.
//
// That mattered more after this audit than before it. requireFaculty now gates
// course creation and, through requireCourseOwner, every teaching and paid
// route behind it -- so FACULTY_ACCESS_CODE went from guarding a label to
// guarding the whole privileged surface and the spending attached to it. The
// one gate deserves a bound that does not reset with a new email address.
//
// A GLOBAL budget, deliberately generous. An institution onboards its teaching
// staff in bursts, and a wrong code typed by a real lecturer is common; 100
// failures an hour across the entire deployment is far above that and far below
// anything that makes guessing a meaningful strategy against a strong secret.
//
// THE COST, STATED: a determined attacker can burn the global budget and block
// faculty sign-up for up to an hour. That is a real denial of service and it is
// the accepted trade -- an hour's delay in creating a teaching account is
// recoverable, and the alternative is leaving the product's only privilege gate
// with no aggregate bound at all. The refusal is LOUD in the server log
// precisely so that hour is not silent: an operator seeing it knows the gate is
// under attack, which is information the previous version never produced.
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_MAX_FAILURES = 100;
let globalFailures: { count: number; first: number } | null = null;

function globalBlocked(now: number): boolean {
  if (!globalFailures) return false;
  if (now - globalFailures.first > GLOBAL_WINDOW_MS) {
    globalFailures = null;
    return false;
  }
  return globalFailures.count >= GLOBAL_MAX_FAILURES;
}

export function facultyAttemptBlocked(userId: string, now: number): boolean {
  if (globalBlocked(now)) return true;
  const rec = attempts.get(userId);
  if (!rec) return false;
  if (now - rec.first > WINDOW_MS) {
    attempts.delete(userId);
    return false;
  }
  return rec.count >= MAX_FAILURES;
}

// EVERY FAILURE IS LOGGED. The previous version recorded failures in memory and
// printed nothing, so a sustained attack on the product's only privilege gate
// left no trace anywhere -- the same defect class as the unmetered spend that
// emptied the Sarvam balance: real, ongoing, and invisible. The user id is
// logged; the submitted code never is.
export function recordFacultyFailure(userId: string, now: number): void {
  if (!globalFailures || now - globalFailures.first > GLOBAL_WINDOW_MS) {
    globalFailures = { count: 1, first: now };
  } else {
    globalFailures.count += 1;
  }

  const rec = attempts.get(userId);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(userId, { count: 1, first: now });
  } else {
    rec.count += 1;
  }

  const forUser = attempts.get(userId)?.count ?? 1;
  console.warn(
    `[faculty-gate] rejected code attempt user=${userId} ` +
      `user_failures=${forUser}/${MAX_FAILURES} global_failures=${globalFailures.count}/${GLOBAL_MAX_FAILURES}`,
  );
  if (globalFailures.count >= GLOBAL_MAX_FAILURES) {
    console.error(
      "[faculty-gate] GLOBAL LIMIT REACHED -- faculty sign-up is refused for up to an hour. " +
        "This is what a brute-force attempt against FACULTY_ACCESS_CODE looks like. Rotate the " +
        "code if you did not expect this.",
    );
  }
}

export function clearFacultyAttempts(userId: string): void {
  attempts.delete(userId);
}

// Test seam. The global counter is module state, so a suite that exercises the
// limit has to be able to put it back.
export function resetFacultyGlobalThrottle(): void {
  globalFailures = null;
}
