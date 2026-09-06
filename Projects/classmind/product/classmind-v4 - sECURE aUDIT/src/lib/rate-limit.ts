import "server-only";
import { HttpError } from "@/lib/auth";
import {
  checkMemoryLimit,
  tryAcquireClaim,
  LIMITS,
  type Limit,
} from "@/lib/rate-limit-core";

// ---------------------------------------------------------------------------
// SERVER-SIDE ABUSE LIMITS FOR THE PATHS THAT SPEND MONEY
// ---------------------------------------------------------------------------
//
// Added 2026-09-07 (security audit). Before this, the only rate limit anywhere
// in the product was the five-strike counter on the faculty code. Every paid
// path was unbounded per user:
//
//   POST /api/lectures/{id}/extract?force=1   bypasses the processing_runs
//                                             ledger by design, and nothing
//                                             bounded how often it could be
//                                             called. A loop against one
//                                             lecture bills one reasoning call
//                                             PER WINDOW, per iteration.
//   POST /api/lectures/{id}/transcribe        one billable Sarvam ASR call per
//                                             upload, priced per hour of audio.
//   POST /api/courses/{id}/ask, /api/ask      one billable reasoning call per
//                                             question routed to the model.
//
// CLAUDE.md records why this matters more here than elsewhere: on 2026-08-30 the
// balance went from freshly topped up to 402 insufficient_quota inside one
// working day, with no lecture uploaded by the operator. Cost is the binding
// constraint on this product, so an attacker who can spend the operator's money
// can stop the product working -- a denial of service billed to the victim.
//
// TWO LAYERS, DELIBERATELY DIFFERENT IN KIND
//
//   1. MEMORY (./rate-limit-core.ts). A sliding window in this process. Costs
//      nothing, needs no infrastructure, and catches the shape that actually
//      matters -- a tight loop or a fan-out of tabs, which lands on one warm
//      instance. It is per-instance and resets on a cold start; that is a real
//      limit and it is stated rather than hidden. Same trade, and the same
//      honesty about it, as the throttle in @/lib/faculty-code.
//
//   2. LEDGER (here). A count of what this user has ACTUALLY been billed for in
//      the last hour, read from the meters the product already keeps (ask_runs,
//      processing_runs). Durable, survives restarts, and cannot be reset by
//      spreading requests across instances -- because it counts spend, not
//      requests.
//
// The memory layer runs FIRST and always. The ledger layer degrades to "allow"
// when its table is missing, exactly like every other consumer of these tables
// in this codebase: an unapplied migration must not take the product down. That
// degradation is logged, because a cost control that has silently stopped
// working looks exactly like one that is working.
//
// The DECISIONS live in ./rate-limit-core.ts so scripts/test-rate-limit.mts can
// drive them offline. This file is the half that needs a server.

export { LIMITS, releaseClaim } from "@/lib/rate-limit-core";
export type { Limit, LimitVerdict } from "@/lib/rate-limit-core";

// The refusal, as an HttpError so every route reports it through the same
// errorResponse() path as any other authorization failure. 429 and not 403:
// this is "not now", not "not ever", and the difference is what tells a
// legitimate user to wait rather than to file a bug.
//
// Written WITHOUT TypeScript parameter properties on purpose: node's strip-only
// type removal -- which is what runs every scripts/*.mts test in this repo --
// rejects them outright with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. A class the
// test runner cannot parse is a class the tests cannot reach.
export class RateLimitError extends HttpError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, what: string) {
    const wait =
      retryAfterSeconds >= 60
        ? `${Math.ceil(retryAfterSeconds / 60)} minute(s)`
        : `${retryAfterSeconds} second(s)`;
    super(429, `Too many ${what} requests from this account. Wait ${wait} and try again.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AlreadyRunningError extends HttpError {
  constructor(what: string) {
    super(
      409,
      `This ${what} is already being processed. Wait for it to finish before starting another.`,
    );
  }
}

/** Throws RateLimitError when the caller is over budget. */
export function enforceMemoryLimit(
  bucket: string,
  key: string,
  limit: Limit,
  what: string,
  now: number = Date.now(),
): void {
  const verdict = checkMemoryLimit(bucket, key, limit, now);
  if (!verdict.allowed) throw new RateLimitError(verdict.retryAfterSeconds, what);
}

/** Throws AlreadyRunningError when another request already holds this resource. */
export function acquireClaim(key: string, what: string): void {
  if (!tryAcquireClaim(key)) throw new AlreadyRunningError(what);
}

// ---------------------------------------------------------------------------
// The durable ledger check
// ---------------------------------------------------------------------------
//
// Counts what was BILLED, not what was requested, so it cannot be reset by a
// cold start, a second instance, or a different tab. Reads the tables the
// product already writes for metering; adds no schema of its own.

function missingSchema(message: string): boolean {
  return /schema cache|does not exist|42P01|PGRST205/i.test(message);
}

/**
 * Billed asks by this user inside the window, from ask_runs. Returns null when
 * the meter is unavailable -- the caller then relies on the memory layer alone.
 */
export async function billedAsksInWindow(
  userId: string,
  windowMs: number,
  now: number = Date.now(),
): Promise<number | null> {
  try {
    const { serviceClient } = await import("@/lib/supabase/service");
    const since = new Date(now - windowMs).toISOString();
    // 'model' AND 'degraded', not just 'model'.
    //
    // A degraded row means a model was WANTED and the call was attempted --
    // ask-routing had already decided the question needed synthesis, and the
    // provider was reached and failed or returned nothing usable. Whether that
    // attempt was billed depends on where it failed, and the row cannot say.
    // Counting only 'model' would let an attacker who can reliably provoke a
    // provider failure (an oversized question, a poisoned knowledge unit) loop
    // for free against a quota that never moves. Counting both is the
    // conservative reading, and the honest one: an attempt is a cost until
    // proven otherwise.
    const { count, error } = await serviceClient()
      .from("ask_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("route", ["model", "degraded"])
      .gte("created_at", since);
    if (error) {
      if (!missingSchema(error.message)) {
        console.error("[rate-limit] ask ledger unreadable:", error.message);
      }
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.error(
      "[rate-limit] ask ledger threw:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Paid reconstruction runs charged against courses this user OWNS, inside the
 * window. processing_runs carries no user_id -- extraction is an owner-only act,
 * so the owner's courses are the correct attribution and no new column is
 * needed. Returns null when the ledger is unavailable.
 */
export async function billedRunsInWindow(
  userId: string,
  windowMs: number,
  now: number = Date.now(),
): Promise<number | null> {
  try {
    const { serviceClient } = await import("@/lib/supabase/service");
    const svc = serviceClient();
    const { data: courses, error: courseError } = await svc
      .from("courses")
      .select("id")
      .eq("owner_id", userId);
    // Logged, never silent. `null` here means "the durable layer could not
    // answer", which the caller treats as ALLOW -- the right default for
    // availability, and the wrong one to take without saying so. A cost control
    // that has quietly stopped working looks exactly like one that is working.
    if (courseError) {
      console.error("[rate-limit] owned-course lookup failed:", courseError.message);
      return null;
    }
    const ids = (courses ?? []).map((c) => c.id as string);
    if (!ids.length) return 0;

    const since = new Date(now - windowMs).toISOString();
    const { count, error } = await svc
      .from("processing_runs")
      .select("id", { count: "exact", head: true })
      .in("course_id", ids)
      // A reused run cost nothing. Counting it would punish the guard that
      // saved the money.
      .neq("outcome", "reused")
      .gte("created_at", since);
    if (error) {
      if (!missingSchema(error.message)) {
        console.error("[rate-limit] run ledger unreadable:", error.message);
      }
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.error(
      "[rate-limit] run ledger threw:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Aggregate ceilings -- the multi-account defence
// ---------------------------------------------------------------------------
//
// Every limit above is keyed on the authenticated user id, and Google sign-up is
// free and unlimited. N accounts therefore multiply the per-account budget by N,
// which for an attacker willing to create accounts is no bound at all.
//
// These are the same ledger reads with the user filter removed: what the WHOLE
// DEPLOYMENT has been billed for in the last hour. The numbers are set far above
// any real day for a product at this stage and are meant to catch an order of
// magnitude, not to shape normal use.
//
// THE COST, STATED PLAINLY: an aggregate ceiling is a denial-of-service lever.
// An attacker who burns it stops everyone's paid asks for the rest of the hour.
// That is the accepted trade, and it is the same one the faculty gate makes: for
// a product whose binding constraint is a prepaid balance, an hour of refused
// questions is recoverable and an emptied balance is not -- CLAUDE.md records
// the day the balance went to zero, and the product stopped working entirely.
// Both ceilings log loudly, so the hour is never silent.
export const GLOBAL_LIMITS = {
  billedAsksPerHour: 500,
  paidRunsPerHour: 120,
  transcriptionsPerHour: 60,
} as const;

/** Deployment-wide billed asks in the window. Null when the meter is unavailable. */
export async function globalBilledAsks(
  windowMs: number,
  now: number = Date.now(),
): Promise<number | null> {
  try {
    const { serviceClient } = await import("@/lib/supabase/service");
    const since = new Date(now - windowMs).toISOString();
    const { count, error } = await serviceClient()
      .from("ask_runs")
      .select("id", { count: "exact", head: true })
      .in("route", ["model", "degraded"])
      .gte("created_at", since);
    if (error) {
      if (!missingSchema(error.message)) {
        console.error("[rate-limit] global ask ledger unreadable:", error.message);
      }
      return null;
    }
    return count ?? 0;
  } catch {
    return null;
  }
}

/** Deployment-wide paid reconstruction runs in the window. */
export async function globalPaidRuns(
  windowMs: number,
  now: number = Date.now(),
): Promise<number | null> {
  try {
    const { serviceClient } = await import("@/lib/supabase/service");
    const since = new Date(now - windowMs).toISOString();
    const { count, error } = await serviceClient()
      .from("processing_runs")
      .select("id", { count: "exact", head: true })
      .neq("outcome", "reused")
      .gte("created_at", since);
    if (error) {
      if (!missingSchema(error.message)) {
        console.error("[rate-limit] global run ledger unreadable:", error.message);
      }
      return null;
    }
    return count ?? 0;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The transcription ledger
// ---------------------------------------------------------------------------
//
// ASR is billed per hour of audio and had NO durable meter of its own -- there
// is no asr_runs table, so the only bound was the in-process window, which a
// scale-out or a cold start resets.
//
// `lectures` is the ledger it already has. A row leaves 'pending_upload' exactly
// when a transcription is submitted, so counting recent non-pending lectures in
// this user's courses is a faithful proxy for "how many ASR jobs did this
// account start in the last hour". It is a PROXY and is named as one: it counts
// rows created in the window rather than submissions in the window, so a lecture
// created an hour before it was transcribed is missed. It bounds the shape that
// matters -- upload, submit, repeat -- and it needs no new schema.
export async function transcriptionsInWindow(
  userId: string,
  windowMs: number,
  now: number = Date.now(),
): Promise<number | null> {
  try {
    const { serviceClient } = await import("@/lib/supabase/service");
    const svc = serviceClient();
    const { data: courses, error: courseError } = await svc
      .from("courses")
      .select("id")
      .eq("owner_id", userId);
    if (courseError) {
      console.error("[rate-limit] transcription ledger: course lookup failed:", courseError.message);
      return null;
    }
    const ids = (courses ?? []).map((c) => c.id as string);
    if (!ids.length) return 0;
    const since = new Date(now - windowMs).toISOString();
    const { count, error } = await svc
      .from("lectures")
      .select("id", { count: "exact", head: true })
      .in("course_id", ids)
      .neq("status", "pending_upload")
      .gte("created_at", since);
    if (error) {
      if (!missingSchema(error.message)) {
        console.error("[rate-limit] transcription ledger unreadable:", error.message);
      }
      return null;
    }
    return count ?? 0;
  } catch {
    return null;
  }
}

/** Per-user durable bound on ASR submissions, plus the deployment-wide one. */
export async function enforceTranscriptionQuota(
  userId: string,
  now: number = Date.now(),
): Promise<void> {
  const mine = await transcriptionsInWindow(userId, LIMITS.transcribe.windowMs, now);
  if (mine !== null && mine >= LIMITS.transcribe.max) {
    throw new RateLimitError(Math.ceil(LIMITS.transcribe.windowMs / 1000), "transcription");
  }
}

/** Throws when the DEPLOYMENT has spent past its hourly ceiling. */
export async function enforceGlobalSpendCeiling(
  kind: "ask" | "run",
  now: number = Date.now(),
): Promise<void> {
  const windowMs = 60 * 60 * 1000;
  const [used, ceiling, what] =
    kind === "ask"
      ? [await globalBilledAsks(windowMs, now), GLOBAL_LIMITS.billedAsksPerHour, "billed question"]
      : [await globalPaidRuns(windowMs, now), GLOBAL_LIMITS.paidRunsPerHour, "processing"];
  if (used !== null && used >= (ceiling as number)) {
    console.error(
      `[rate-limit] GLOBAL ${kind.toUpperCase()} CEILING REACHED: ${used}/${ceiling} in the last ` +
        "hour, across every account. Paid work is refused until the window rolls. If this was " +
        "not expected, someone is spending your balance.",
    );
    throw new RateLimitError(3600, `${what} (deployment-wide limit)`);
  }
}

/** Throws when the durable count of billed asks is already at or over budget. */
export async function enforceBilledAskQuota(
  userId: string,
  now: number = Date.now(),
): Promise<void> {
  const billed = await billedAsksInWindow(userId, LIMITS.askModel.windowMs, now);
  if (billed !== null && billed >= LIMITS.askModel.max) {
    throw new RateLimitError(Math.ceil(LIMITS.askModel.windowMs / 1000), "billed question");
  }
}

/** Throws when the durable count of paid reconstruction runs is over budget. */
export async function enforceBilledRunQuota(
  userId: string,
  now: number = Date.now(),
): Promise<void> {
  const billed = await billedRunsInWindow(userId, LIMITS.extract.windowMs, now);
  if (billed !== null && billed >= LIMITS.extract.max) {
    throw new RateLimitError(Math.ceil(LIMITS.extract.windowMs / 1000), "processing");
  }
}
