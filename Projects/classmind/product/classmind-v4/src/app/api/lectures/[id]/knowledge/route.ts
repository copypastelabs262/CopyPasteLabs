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

    // How many actionable items are still waiting on the lecturer.
    //
    // Counted from the database rather than from `units`, because a student's
    // `units` has already had pending items filtered out of it -- deriving the
    // count from a list the filter emptied would always give zero, which is how
    // this was previously wrong.
    //
    // THE COUNT IS RETURNED TO STUDENTS TOO, deliberately. Withholding the
    // CONTENT of an unconfirmed assignment is the product's central safety rule
    // and it does not change. But withholding the FACT that something is coming
    // is a different thing, and it makes the product quietly dishonest: a
    // student who reads "nothing to do" cannot tell that from "your lecturer
    // has not looked yet", and acts on the wrong one. Telling them a number
    // reveals no content, matches the same rule the answers follow -- say what
    // is not established rather than implying it does not exist -- and puts
    // useful pressure on the review queue.
    const { count: pendingCount } = await svc
      .from("knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("lecture_id", id)
      .eq("status", "pending");

    return NextResponse.json({
      isOwner,
      units,
      // What the teacher still has to look at. Zero is the normal state.
      awaitingReview: pendingCount ?? 0,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
