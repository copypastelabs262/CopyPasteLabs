// The abuse-limit DECISIONS, with no dependencies at all.
//
// Split from ./rate-limit.ts for the same reason ask-routing.ts is split from
// the route that uses it, and conversation-model.ts from the store: the half
// that decides must be drivable offline by a plain `node scripts/*.mts` run.
// Its sibling imports `server-only`, `next/headers` and the Supabase client,
// none of which survive outside a server request -- so a test that had to go
// through it could not exist, and a limiter nobody can test is a limiter nobody
// can trust.
//
// Nothing here throws an HTTP error or touches a database. It answers "is this
// allowed" and "who holds this claim"; ./rate-limit.ts turns those answers into
// refusals.

export interface Limit {
  /** How many events are allowed inside the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

// The budgets. Generous for a real class, lethal to a loop.
//
// A lecturer processes a handful of lectures in a sitting; a student asks a
// handful of questions. Nobody legitimately makes sixty model calls an hour
// from one account, and if they do, the refusal names the limit and the wait.
export const LIMITS = {
  // Per user, across every course they own.
  extract: { max: 12, windowMs: 60 * 60 * 1000 } as Limit,
  extractBurst: { max: 3, windowMs: 60 * 1000 } as Limit,
  // Per user. One live ASR call per upload; twelve uploads an hour is a heavy
  // teaching day and far below a bill that hurts.
  transcribe: { max: 12, windowMs: 60 * 60 * 1000 } as Limit,
  transcribeBurst: { max: 3, windowMs: 60 * 1000 } as Limit,
  // Per user. Counts every ask; the ledger check counts only the ones that
  // actually reached a model.
  ask: { max: 90, windowMs: 60 * 60 * 1000 } as Limit,
  askBurst: { max: 12, windowMs: 60 * 1000 } as Limit,
  // Billed asks only, read back from ask_runs. The number that costs money.
  askModel: { max: 40, windowMs: 60 * 60 * 1000 } as Limit,
  // Join-code guessing. join_code is encode(gen_random_bytes(4),'hex') -- a
  // 32-bit space. Unlimited guessing at network speed walks into other people's
  // courses; twenty an hour does not.
  enroll: { max: 20, windowMs: 60 * 60 * 1000 } as Limit,
  // Deleting a lecture cascades away its processing_runs and ask_runs rows, so
  // deletion resets the durable spend counters. Bounding it bounds the reset.
  // Generous for real use -- removing a wrong upload is a normal thing to do a
  // few times in a sitting, not sixty times an hour.
  delete: { max: 10, windowMs: 60 * 60 * 1000 } as Limit,
  deleteBurst: { max: 3, windowMs: 60 * 1000 } as Limit,
  // Both durable ledgers fan out over the caller's owned courses; enough courses
  // breaks that query, and a broken query fails OPEN. A lecturer creates a
  // handful of courses a term.
  courseCreate: { max: 25, windowMs: 60 * 60 * 1000 } as Limit,
} as const;

// ---------------------------------------------------------------------------
// The sliding window
// ---------------------------------------------------------------------------

// bucket -> key -> event timestamps inside the window. Timestamps rather than a
// counter so the window really slides: a counter reset on a fixed boundary lets
// twice the budget through across that boundary.
const hits = new Map<string, Map<string, number[]>>();

function prune(list: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  // The list is append-ordered, so the first index still inside the window is
  // the only thing to find.
  let i = 0;
  while (i < list.length && list[i] <= cutoff) i += 1;
  return i === 0 ? list : list.slice(i);
}

export interface LimitVerdict {
  allowed: boolean;
  /** Seconds until the oldest event leaves the window. 0 when allowed. */
  retryAfterSeconds: number;
  remaining: number;
}

export function checkMemoryLimit(
  bucket: string,
  key: string,
  limit: Limit,
  now: number,
): LimitVerdict {
  let byKey = hits.get(bucket);
  if (!byKey) {
    byKey = new Map();
    hits.set(bucket, byKey);
  }
  const pruned = prune(byKey.get(key) ?? [], now, limit.windowMs);
  if (pruned.length >= limit.max) {
    byKey.set(key, pruned);
    const oldest = pruned[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + limit.windowMs - now) / 1000)),
      remaining: 0,
    };
  }
  pruned.push(now);
  byKey.set(key, pruned);
  return { allowed: true, retryAfterSeconds: 0, remaining: limit.max - pruned.length };
}

// ---------------------------------------------------------------------------
// Single flight -- one paid run per resource at a time
// ---------------------------------------------------------------------------
//
// THE REUSE LEDGER IS A READ-THEN-WRITE RACE. findReusableRun() SELECTs, and
// recordRun() INSERTs only after the model has already been paid;
// processing_runs carries no unique constraint on the cache key, only a partial
// index for the read. So two /extract calls for the same lecture that overlap
// in time both see "no prior run", both reconstruct in full, and both insert --
// the guard that exists specifically to stop paying twice pays twice.
//
// This is not only reachable by an attacker firing concurrent requests. The
// product's own UI can produce it: a double-clicked button, a retried fetch,
// two open tabs on the same lecture.
//
// A claim held in process memory closes it for requests landing on the SAME
// instance, which is every case a single client can cause. It does NOT close
// the cross-instance case -- two serverless instances still race -- and that
// residual is left to the burst limit, which caps one account at three
// concurrent starts. Closing it properly needs a claim row with a unique key
// and a lease, in the shape reconstruction_windows already uses; that is a
// schema change and is recorded as remaining work rather than half-done here.
// key -> when it was taken. A TIMESTAMP, not a flag.
//
// THE CLAIM MUST EXPIRE (2026-09-07, closure pass). The first version was a
// Set, released only in the caller's `finally`. That is correct for every path
// that returns or throws -- and wrong for the one that matters: the extract
// route declares `maxDuration = 300`, MAX_WINDOWS_TOTAL is calibrated at "~300s,
// at the limit", so hitting the platform's kill is a NORMAL outcome for a long
// lecture, not an exotic one. A hard kill does not run `finally`. The claim then
// survived for the life of the instance and every subsequent extract of that
// lecture answered 409 forever -- the cost guard turned into an outage on
// exactly the lectures most likely to need a retry.
//
// The lease is longer than maxDuration so it never cuts a live run short, and
// short enough that a killed run frees the lecture on the next attempt.
const CLAIM_TTL_MS = 360_000;

const inFlight = new Map<string, number>();

function live(takenAt: number | undefined, now: number): boolean {
  return takenAt !== undefined && now - takenAt < CLAIM_TTL_MS;
}

export function claimHeld(key: string, now: number = Date.now()): boolean {
  return live(inFlight.get(key), now);
}

/**
 * Takes an exclusive in-process claim, or returns false if a LIVE one is held.
 * A claim older than CLAIM_TTL_MS is treated as abandoned and taken over.
 * ALWAYS pair a true return with releaseClaim in a `finally`; the TTL is the
 * backstop for the kill that never reaches one, not a substitute for it.
 */
export function tryAcquireClaim(key: string, now: number = Date.now()): boolean {
  if (live(inFlight.get(key), now)) return false;
  inFlight.set(key, now);
  return true;
}

export function releaseClaim(key: string | null): void {
  if (key) inFlight.delete(key);
}

// Test seam. Nothing in the product calls this; scripts/test-rate-limit.mts
// does, so each case starts from a known state rather than from whatever ran
// before it.
export function resetLimits(): void {
  hits.clear();
  inFlight.clear();
}
