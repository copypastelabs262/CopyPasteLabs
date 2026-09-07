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
    const since0 = new Date(now - windowMs).toISOString();

    // PREFERRED: count by owner_id, which migration 20260907130000 adds.
    //
    // The fan-out below reconstructs "this user's spend" by listing the courses
    // they own -- which breaks in two ways the owner_id column does not. It
    // fails OPEN if the id list grows large enough to break the query, and it
    // misses entirely once course_id can be null (which is the whole point of
    // that migration: a ledger row must survive the deletion of the thing it
    // billed for, and a deleted course used to take its own bill with it).
    //
    // Degrades to the old path while the migration is unapplied, in the same
    // shape as every other optional-column reader in this codebase.
    const byOwner = await svc
      .from("processing_runs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .neq("outcome", "reused")
      .gte("created_at", since0);
    if (!byOwner.error) return byOwner.count ?? 0;
    if (!missingSchema(byOwner.error.message)) {
      console.error("[rate-limit] owner_id run count failed:", byOwner.error.message);
    }

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
    const ids = (courses ?? []).map((c) => c.id as string).slice(0, LEDGER_COURSE_FANOUT_CAP);
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

// How many owned courses the ledger reads will fan out over.
//
// Both durable counters select every course the user owns and pass the ids to
// `.in(...)`, which PostgREST sends as a GET query string. Unbounded, a user
// with a few thousand courses produces a request line long enough to fail --
// and BOTH counters return null on failure, which every caller treats as ALLOW.
// So an uncapped fan-out is a deliberate route to disabling the durable quota.
//
// The same shape is already capped at 12 in academic-context.ts for the same
// reason. Higher here because this bounds a cost check rather than a read, and
// a lecturer with more courses than this should still be counted over most of
// them; the cap is about keeping the QUERY valid, not about fairness.
const LEDGER_COURSE_FANOUT_CAP = 200;

/** Deployment-wide billed asks in the window. Null when the meter is unavailable. */
export async function globalBilledAsks(
  windowMs: number,
  now: number = Date.now(),
): Promise<number | null> {
  try {
    const { serviceClient } = await import("@/lib/supabase/service");
    const since = new Date(now - windowMs).toISOString();
    // 'model' ONLY, unlike the per-user quota above.
    //
    // The per-user quota counts 'degraded' too, deliberately: an attempt is a
    // cost until proven otherwise, and over-counting your OWN budget is safe.
    // Applying that to the DEPLOYMENT-WIDE ceiling is not, because answer.ts
    // returns route:"degraded" when no provider is configured at all and NO
    // call is made. On a build with the keys absent every ask is a $0 degraded
    // row -- so thirteen free Google accounts could exhaust a 500-row ceiling
    // and refuse every ask for every user for an hour, at zero cost to
    // themselves. A ceiling that an attacker can fill for free is a denial of
    // service with extra steps.
    const { count, error } = await serviceClient()
      .from("ask_runs")
      .select("id", { count: "exact", head: true })
      .eq("route", "model")
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
    const ids = (courses ?? []).map((c) => c.id as string).slice(0, LEDGER_COURSE_FANOUT_CAP);
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

/** Deployment-wide transcription submissions in the window. */
export async function globalTranscriptions(
  windowMs: number,
  now: number = Date.now(),
): Promise<number | null> {
  try {
    const { serviceClient } = await import("@/lib/supabase/service");
    const since = new Date(now - windowMs).toISOString();
    const { count, error } = await serviceClient()
      .from("lectures")
      .select("id", { count: "exact", head: true })
      .neq("status", "pending_upload")
      .gte("created_at", since);
    if (error) {
      if (!missingSchema(error.message)) {
        console.error("[rate-limit] global transcription ledger unreadable:", error.message);
      }
      return null;
    }
    return count ?? 0;
  } catch {
    return null;
  }
}

/** Throws when the DEPLOYMENT has spent past its hourly ceiling. */
export async function enforceGlobalSpendCeiling(
  kind: "ask" | "run" | "transcription",
  now: number = Date.now(),
): Promise<void> {
  const windowMs = 60 * 60 * 1000;
  // GLOBAL_LIMITS.transcriptionsPerHour was declared here and never read -- a
  // constant that made the file look like it bounded ASR deployment-wide when
  // nothing did. ASR is the most expensive path in the product (billed per hour
  // of audio) and was the only one with no aggregate bound at all.
  const [used, ceiling, what] =
    kind === "ask"
      ? [await globalBilledAsks(windowMs, now), GLOBAL_LIMITS.billedAsksPerHour, "billed question"]
      : kind === "transcription"
        ? [await globalTranscriptions(windowMs, now), GLOBAL_LIMITS.transcriptionsPerHour, "transcription"]
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
