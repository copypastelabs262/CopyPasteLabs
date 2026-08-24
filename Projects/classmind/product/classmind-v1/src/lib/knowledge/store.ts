import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { ReconstructedItem } from "@/lib/reasoning/reconstruct";

// LAYER 3 -- persistence.
//
// Knowledge is derived but STORED, not recomputed. It costs a model call to
// produce, it must be stable enough to cite months later, and a student asking
// the same question twice should get the same answer. Recomputing it on every
// read would make all three false.

// Only these require a human before a student sees them. Everything else enters
// the knowledge base directly: a professor cannot review thirty topics after
// every lecture, and the cost of being wrong is not symmetric -- a mislabelled
// topic wastes a moment, a wrong deadline costs a grade.
const GATED_KINDS = new Set(["assignment", "deadline", "exam_instruction"]);

export function initialStatus(item: ReconstructedItem): "auto" | "pending" {
  return item.category === "actionable" && GATED_KINDS.has(item.kind) ? "pending" : "auto";
}

export interface StoreResult {
  stored: number;
  pending: number;
  auto: number;
  replaced: number;
}

// Re-processing a lecture REPLACES its knowledge rather than accumulating it.
//
// This is the one place the product deliberately destroys derived data, and it
// is safe precisely because it is derived: the audio, the raw ASR response and
// the Layer-1 candidates are all untouched, so any deleted item can be
// regenerated. Accumulating instead would leave a student reading two
// contradictory versions of the same assignment with no way to tell which is
// current.
//
// Confirmed items are the exception. A verdict is human work and is never
// discarded by a machine re-run; those rows survive and the new pass skips them.
export async function storeKnowledge(
  lectureId: string,
  courseId: string,
  items: ReconstructedItem[],
  method: string,
  version: string,
): Promise<StoreResult> {
  const svc = serviceClient();

  const { data: keep } = await svc
    .from("knowledge_items")
    .select("id")
    .eq("lecture_id", lectureId)
    .in("status", ["confirmed", "rejected"]);
  const keepIds = new Set((keep ?? []).map((k) => k.id as string));

  const { data: existing } = await svc
    .from("knowledge_items").select("id").eq("lecture_id", lectureId);
  const stale = (existing ?? []).map((e) => e.id as string).filter((id) => !keepIds.has(id));
  if (stale.length) {
    // Evidence cascades with its item.
    await svc.from("knowledge_items").delete().in("id", stale);
  }

  let pending = 0, auto = 0;
  for (const item of items) {
    const status = initialStatus(item);
    const { data: row, error } = await svc
      .from("knowledge_items")
      .insert({
        lecture_id: lectureId,
        course_id: courseId,
        category: item.category,
        kind: item.kind,
        title: item.title,
        summary: item.summary,
        steps: item.steps,
        unspecified: item.unspecified,
        status,
        confidence: item.confidence,
        reconstruction_method: method,
        reconstruction_version: version,
      })
      .select("id")
      .single();
    if (error || !row) continue;

    if (item.evidence.length) {
      await svc.from("knowledge_evidence").insert(
        item.evidence.map((e) => ({
          knowledge_item_id: row.id,
          lecture_id: lectureId,
          role: e.role,
          start_ms: e.startMs,
          end_ms: e.endMs,
          char_start: e.charStart,
          char_end: e.charEnd,
          quote: e.quote,
        })),
      );
    }
    if (status === "pending") pending += 1; else auto += 1;
  }

  return { stored: pending + auto, pending, auto, replaced: stale.length };
}
