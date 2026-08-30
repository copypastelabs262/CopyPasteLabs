import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { ReconstructedItem } from "@/lib/reasoning/reconstruct";
import { spanOf } from "@/lib/reasoning/span";
import {
  planKnowledgeWrite,
  type ExistingItem,
  type KnowledgeStatus,
  type KnowledgeWriteOutcome,
} from "@/lib/knowledge/plan";

// LAYER 3 -- persistence.
//
// Knowledge is derived but STORED, not recomputed. It costs a model call to
// produce, it must be stable enough to cite months later, and a student asking
// the same question twice should get the same answer. Recomputing it on every
// read would make all three false.
//
// WHAT gets written is decided by planKnowledgeWrite, which is pure and tested
// offline. This file does the I/O and nothing else. The split exists because
// the decision is the part that was wrong -- an incomplete pass was allowed to
// delete a complete one's work -- and a decision that can only be exercised
// against a live database is a decision nobody exercises.

// Only these require a human before a student sees them. Everything else enters
// the knowledge base directly: a professor cannot review thirty topics after
// every lecture, and the cost of being wrong is not symmetric -- a mislabelled
// topic wastes a moment, a wrong deadline costs a grade.
const GATED_KINDS = new Set(["assignment", "deadline", "exam_instruction"]);

export function initialStatus(item: ReconstructedItem): "auto" | "pending" {
  return item.category === "actionable" && GATED_KINDS.has(item.kind) ? "pending" : "auto";
}

export interface StoreResult {
  outcome: KnowledgeWriteOutcome;
  stored: number;
  pending: number;
  auto: number;
  replaced: number;
  // Items this pass re-proposed that a human had already confirmed or rejected.
  // Not an error: it is the verdict holding.
  skippedAlreadyJudged: number;
  // Items that could not be persisted WITH their evidence and were rolled back.
  // Non-zero means the database refused something; it must not be silent.
  failed: number;
  // Knowledge items attached to this lecture after the write, including rows
  // kept from an earlier run. This is what decides whether the lecture can be
  // published, so it counts what EXISTS, not what this pass happened to add.
  total: number;
}

export async function storeKnowledge(
  lectureId: string,
  courseId: string,
  items: ReconstructedItem[],
  method: string,
  version: string,
  // False when any window of the reasoning pass failed. An incomplete pass has
  // seen only part of the lecture and may not overwrite a complete one's work.
  complete: boolean,
): Promise<StoreResult> {
  const svc = serviceClient();

  // Existing items with the transcript span their evidence covers. The span is
  // how a re-proposed obligation is recognised as one a human already ruled on.
  const { data: rows } = await svc
    .from("knowledge_items")
    .select("id, status")
    .eq("lecture_id", lectureId);

  const ids = (rows ?? []).map((r) => r.id as string);
  const spansById = new Map<string, { charStart: number | null; charEnd: number | null }[]>();
  if (ids.length) {
    const { data: ev } = await svc
      .from("knowledge_evidence")
      .select("knowledge_item_id, char_start, char_end")
      .in("knowledge_item_id", ids);
    for (const e of ev ?? []) {
      const key = e.knowledge_item_id as string;
      if (!spansById.has(key)) spansById.set(key, []);
      spansById.get(key)!.push({
        charStart: e.char_start === null ? null : Number(e.char_start),
        charEnd: e.char_end === null ? null : Number(e.char_end),
      });
    }
  }

  const existing: ExistingItem[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as KnowledgeStatus,
    span: spanOf(spansById.get(r.id as string) ?? []),
  }));

  const plan = planKnowledgeWrite(existing, items, complete);

  if (plan.deleteIds.length) {
    // Evidence cascades with its item.
    await svc.from("knowledge_items").delete().in("id", plan.deleteIds);
  }

  let pending = 0;
  let auto = 0;
  let failed = 0;

  for (const item of plan.insert) {
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
    if (error || !row) { failed += 1; continue; }

    // AN ITEM WITHOUT ITS EVIDENCE IS NOT KNOWLEDGE, IT IS A CLAIM.
    //
    // The evidence write used to be fire-and-forget, so a failure there left a
    // knowledge item with no quote, no timestamp and no way back to the
    // transcript -- served to students as though it were traceable, which is
    // the one property this product sells. If the evidence cannot be stored,
    // the item is removed rather than kept in that state.
    if (item.evidence.length) {
      const { error: evidenceError } = await svc.from("knowledge_evidence").insert(
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
      if (evidenceError) {
        await svc.from("knowledge_items").delete().eq("id", row.id);
        failed += 1;
        continue;
      }
    }

    if (status === "pending") pending += 1; else auto += 1;
  }

  const stored = pending + auto;
  return {
    outcome: plan.outcome,
    stored,
    pending,
    auto,
    replaced: plan.deleteIds.length,
    skippedAlreadyJudged: plan.skippedAlreadyJudged,
    failed,
    total: plan.keptCount + stored,
  };
}
