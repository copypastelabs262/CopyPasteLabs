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

export function facultyAttemptBlocked(userId: string, now: number): boolean {
  const rec = attempts.get(userId);
  if (!rec) return false;
  if (now - rec.first > WINDOW_MS) {
    attempts.delete(userId);
    return false;
  }
  return rec.count >= MAX_FAILURES;
}

export function recordFacultyFailure(userId: string, now: number): void {
  const rec = attempts.get(userId);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(userId, { count: 1, first: now });
    return;
  }
  rec.count += 1;
}

export function clearFacultyAttempts(userId: string): void {
  attempts.delete(userId);
}
