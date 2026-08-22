import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { courseKnowledge } from "@/lib/knowledge";

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
