import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { readKnowledge } from "@/lib/knowledge/read";

// The knowledge base for one lecture.
//
// Faculty get everything including items still awaiting their verdict; students
// get only what is live. The filter lives in readKnowledge so there is exactly
// one definition of "a student may see this".
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

    const units = await readKnowledge({ lectureId: id, forStudent: !isOwner });
    return NextResponse.json({
      isOwner,
      units,
      // What the teacher still has to look at. Zero is the normal state.
      awaitingReview: isOwner ? units.filter((u) => u.status === "pending").length : 0,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
