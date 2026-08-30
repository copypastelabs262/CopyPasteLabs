import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { courseKnowledge } from "@/lib/knowledge";

// LEGACY. The Layer-1 confirmed-candidate view of a course, superseded by
// `GET /api/courses/[id]/units`.
//
// It reads `candidate_reviews`, and nothing in the product has written that
// table since review moved to `POST /api/knowledge/[id]/review`, which updates
// `knowledge_items` instead. So this route answers honestly for the store it
// reads and that store no longer receives verdicts -- which is exactly how the
// course page came to print "Nothing confirmed yet." to a lecturer who had just
// confirmed everything. Course knowledge is now served from `knowledge_items`
// via `readKnowledge`, the same store the lecture pages and `/ask` read.
//
// Kept, working and unchanged: `scripts/e2e.mts` asserts on the `{ items }`
// shape here, and deleting the old path while adding the correct one would turn
// a fix into a migration. No UI reads it.
//
// Confirmed knowledge. Open to owner and enrolled students alike -- by
// construction it contains only items a human confirmed.
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await requireCourseAccess(id, user.id);
    return NextResponse.json({ items: await courseKnowledge(id) });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
