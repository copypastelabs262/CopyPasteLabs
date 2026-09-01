import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { isReplayedOrUnverifiable, replayVerdict, type LectureProvenanceFacts } from "@/lib/provenance/replay";
// Reused, not restated: "the column is not there" already has one definition in
// this codebase and a second one would drift.
import { isMissingSchemaError } from "@/lib/provenance/audio-identity";

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

// ---------------------------------------------------------------------------
// The LECTURE half of "a student may see this"
// ---------------------------------------------------------------------------
//
// `visibleToStudents` above judges a knowledge UNIT. It cannot judge the
// lecture the unit came from, and the unit is worthless -- worse, misleading --
// if that lecture's transcript came from a different recording. Both halves
// live in this file so there is exactly ONE definition to keep correct;
// `src/lib/knowledge.ts` and `GET /api/lectures/[id]` import from here rather
// than restating the rule.

export interface LectureGateRow extends LectureProvenanceFacts {
  id: string;
  title: string;
  status: string;
}

// Columns every deployment has.
const GATE_COLUMNS_BASE = "id, title, status, provenance, provider_job_id";

// Columns that arrive with migration 20260830150000, which is WRITTEN BUT NOT
// APPLIED. Selecting a column Postgres does not have fails the whole query, and
// a failed query here would empty every student's knowledge base -- so each is
// probed once per process and dropped until it exists.
//
// The probe is cached for the life of the process, which means applying the
// migration needs a restart before the gate reads the new columns. That is a
// deploy, and a deploy restarts the process. The alternative -- probing on
// every read -- buys nothing and costs a round trip per request.
const GATE_COLUMNS_OPTIONAL = ["audio_identity", "replay_fixture_slug"] as const;
let availableOptionalColumns: string[] | null = null;

async function optionalGateColumns(): Promise<string[]> {
  if (availableOptionalColumns !== null) return availableOptionalColumns;
  const svc = serviceClient();
  const found: string[] = [];
  let conclusive = true;
  for (const column of GATE_COLUMNS_OPTIONAL) {
    const { error } = await svc.from("lectures").select(`id, ${column}`).limit(1);
    if (!error) { found.push(column); continue; }
    // Only "the column is not there" is an answer. A timeout or an auth failure
    // is NOT, and caching it as "absent" would quietly and permanently drop a
    // gate input for the life of the process -- the exact class of silent
    // weakening this feature exists to remove. Leave the probe uncached and
    // ask again next time.
    if (!isMissingSchemaError(error)) conclusive = false;
  }
  if (conclusive) availableOptionalColumns = found;
  return found;
}

type GateFilter = { ids: string[] } | { courseId: string };

// Every lecture fact the student gate reads, in one query.
//
// `raw_transcription_response` is deliberately NOT selected: it is the largest
// column in the database and the gate does not need it. Its absence means
// `hasTranscript` is left undefined, which the predicate reads as "assume there
// is one" -- the fail-closed default, and the correct one here, since a lecture
// with no transcript has no knowledge to serve either.
export async function fetchLectureGateRows(filter: GateFilter): Promise<LectureGateRow[]> {
  if ("ids" in filter && filter.ids.length === 0) return [];
  const svc = serviceClient();
  const columns = [GATE_COLUMNS_BASE, ...(await optionalGateColumns())].join(", ");
  let q = svc.from("lectures").select(columns);
  q = "ids" in filter ? q.in("id", filter.ids) : q.eq("course_id", filter.courseId);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((l) => ({
    id: l.id as string,
    title: (l.title as string | null) ?? "Lecture",
    status: l.status as string,
    provenance: l.provenance,
    providerJobId: (l.provider_job_id as string | null) ?? null,
    audioIdentity: l.audio_identity,
    replayFixtureSlug: l.replay_fixture_slug,
  }));
}

// THE definition of "a student may read anything derived from this lecture".
//
// Two conditions, both fail-closed, and neither is a substitute for the other:
//
//   status === 'ready'   the lecture finished processing and was not
//                        quarantined. Listed positively so a status invented
//                        later is excluded until someone decides otherwise.
//   not replayed         the transcript came from THIS recording and we can
//                        show it. See src/lib/provenance/replay.ts.
//
// A quarantined lecture is one whose transcript reads wrong. A replayed one
// reads perfectly -- it is simply somebody else's lecture. The status check has
// never been able to see that, which is why lecture 5ced44b6 has been `ready`
// and readable since 2026-08-22.
export function lectureVisibleToStudents(row: LectureGateRow): boolean {
  return row.status === "ready" && !isReplayedOrUnverifiable(row);
}

// The same judgement, with its reason, for a caller that has to explain itself
// to a human (the lecture route's 403). Null when the lecture is visible.
export function lectureWithheldReason(row: LectureGateRow): string | null {
  if (row.status !== "ready") return "This lecture is not published yet.";
  return replayVerdict(row).reason;
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
  // Status AND provenance are selected alongside the title, because knowledge
  // from a QUARANTINED lecture and knowledge from a REPLAYED one must both be
  // withheld -- see the two filters below. Same query, no extra round trip.
  const lectures = await fetchLectureGateRows({ ids: lectureIds });
  const titles = new Map(lectures.map((l) => [l.id, l.title]));

  // A lecture whose transcript failed validation is not a source of knowledge.
  //
  // The poll and extract gates stop such knowledge being CREATED, and that is
  // not the same as stopping it being SERVED. Two ways it can exist anyway:
  // a lecture processed before the guard existed, and a lecture that becomes
  // quarantined after its knowledge was already stored. Both are real -- one
  // deployed lecture holds a transcript from a different recording entirely and
  // its knowledge is live right now.
  //
  // Fail CLOSED: this lists the status that may be served rather than the ones
  // that may not, so a status added later is excluded until someone decides
  // otherwise. Getting that backwards is how a quarantine leaks.
  const servable = new Set(lectures.filter((l) => l.status === "ready").map((l) => l.id));

  // A lecture whose transcript did not come from its own recording is not a
  // source of knowledge for a STUDENT.
  //
  // Student-only, unlike the status filter above, and that asymmetry is the
  // point: this is a visibility gate, not a deletion. The faculty owner keeps
  // the knowledge AND the transcript, because they are the evidence a lecturer
  // needs to decide what actually happened to their lecture. A student has no
  // way to tell a replayed transcript from a real one and no reason to be shown
  // the difference -- they would simply learn the wrong subject.
  const replayed = new Set(
    lectures.filter((l) => isReplayedOrUnverifiable(l)).map((l) => l.id),
  );

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

  const fromServableLecture = out.filter((u) => servable.has(u.lectureId));
  return opts.forStudent
    ? fromServableLecture.filter((u) => !replayed.has(u.lectureId)).filter(visibleToStudents)
    : fromServableLecture.filter((u) => u.status !== "rejected");
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
