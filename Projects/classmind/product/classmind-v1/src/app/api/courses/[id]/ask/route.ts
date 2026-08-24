import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { readKnowledge } from "@/lib/knowledge/read";
import { answerFromKnowledge } from "@/lib/knowledge/answer";

// LAYER 4 -- a student asks a question of the course's memory.
//
// This used to return a ranked list of confirmed rows and call it an answer.
// It now retrieves the relevant stored knowledge units and has a model compose
// a grounded answer from them, citing the units it used.
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

    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (!q) return NextResponse.json({ error: "Ask a question." }, { status: 400 });

    const units = await readKnowledge({ courseId: id, forStudent: !isOwner });
    const result = await answerFromKnowledge(units, q);

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
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
