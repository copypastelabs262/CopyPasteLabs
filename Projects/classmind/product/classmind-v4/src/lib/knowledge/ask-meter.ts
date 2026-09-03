// THE ASK METER.
//
// Ask is the product's second paid path, and until 2026-09-03 it was the
// unmeasured one: every completion returned prompt/completion token counts and
// the route threw them away -- the exact defect class that emptied the Sarvam
// balance on 2026-08-30 ("the cost was invisible because it was never printed,
// never counted, and never asked about"). This module closes it the same way
// processing_runs closed it for extraction:
//
//   1. PRINT. Every ask writes one meter line to the server log, whatever else
//      happens. A cost that at least appears in a terminal cannot be invisible.
//   2. RECORD. Every ask inserts one row into ask_runs (migration
//      20260903100000), reused-nothing included -- the $0 routes are rows too,
//      because "which questions cost nothing" is half of what the meter is for.
//
// DEGRADATION IS DELIBERATE, exactly as in ../processing/run.ts: an unapplied
// migration must not take Ask down, so the write reports "unavailable" instead
// of throwing, and the caller surfaces that state rather than pretending the
// row exists.
//
// buildAskRunRow and meterLine are pure so scripts/test-ask.mts can check them
// offline; the Supabase client is imported lazily inside recordAskRun for the
// same reason (a static import chain would drag `@/` aliases into a plain-node
// test run).

import type { AskRoute } from "./ask-routing.ts";

export interface AskRunRecord {
  courseId: string;
  lectureId: string | null;
  userId: string;
  question: string;
  route: AskRoute;
  provider: string | null;
  model: string | null;
  requestId: string | null;
  // Null, not zero, when the provider reported no usage -- recording an
  // unknown as zero would understate every total computed from the table.
  promptTokens: number | null;
  completionTokens: number | null;
  unitsAvailable: number;
  unitsCited: number;
  durationMs: number;
  error: string | null;
}

// Long enough to make any question recognisable, short enough that the meter
// never becomes a transcript store.
const QUESTION_CAP = 500;

export function buildAskRunRow(r: AskRunRecord): Record<string, unknown> {
  return {
    course_id: r.courseId,
    lecture_id: r.lectureId,
    user_id: r.userId,
    question: r.question.length > QUESTION_CAP ? `${r.question.slice(0, QUESTION_CAP - 1)}…` : r.question,
    route: r.route,
    provider: r.provider,
    model: r.model,
    request_id: r.requestId,
    prompt_tokens: r.promptTokens,
    completion_tokens: r.completionTokens,
    units_available: r.unitsAvailable,
    units_cited: r.unitsCited,
    duration_ms: r.durationMs,
    error: r.error,
  };
}

// One line per ask, in the server log. `tokens=?+?` is an honest unknown, not
// a zero.
export function meterLine(r: AskRunRecord): string {
  const tok = (n: number | null) => (n === null ? "?" : String(n));
  const paid = r.route === "model" ? `${r.provider}/${r.model} tokens=${tok(r.promptTokens)}+${tok(r.completionTokens)}` : "tokens=0 (no call)";
  return (
    `[ask-meter] route=${r.route} ${paid} units=${r.unitsCited}/${r.unitsAvailable} ` +
    `${r.durationMs}ms course=${r.courseId}${r.lectureId ? ` lecture=${r.lectureId}` : ""}` +
    `${r.error ? ` error=${JSON.stringify(r.error.slice(0, 120))}` : ""}`
  );
}

export interface AskMeterResult {
  state: "ok" | "unavailable";
  note: string | null;
}

function unavailable(message: string): string {
  return /schema cache|does not exist|42P01|PGRST205/i.test(message)
    ? "The ask meter table is not present -- migration 20260903100000 has not been applied. " +
      "This ask was printed to the log but not recorded."
    : `The ask meter could not be written: ${message}`;
}

export async function recordAskRun(r: AskRunRecord): Promise<AskMeterResult> {
  // The print happens FIRST and unconditionally. If everything below fails,
  // the cost still made it somewhere a human can read.
  console.log(meterLine(r));
  try {
    const { serviceClient } = await import("@/lib/supabase/service");
    const { error } = await serviceClient().from("ask_runs").insert(buildAskRunRow(r));
    if (error) return { state: "unavailable", note: unavailable(error.message) };
    return { state: "ok", note: null };
  } catch (err) {
    return { state: "unavailable", note: unavailable(err instanceof Error ? err.message : String(err)) };
  }
}
