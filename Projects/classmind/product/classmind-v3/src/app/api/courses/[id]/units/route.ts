import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { readKnowledge } from "@/lib/knowledge/read";

// THE KNOWLEDGE BASE FOR A WHOLE COURSE, IN ONE REQUEST.
//
// The course screens used to assemble this themselves, one
// `/api/lectures/{id}/knowledge` call per finished lecture. Each of those costs
// roughly nine Supabase round trips, so a twenty-lecture course spent about a
// hundred and eighty queries drawing a page that wants a handful of assignments
// and a list of titles. `readKnowledge` already accepts a courseId; nothing was
// missing except a route that asked it that way.
//
// Deliberately the same shape as `/api/lectures/[id]/knowledge`: same auth,
// same student filter, same `awaitingReview` contract. The filter itself lives
// in `readKnowledge`, so there is still exactly one definition of "a student
// may see this" -- writing a second one here is how the two course-level
// knowledge stores came to disagree in the first place.
//
// Note there is no per-lecture readiness check to mirror the lecture route's
// 403: `readKnowledge` only serves units from lectures whose status is `ready`,
// so an unpublished lecture contributes nothing to either role's list.
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const { isOwner } = await requireCourseAccess(id, user.id);

    const units = await readKnowledge({ courseId: id, forStudent: !isOwner });

    // How many actionable items across the course are still waiting on the
    // lecturer. Counted from the database rather than from `units`, because a
    // student's `units` has already had pending items filtered out of it.
    //
    // THE COUNT IS RETURNED TO STUDENTS TOO, deliberately, for the reason the
    // lecture route sets out: withholding the CONTENT of an unconfirmed
    // assignment is the central safety rule, and withholding the FACT that one
    // exists is a different thing that makes the product quietly dishonest.
    //
    // Restricted to published lectures so the number describes the same body of
    // work `units` was drawn from. A count that ranged wider than the list
    // would be a third opinion about what this course contains.
    const svc = serviceClient();
    const { data: published } = await svc
      .from("lectures")
      .select("id")
      .eq("course_id", id)
      .eq("status", "ready");
    const publishedIds = (published ?? []).map((l) => l.id as string);

    let awaitingReview = 0;
    if (publishedIds.length) {
      const { count } = await svc
        .from("knowledge_items")
        .select("id", { count: "exact", head: true })
        .eq("course_id", id)
        .eq("status", "pending")
        .in("lecture_id", publishedIds);
      awaitingReview = count ?? 0;
    }

    return NextResponse.json({ isOwner, units, awaitingReview });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
