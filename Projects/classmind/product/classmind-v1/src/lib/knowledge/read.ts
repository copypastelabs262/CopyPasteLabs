import "server-only";
import { serviceClient } from "@/lib/supabase/service";

export interface Evidence {
  role: string | null;
  startMs: number;
  endMs: number;
  quote: string;
  lectureId: string;
}
export interface KnowledgeUnit {
  id: string;
  lectureId: string;
  lectureTitle: string;
  courseId: string;
  category: "teaching" | "actionable" | "reference";
  kind: string;
  title: string;
  summary: string;
  steps: string[];
  unspecified: string[];
  status: "auto" | "pending" | "confirmed" | "rejected";
  confidence: number | null;
  evidence: Evidence[];
}

// What a STUDENT may see. Teaching enters the base automatically ('auto');
// actionable knowledge is invisible until a human confirms it. Nothing that was
// rejected, and nothing still pending, ever reaches this list.
export function visibleToStudents(u: KnowledgeUnit): boolean {
  return u.status === "auto" || u.status === "confirmed";
}

interface Options { lectureId?: string; courseId?: string; forStudent: boolean }

export async function readKnowledge(opts: Options): Promise<KnowledgeUnit[]> {
  const svc = serviceClient();
  let q = svc
    .from("knowledge_items")
    .select("id, lecture_id, course_id, category, kind, title, summary, steps, unspecified, status, confidence, created_at");
  if (opts.lectureId) q = q.eq("lecture_id", opts.lectureId);
  if (opts.courseId) q = q.eq("course_id", opts.courseId);
  const { data: items } = await q.order("created_at", { ascending: true });
  if (!items?.length) return [];

  const ids = items.map((i) => i.id as string);
  const { data: ev } = await svc
    .from("knowledge_evidence")
    .select("knowledge_item_id, lecture_id, role, start_ms, end_ms, quote")
    .in("knowledge_item_id", ids)
    .order("start_ms", { ascending: true });

  const byItem = new Map<string, Evidence[]>();
  for (const e of ev ?? []) {
    const key = e.knowledge_item_id as string;
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key)!.push({
      role: (e.role as string | null) ?? null,
      startMs: Number(e.start_ms), endMs: Number(e.end_ms),
      quote: e.quote as string, lectureId: e.lecture_id as string,
    });
  }

  const lectureIds = [...new Set(items.map((i) => i.lecture_id as string))];
  const { data: lectures } = await svc.from("lectures").select("id, title").in("id", lectureIds);
  const titles = new Map((lectures ?? []).map((l) => [l.id as string, l.title as string]));

  const out = items.map((i) => ({
    id: i.id as string,
    lectureId: i.lecture_id as string,
    lectureTitle: titles.get(i.lecture_id as string) ?? "Lecture",
    courseId: i.course_id as string,
    category: i.category as KnowledgeUnit["category"],
    kind: i.kind as string,
    title: i.title as string,
    summary: i.summary as string,
    steps: (i.steps as string[]) ?? [],
    unspecified: (i.unspecified as string[]) ?? [],
    status: i.status as KnowledgeUnit["status"],
    confidence: i.confidence === null ? null : Number(i.confidence),
    evidence: byItem.get(i.id as string) ?? [],
  }));

  return opts.forStudent ? out.filter(visibleToStudents) : out.filter((u) => u.status !== "rejected");
}

// Retrieval for question answering.
//
// Term overlap over a few dozen stored units, not embeddings. The retrieval set
// for one course is small enough that a vector index would be infrastructure
// with no problem to solve, and lexical matching over a knowledge base whose
// text is already a clean English summary behaves well. This is the piece to
// revisit first if recall becomes the complaint.
export function retrieve(units: KnowledgeUnit[], question: string, limit = 8): KnowledgeUnit[] {
  const terms = question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2);
  if (!terms.length) return units.slice(0, limit);

  const WANTS_ACTIONABLE = /(assign|homework|submit|deadline|due|exam|task|deliver|marks?)/i.test(question);

  const scored = units.map((u) => {
    const hay = `${u.title} ${u.summary} ${u.steps.join(" ")} ${u.kind}`.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += 2;
    // A question about work should surface work, even when the words differ.
    if (WANTS_ACTIONABLE && u.category === "actionable") score += 3;
    // A confirmed item outranks an automatic one at equal relevance: a human
    // has vouched for it.
    if (u.status === "confirmed") score += 1;
    return { u, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.u);
}
