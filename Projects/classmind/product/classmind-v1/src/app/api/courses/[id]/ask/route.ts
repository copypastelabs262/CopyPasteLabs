import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { courseKnowledge, searchKnowledge } from "@/lib/knowledge";

// Question answering, grounded by construction.
//
// This deliberately does NOT generate prose. It retrieves confirmed items and
// returns them with their evidence. A generated answer could restate a deadline
// slightly wrong and would still look authoritative; a retrieved one cannot say
// anything a faculty member did not confirm. For a product whose entire claim is
// that students can trust what they read, that trade is worth making, and it
// also means the feature works with no LLM credential at all.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await requireCourseAccess(id, user.id);

    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (!q) return NextResponse.json({ error: "Ask a question." }, { status: 400 });

    const all = await courseKnowledge(id);
    const hits = searchKnowledge(all, q);

    return NextResponse.json({
      question: q,
      answered: hits.length > 0,
      // Stated plainly rather than dressed up. "Nothing confirmed covers this"
      // is a true and useful answer; an invented one is neither.
      message: hits.length
        ? `${hits.length} confirmed item${hits.length === 1 ? "" : "s"} in this course match your question.`
        : "Nothing in this course's confirmed knowledge answers that yet. Only faculty-confirmed information is searchable.",
      items: hits,
      totalConfirmed: all.length,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
