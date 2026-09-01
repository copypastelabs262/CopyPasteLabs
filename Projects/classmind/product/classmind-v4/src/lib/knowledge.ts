import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { fetchLectureGateRows, lectureVisibleToStudents } from "@/lib/knowledge/read";

// One confirmed item as students see it. Note every field a student reads is
// either the faculty's own wording or the machine's proposal that a human
// explicitly confirmed -- there is no path here for an unreviewed candidate.
export interface KnowledgeItem {
  candidateId: string;
  kind: string;
  title: string;
  detail: string;
  duePhrase: string | null;
  dueResolved: string | null;
  lectureId: string;
  lectureTitle: string;
  evidenceStartMs: number;
  evidenceEndMs: number;
  evidenceText: string;
  extractionMethod: string;
  extractionVersion: string;
  confirmedAt: string;
  wasEdited: boolean;
}

// Confirmed knowledge is DERIVED, never stored as its own table: it is the
// immutable proposal plus the most recent verdict on it. Capture Contract
// Article 5 -- approval never overwrites the proposal, so the proposal and the
// verdict stay two separate records and this join is what reunites them.
export async function courseKnowledge(
  courseId: string,
  // Whose view this is. DEFAULTS TO THE STUDENT'S, which is the strict one.
  //
  // The only caller, `GET /api/courses/[id]/knowledge`, serves owner and
  // student from the same call and does not tell this function which it is
  // talking to. Defaulting to the strict view means the worst case is a
  // lecturer not seeing a replayed item in a legacy route that no UI reads;
  // defaulting the other way means a student reading another lecture's
  // transcript. Only one of those is a safety failure.
  //
  // That route is owned elsewhere. When it can be edited it should pass
  // `{ forStudent: !isOwner }`, and this default should stay as it is.
  opts: { forStudent?: boolean } = {},
): Promise<KnowledgeItem[]> {
  const forStudent = opts.forStudent ?? true;
  const svc = serviceClient();

  const { data: candidates } = await svc
    .from("extraction_candidates")
    .select("id, lecture_id, kind, title, detail, due_phrase, due_resolved, evidence_start_ms, evidence_end_ms, evidence_text, extraction_method, extraction_version")
    .eq("course_id", courseId);
  if (!candidates?.length) return [];

  const ids = candidates.map((c) => c.id as string);
  const { data: reviews } = await svc
    .from("candidate_reviews")
    .select("candidate_id, action, final_kind, final_title, final_detail, final_due_phrase, final_due_resolved, created_at")
    .in("candidate_id", ids)
    .order("created_at", { ascending: false });

  // First row per candidate wins because the query is newest-first. A later
  // reject therefore retracts an earlier confirm, which is the behaviour a
  // faculty member expects from a mistake they just corrected.
  const latest = new Map<string, NonNullable<typeof reviews>[number]>();
  for (const r of reviews ?? []) {
    const key = r.candidate_id as string;
    if (!latest.has(key)) latest.set(key, r);
  }

  const lectures = await fetchLectureGateRows({ courseId });
  const titles = new Map(lectures.map((l) => [l.id, l.title]));
  // Confirmed or not, an item extracted from a transcript that failed
  // validation is not knowledge about this course, and neither is an item
  // extracted from a transcript that belongs to a different recording. Both
  // rules live in `@/lib/knowledge/read` -- this is the LEGACY Layer-1 view and
  // it must not grow a second, drifting opinion about what a student may see.
  //
  // Listed positively so a status or an engine invented later is excluded until
  // it is deliberately allowed.
  const servable = new Set(
    lectures
      .filter((l) => (forStudent ? lectureVisibleToStudents(l) : l.status === "ready"))
      .map((l) => l.id),
  );

  const out: KnowledgeItem[] = [];
  for (const c of candidates) {
    if (!servable.has(c.lecture_id as string)) continue;
    const review = latest.get(c.id as string);
    if (!review || review.action === "reject") continue;

    const edited = review.action === "edit";
    out.push({
      candidateId: c.id as string,
      kind: (review.final_kind as string | null) ?? (c.kind as string),
      title: (review.final_title as string | null) ?? (c.title as string),
      detail: (review.final_detail as string | null) ?? (c.detail as string),
      duePhrase: (review.final_due_phrase as string | null) ?? (c.due_phrase as string | null),
      dueResolved: (review.final_due_resolved as string | null) ?? (c.due_resolved as string | null),
      lectureId: c.lecture_id as string,
      lectureTitle: titles.get(c.lecture_id as string) ?? "Lecture",
      evidenceStartMs: Number(c.evidence_start_ms),
      evidenceEndMs: Number(c.evidence_end_ms),
      evidenceText: c.evidence_text as string,
      extractionMethod: c.extraction_method as string,
      extractionVersion: c.extraction_version as string,
      confirmedAt: review.created_at as string,
      wasEdited: edited,
    });
  }
  return out;
}

// Deterministic retrieval over confirmed items. No model, no generation: an
// answer is a ranked set of items the faculty already approved, each carrying
// its own evidence. It cannot hallucinate, because it can only return rows that
// exist -- which is the point, for a system whose whole claim is trustworthiness.
export function searchKnowledge(items: KnowledgeItem[], query: string): KnowledgeItem[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (!terms.length) return [];

  const KIND_HINTS: Record<string, string[]> = {
    assignment: ["assignment", "homework", "submit", "due", "hw", "dpp"],
    deadline: ["deadline", "due", "last date", "when", "kab"],
    exam_scope: ["exam", "test", "syllabus", "portion", "scope", "quiz"],
    announcement: ["announce", "notice", "schedule", "notes", "pdf"],
    guidance: ["advice", "suggest", "recommend", "tip"],
  };

  const scored = items.map((item) => {
    const hay = `${item.title} ${item.detail} ${item.evidenceText} ${item.duePhrase ?? ""}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 2;
      for (const [kind, hints] of Object.entries(KIND_HINTS)) {
        if (item.kind === kind && hints.some((h) => t.includes(h) || h.includes(t))) score += 1;
      }
    }
    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => s.item);
}
