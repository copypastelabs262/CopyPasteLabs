import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { readKnowledge } from "@/lib/knowledge/read";
import { serviceClient } from "@/lib/supabase/service";
import { answerFromKnowledge } from "@/lib/knowledge/answer";
import { recordAskRun } from "@/lib/knowledge/ask-meter";

// LAYER 4 -- a student asks a question of the course's memory.
//
// This used to return a ranked list of confirmed rows and call it an answer.
// It now retrieves the relevant stored knowledge units and has a model compose
// a grounded answer from them, citing the units it used -- unless the routing
// layer can answer from the stored fields directly, in which case no model is
// called at all. Either way the ask is METERED: one line in the server log and
// one row in ask_runs, so this paid path can never again spend invisibly.
//
// The model never sees a transcript. It sees only knowledge that has already
// been reconstructed and, where it matters, confirmed by the lecturer -- so the
// worst failure available to it is a clumsy sentence about a true item, not an
// invented deadline. The evidence for every cited unit comes back alongside the
// prose so a student can jump to the second it was spoken.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const { isOwner } = await requireCourseAccess(id, user.id);
    const svc = serviceClient();

    const params_ = new URL(request.url).searchParams;
    const q = params_.get("q")?.trim() ?? "";
    if (!q) return NextResponse.json({ error: "Ask a question." }, { status: 400 });

    // Optional lecture scope. "What did I miss today?" is a question about ONE
    // lecture, and answering it from the whole course pulls in material the
    // student did not ask about and dilutes retrieval. Course scope stays the
    // default so "what is due this term" still works.
    //
    // The lecture is checked to belong to this course before it is used. Without
    // that, the id is a parameter a student controls, and passing another
    // course's lecture id would read knowledge they are not enrolled in.
    const lectureId = params_.get("lectureId")?.trim() || undefined;
    if (lectureId) {
      const { data: owned } = await svc
        .from("lectures")
        .select("id")
        .eq("id", lectureId)
        .eq("course_id", id)
        .maybeSingle();
      if (!owned) {
        return NextResponse.json(
          { error: "That lecture is not part of this course." },
          { status: 404 },
        );
      }
    }

    // The replay gate is INHERITED here, not restated.
    //
    // `readKnowledge` withholds knowledge from any lecture whose transcript
    // cannot be shown to have come from its own recording, so a replayed
    // lecture is absent from `units` before retrieval runs and cannot be cited
    // however the question is worded -- including a question built from words
    // that appear only in the replayed transcript, which is the case
    // scripts/test-replay-gate.mts asserts. Filtering the SOURCES afterwards
    // would be the wrong shape: the model would already have read the unit.
    const units = await readKnowledge({ courseId: id, lectureId, forStudent: !isOwner });
    const result = await answerFromKnowledge(units, q);

    // Metered before it is returned, $0 routes included -- "which questions
    // cost nothing" is half of what the meter is for. Awaited (one insert),
    // but never allowed to fail the answer: recordAskRun reports state
    // instead of throwing.
    const meter = await recordAskRun({
      courseId: id,
      lectureId: lectureId ?? null,
      userId: user.id,
      question: q,
      route: result.route,
      provider: result.usage?.provider ?? null,
      model: result.usage?.model ?? null,
      requestId: result.usage?.requestId ?? null,
      promptTokens: result.usage?.promptTokens ?? null,
      completionTokens: result.usage?.completionTokens ?? null,
      unitsAvailable: units.length,
      unitsCited: result.usedUnits.length,
      durationMs: result.durationMs,
      error: result.failure,
    });

    return NextResponse.json({
      question: result.question,
      answered: result.answered,
      answer: result.answer,
      // Only the units actually used, each with its evidence, so every claim in
      // the prose is checkable.
      sources: result.usedUnits.map((u, i) => ({
        ref: i + 1,
        id: u.id,
        lectureId: u.lectureId,
        lectureTitle: u.lectureTitle,
        category: u.category,
        kind: u.kind,
        title: u.title,
        summary: u.summary,
        steps: u.steps,
        unspecified: u.unspecified,
        status: u.status,
        evidence: u.evidence,
      })),
      degraded: result.degraded,
      knowledgeUnitsAvailable: units.length,
      scope: lectureId ? "lecture" : "course",
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
