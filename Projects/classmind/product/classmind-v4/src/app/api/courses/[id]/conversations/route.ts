import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { listConversations } from "@/lib/knowledge/conversations";

// The caller's OWN conversations inside this course. `?lectureId=` narrows to
// one lecture's threads; without it the list is the course Ask tab's
// (scope='course') threads, so the two surfaces never bleed into each other.
//
// There is deliberately no POST here: a conversation is created by its first
// actual question (the ask route with `persist`), never by a page visit -- an
// empty conversation row that a student never spoke into is clutter that
// would outnumber the real ones within a week.
//
// When the conversations migration is unapplied this answers
// `{ state: "unavailable" }` with an empty list, and the UI runs ephemeral.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await requireCourseAccess(id, user.id);

    const lectureId = new URL(request.url).searchParams.get("lectureId")?.trim() || undefined;
    const listed = await listConversations(serviceClient(), user.id, {
      courseId: id,
      lectureId,
    });
    return NextResponse.json({
      state: listed.state,
      note: listed.note,
      conversations: listed.conversations.map((c) => ({
        id: c.id,
        title: c.title,
        scope: c.scope,
        lectureId: c.lectureId,
        createdAt: c.createdAt,
        lastMessageAt: c.lastMessageAt,
      })),
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
