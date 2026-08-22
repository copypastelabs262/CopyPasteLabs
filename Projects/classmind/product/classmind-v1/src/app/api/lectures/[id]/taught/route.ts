import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { lectureTaught } from "@/lib/knowledge";

// "What all was taught in this lecture?"
//
// Answered from stored knowledge, never by re-reading the transcript. The
// answer is a structure, not prose: topics, concepts, breakdowns, comparisons,
// references and anything actionable, each carrying the timestamp and the
// verbatim sentence it came from.
//
// Role-aware in the one way that matters. A faculty member sees unreviewed
// items, because they are the person who reviews them and a queue of thirty
// rows is unreadable without knowing what the lecture was about. A student sees
// only what a human has confirmed -- the same gate as everywhere else.
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: lecture } = await svc
      .from("lectures").select("id, course_id, status").eq("id", id).maybeSingle();
    if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });

    const { isOwner } = await requireCourseAccess(lecture.course_id as string, user.id);
    if (!isOwner && lecture.status !== "ready") {
      return NextResponse.json({ error: "This lecture is not published yet." }, { status: 403 });
    }

    const taught = await lectureTaught(id);
    if (!taught) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });

    if (isOwner) return NextResponse.json({ taught, isOwner: true });

    // Same object, filtered to confirmed items only. Filtering here rather than
    // in lectureTaught keeps one implementation of "what was taught" and one
    // place where the student gate is applied.
    const keep = (items: typeof taught.mainTopics) =>
      items.filter((i) => i.reviewState === "confirmed");
    return NextResponse.json({
      taught: {
        ...taught,
        lessonScope: keep(taught.lessonScope),
        mainTopics: keep(taught.mainTopics),
        concepts: keep(taught.concepts),
        breakdowns: keep(taught.breakdowns),
        comparisons: keep(taught.comparisons),
        references: keep(taught.references),
        actionable: keep(taught.actionable),
      },
      isOwner: false,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
