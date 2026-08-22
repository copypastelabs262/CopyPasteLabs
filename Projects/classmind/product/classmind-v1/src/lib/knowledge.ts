import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { categoryOf } from "@/lib/extraction";

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
export async function courseKnowledge(courseId: string): Promise<KnowledgeItem[]> {
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

  const { data: lectures } = await svc
    .from("lectures").select("id, title").eq("course_id", courseId);
  const titles = new Map((lectures ?? []).map((l) => [l.id as string, l.title as string]));

  const out: KnowledgeItem[] = [];
  for (const c of candidates) {
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

// ---------------------------------------------------------------------------
// What was taught in this lecture
// ---------------------------------------------------------------------------
//
// Answers one question well rather than answering anything badly. It reads the
// STORED knowledge for a lecture -- the candidates and the verdicts on them --
// and never re-reads the transcript. That is the point: the transcript is
// 22,000 characters of code-switched speech, and a product that re-derives its
// answer from it on every question has no stored knowledge at all, only a
// cache-less summariser.
//
// Nothing here generates prose. Every line a reader sees is a title extracted
// from a sentence the lecturer actually said, carried with the timestamp it was
// said at, so any claim can be checked against the recording in one click.

export interface TaughtItem {
  candidateId: string;
  kind: string;
  title: string;
  detail: string;
  evidenceStartMs: number;
  evidenceEndMs: number;
  evidenceText: string;
  confidence: number | null;
  // Whether a human has ruled on this yet, and what they said. Teaching items
  // are shown to faculty before review -- the alternative is a reviewer facing
  // thirty rows with no idea what the lecture was about -- so the review state
  // travels with every item rather than being implied by its presence.
  reviewState: "unreviewed" | "confirmed" | "rejected";
}

export interface LectureTaught {
  lectureId: string;
  lectureTitle: string;
  // The lecturer's own statement of what the session covers, when they made
  // one. Worth its own field: it is the only summary in the lecture written by
  // someone who knew what they were about to teach.
  lessonScope: TaughtItem[];
  mainTopics: TaughtItem[];
  concepts: TaughtItem[];
  breakdowns: TaughtItem[];
  comparisons: TaughtItem[];
  references: TaughtItem[];
  actionable: TaughtItem[];
  counts: { teaching: number; actionable: number; reference: number; rejected: number };
}

const BUCKET_OF: Record<string, keyof Omit<LectureTaught, "lectureId" | "lectureTitle" | "counts">> = {
  lesson_scope: "lessonScope",
  topic: "mainTopics",
  definition: "concepts",
  enumeration: "breakdowns",
  comparison: "comparisons",
  reference: "references",
  assignment: "actionable",
  deadline: "actionable",
  exam_scope: "actionable",
  announcement: "actionable",
  guidance: "actionable",
};

export async function lectureTaught(lectureId: string): Promise<LectureTaught | null> {
  const svc = serviceClient();

  const { data: lecture } = await svc
    .from("lectures").select("id, title").eq("id", lectureId).maybeSingle();
  if (!lecture) return null;

  const { data: candidates } = await svc
    .from("extraction_candidates")
    .select("id, kind, title, detail, evidence_start_ms, evidence_end_ms, evidence_text, confidence, extraction_method, extraction_version, created_at")
    .eq("lecture_id", lectureId)
    .order("evidence_start_ms", { ascending: true });

  const out: LectureTaught = {
    lectureId, lectureTitle: lecture.title as string,
    lessonScope: [], mainTopics: [], concepts: [], breakdowns: [],
    comparisons: [], references: [], actionable: [],
    counts: { teaching: 0, actionable: 0, reference: 0, rejected: 0 },
  };
  if (!candidates?.length) return out;

  // Only the most recent extraction run reaches a reader -- the same rule the
  // review queue applies, for the same reason: a re-run would otherwise show
  // every topic twice, once per run.
  let newestRun: { key: string; at: number } | null = null;
  for (const c of candidates) {
    const key = `${c.extraction_method}@${c.extraction_version}`;
    const at = Date.parse(c.created_at as string);
    if (!newestRun || at > newestRun.at) newestRun = { key, at };
  }
  const current = candidates.filter(
    (c) => `${c.extraction_method}@${c.extraction_version}` === newestRun?.key,
  );

  const { data: reviews } = await svc
    .from("candidate_reviews")
    .select("candidate_id, action, final_kind, final_title, final_detail, created_at")
    .in("candidate_id", current.map((c) => c.id as string))
    .order("created_at", { ascending: false });

  const verdict = new Map<string, NonNullable<typeof reviews>[number]>();
  for (const r of reviews ?? []) {
    const key = r.candidate_id as string;
    if (!verdict.has(key)) verdict.set(key, r);
  }

  for (const c of current) {
    const v = verdict.get(c.id as string);
    const state: TaughtItem["reviewState"] =
      !v ? "unreviewed" : v.action === "reject" ? "rejected" : "confirmed";
    if (state === "rejected") { out.counts.rejected += 1; continue; }

    // A confirmed item shows the faculty member's wording; an unreviewed one
    // shows the machine's. Never the other way round.
    const kind = (v?.final_kind as string | null) ?? (c.kind as string);
    const item: TaughtItem = {
      candidateId: c.id as string,
      kind,
      title: (v?.final_title as string | null) ?? (c.title as string),
      detail: (v?.final_detail as string | null) ?? (c.detail as string),
      evidenceStartMs: Number(c.evidence_start_ms),
      evidenceEndMs: Number(c.evidence_end_ms),
      evidenceText: c.evidence_text as string,
      confidence: c.confidence === null ? null : Number(c.confidence),
      reviewState: state,
    };
    const bucket = BUCKET_OF[kind] ?? "actionable";
    out[bucket].push(item);
    const cat = categoryOf(kind);
    out.counts[cat] += 1;
  }
  return out;
}
