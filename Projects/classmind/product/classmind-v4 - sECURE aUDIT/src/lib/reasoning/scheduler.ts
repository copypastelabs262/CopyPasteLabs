// ONE RATE LIMITER PER PROCESSING RUN.
//
// Test A on 2026-08-30 turned 20 logical windows into ~60 HTTP requests in 34
// seconds and every single one came back 429. The cause was not the provider's
// limit being low -- it was that each window retried INDEPENDENTLY. Four
// concurrent workers, three attempts each, backing off 1.5s and 3s locally,
// produce a burst precisely when the provider has just said "slow down".
//
// Retrying into a rate limit is the one case where retrying is strictly wrong:
// it converts a request to slow down into a self-inflicted outage. The fix is
// not a smaller number somewhere. It is that the decision to slow down has to
// be made ONCE, for the whole run, rather than independently by every window
// that happens to be in flight.
//
// So: a single scheduler instance per provider instance -- and reconstructLecture
// resolves its provider once per lecture, so that is one scheduler per run,
// shared by every window.
//
// No timers are held between calls and no state escapes the closure, so this is
// safe to construct per run and throw away.

export interface RequestScheduler {
  // Waits until this caller's turn. Every HTTP attempt goes through it,
  // RETRIES INCLUDED -- a retry that skipped the queue would be exactly the
  // burst this exists to prevent.
  acquire(): Promise<void>;
  // "The provider asked us to stop until then." Applies to the whole run, not
  // to the caller that happened to receive the 429.
  penalise(waitMs: number): void;
  // How long the current global pause still has to run, for the caller to
  // decide whether waiting it out is worth it.
  pausedForMs(): number;
  readonly spacingMs: number;
}

export function createRequestScheduler(requestsPerMinute: number): RequestScheduler {
  // A floor of 1 RPM keeps a misconfigured 0 from producing Infinity.
  const spacingMs = Math.ceil(60_000 / Math.max(1, requestsPerMinute));

  // The instant the next request may leave. Claimed SYNCHRONOUSLY below, which
  // is what makes this correct without a lock: JavaScript runs the claim to
  // completion before any other caller can observe it, so N concurrent callers
  // receive N distinct, properly spaced slots. An implementation that awaited
  // before claiming would hand the same slot to everyone -- which is the same
  // bug as the per-window retry, one level down.
  let nextSlotAt = 0;
  let pausedUntil = 0;

  return {
    spacingMs,

    pausedForMs() {
      return Math.max(0, pausedUntil - Date.now());
    },

    penalise(waitMs: number) {
      const until = Date.now() + Math.max(0, waitMs);
      if (until > pausedUntil) pausedUntil = until;
      // Push the queue out too. Without this, everything that queued up during
      // the pause fires the instant it lifts -- a second burst, immediately
      // after the provider told us it was already receiving too many.
      if (pausedUntil > nextSlotAt) nextSlotAt = pausedUntil;
    },

    async acquire() {
      const now = Date.now();
      const slot = Math.max(now, nextSlotAt, pausedUntil);
      nextSlotAt = slot + spacingMs; // claimed before the await -- see above
      const wait = slot - now;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    },
  };
}

// Live counters for one provider instance, so a run can report what actually
// went over the wire instead of what it intended to send.
//
// `calls` in the ledger counts LOGICAL WINDOWS and always will -- that is the
// unit of work. These count REQUESTS. Test A recorded calls: 20 for a run that
// made ~60 requests and completed none of them, and every one of those three
// numbers means something different.
export interface ProviderTelemetry {
  httpAttempts: number;
  succeeded: number;
  retries: number;
  rateLimited: number;
  fatal: number;
}

export function createTelemetry(): ProviderTelemetry {
  return { httpAttempts: 0, succeeded: 0, retries: 0, rateLimited: 0, fatal: 0 };
}
