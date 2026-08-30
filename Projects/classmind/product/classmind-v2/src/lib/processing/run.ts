import "server-only";
import { createHash } from "node:crypto";
import { serviceClient } from "@/lib/supabase/service";

// THE PROCESSING LEDGER.
//
// Two jobs, one table, because they are the same fact: a run that completed
// over an unchanged transcript with an unchanged reasoner is a run whose result
// is still valid, and the row that proves it is the row that recorded its cost.
//
//   1. IDEMPOTENCY. Answer "has this exact question already been paid for?"
//      before spending anything on asking it again.
//   2. OBSERVABILITY. Record what every run cost, reused runs included, so the
//      question "where did the money go" has an answer in the product rather
//      than in a provider's dashboard.
//
// DEGRADATION IS DELIBERATE. Migration 20260830160000 is not applied
// automatically, and this module must not take extraction down when the table
// is absent -- the pipeline worked before the ledger existed and must keep
// working. So every function here reports `unavailable` instead of throwing,
// and the caller surfaces that state rather than silently behaving as though
// the ledger said "no prior run". Silence is what this whole module exists to
// end; it must not reintroduce it one layer up.

export type LedgerState = "ok" | "unavailable";

// The six columns that together identify one question asked of one model.
// Any difference is a different question. See the migration for why no subset
// of these is sufficient.
export interface RunKey {
  lectureId: string;
  courseId: string;
  transcriptSha256: string;
  method: string;
  version: string;
  provider: string;
  model: string;
}

export interface ReusableRun {
  id: string;
  windows: number;
  calls: number;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: string;
}

export interface Lookup {
  state: LedgerState;
  // Null means "the ledger was readable and holds no reusable run", which is
  // NOT the same as `state: "unavailable"`. The caller must be able to tell a
  // cache miss from a cache it could not consult.
  run: ReusableRun | null;
  note: string | null;
}

// The transcript is the INPUT to reconstruction, so the transcript is what the
// cache is keyed on -- not the lecture id.
//
// Hashed over the normalized text rather than the raw provider response: the
// raw response carries timing metadata and provider bookkeeping that can differ
// between two downloads of the same job, and a fingerprint that changes without
// the words changing would defeat the cache it exists to key. The normalization
// is deterministic and the raw response is immutable, so this is stable for as
// long as the row is.
export function transcriptFingerprint(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// A missing table is the expected state until the migration is applied, and it
// is not an error worth failing a lecture over. Anything else is unexpected,
// and is still not worth failing a lecture over -- but it is worth saying out
// loud, so the message travels back to the caller.
function unavailable(message: string): string {
  return /schema cache|does not exist|42P01|PGRST205/i.test(message)
    ? "The processing ledger table is not present -- migration 20260830160000 has not been applied. " +
      "Reuse is off and this run was not recorded."
    : `The processing ledger could not be read or written: ${message}`;
}

// Is there a completed run of this exact question whose result is still valid?
//
// Only `outcome = 'succeeded' and complete` qualifies. A partial run has read
// part of the lecture, so caching it would make a transient provider failure
// permanent -- the next call would serve the gap as though it were the answer.
export async function findReusableRun(key: RunKey): Promise<Lookup> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("processing_runs")
    .select("id, windows, calls, prompt_tokens, completion_tokens, created_at")
    .eq("lecture_id", key.lectureId)
    .eq("transcript_sha256", key.transcriptSha256)
    .eq("reconstruction_method", key.method)
    .eq("reconstruction_version", key.version)
    .eq("provider", key.provider)
    .eq("model", key.model)
    .eq("outcome", "succeeded")
    .eq("complete", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { state: "unavailable", run: null, note: unavailable(error.message) };
  if (!data) return { state: "ok", run: null, note: null };

  return {
    state: "ok",
    run: {
      id: data.id as string,
      windows: (data.windows as number) ?? 0,
      calls: (data.calls as number) ?? 0,
      promptTokens: (data.prompt_tokens as number | null) ?? null,
      completionTokens: (data.completion_tokens as number | null) ?? null,
      createdAt: data.created_at as string,
    },
    note: null,
  };
}

export interface RunRecord {
  outcome: "succeeded" | "partial" | "failed" | "reused";
  complete: boolean;
  calls: number;
  // Null, not zero, when the provider reported no usage. Recording an unknown
  // as zero would understate every total computed from this table.
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
  windows: number;
  failedWindows: number;
  itemsProposed: number | null;
  itemsDroppedUnverifiable: number | null;
  knowledgeTotal: number | null;
  forced: boolean;
  error: string | null;
}

export interface Recorded {
  state: LedgerState;
  runId: string | null;
  note: string | null;
}

// Every run is recorded, including reused ones. A reuse costs nothing and is
// exactly the row you want when asking how often the guard earned its keep.
export async function recordRun(key: RunKey, record: RunRecord): Promise<Recorded> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("processing_runs")
    .insert({
      lecture_id: key.lectureId,
      course_id: key.courseId,
      transcript_sha256: key.transcriptSha256,
      reconstruction_method: key.method,
      reconstruction_version: key.version,
      provider: key.provider,
      model: key.model,
      outcome: record.outcome,
      complete: record.complete,
      calls: record.calls,
      prompt_tokens: record.promptTokens,
      completion_tokens: record.completionTokens,
      duration_ms: record.durationMs,
      windows: record.windows,
      failed_windows: record.failedWindows,
      items_proposed: record.itemsProposed,
      items_dropped_unverifiable: record.itemsDroppedUnverifiable,
      knowledge_total: record.knowledgeTotal,
      forced: record.forced,
      error: record.error,
    })
    .select("id")
    .maybeSingle();

  if (error) return { state: "unavailable", runId: null, note: unavailable(error.message) };
  return { state: "ok", runId: (data?.id as string) ?? null, note: null };
}
