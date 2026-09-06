import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse, HttpError } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { deleteConversation, getConversation } from "@/lib/knowledge/conversations";
import { listCourseMemberships } from "@/lib/knowledge/academic-context";
import { fetchLectureGateRows, lectureVisibleToStudents } from "@/lib/knowledge/read";

// One stored conversation, whole: its identity and every message in order,
// with each assistant message's persisted provenance (route, sources) so the
// client renders a resumed thread exactly as it was shown live.
//
// OWNERSHIP IS THE FIRST KEY, ACCESS IS THE SECOND. The store filters every
// query to the session user, and "absent" and "someone else's" are the same
// 404 -- a guessed id must learn nothing. But owning a thread is not the same
// as still having access to its course: a student removed from a course must
// not keep reading its lecture evidence through an old conversation, so the
// course gate is re-checked on every read (and its refusal is the same 404).
//
// THE STORED PAYLOAD DOES NOT OUTLIVE THE GATES THAT PRODUCED IT. Sources
// were frozen into the message when the answer was composed; if their lecture
// has since been quarantined, unpublished or judged replayed, readKnowledge
// would withhold them everywhere else -- so they are withheld here too. The
// prose stays (the student saw it); the evidence stops being replayable.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND = NextResponse.json(
  { error: "That conversation was not found." },
  { status: 404 },
);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    // A malformed id is a 404, not a database error on the wire.
    if (!UUID.test(id)) return NOT_FOUND;

    const got = await getConversation(serviceClient(), user.id, id);
    if (got.state === "not_found") return NOT_FOUND;
    if (got.state === "unavailable") {
      return NextResponse.json({ state: "unavailable", note: got.note });
    }

    // Current course access, not historical. The refusal is indistinguishable
    // from absence on purpose.
    //
    // A course/lecture thread has ONE course to re-check; a global thread has
    // none of its own, so its check is the caller's whole current membership:
    // every stored source names its course, and a source from a course the
    // reader can no longer open is withheld exactly as readKnowledge would
    // withhold it today.
    let isOwner = false;
    let ownedCourses = new Set<string>();
    let accessibleCourses = new Set<string>();
    if (got.conversation.courseId) {
      try {
        ({ isOwner } = await requireCourseAccess(got.conversation.courseId, user.id));
      } catch (err) {
        if (err instanceof HttpError) return NOT_FOUND;
        throw err;
      }
    } else {
      const memberships = await listCourseMemberships(serviceClient(), user.id);
      ownedCourses = new Set(memberships.filter((m) => m.isOwner).map((m) => m.id));
      accessibleCourses = new Set(memberships.map((m) => m.id));
    }

    // Which cited lectures may still be shown to THIS reader. Same rules as
    // readKnowledge: a lecture must be published, and for a student it must
    // also pass the replay gate. Sources from any other lecture are stripped.
    const citedLectureIds = [
      ...new Set(
        got.messages.flatMap((m) =>
          (m.payload?.sources ?? [])
            .map((s) => (s as { lectureId?: unknown }).lectureId)
            .filter((v): v is string => typeof v === "string"),
        ),
      ),
    ];
    const gateRows = citedLectureIds.length
      ? await fetchLectureGateRows({ ids: citedLectureIds })
      : [];
    const gateById = new Map(gateRows.map((row) => [row.id, row]));

    const sourceServable = (s: unknown): boolean => {
      const lid = (s as { lectureId?: unknown }).lectureId;
      if (typeof lid !== "string") return false;
      const row = gateById.get(lid);
      if (!row) return false;
      if (got.conversation.courseId) {
        return isOwner ? row.status === "ready" : lectureVisibleToStudents(row);
      }
      // Global thread: the source's own course decides, per the reader's
      // CURRENT relationship to it. Unknown or inaccessible course = withheld.
      const cid = (s as { courseId?: unknown }).courseId;
      if (typeof cid !== "string" || !accessibleCourses.has(cid)) return false;
      return ownedCourses.has(cid) ? row.status === "ready" : lectureVisibleToStudents(row);
    };

    return NextResponse.json({
      state: "ok",
      conversation: {
        id: got.conversation.id,
        title: got.conversation.title,
        scope: got.conversation.scope,
        courseId: got.conversation.courseId,
        lectureId: got.conversation.lectureId,
        createdAt: got.conversation.createdAt,
        lastMessageAt: got.conversation.lastMessageAt,
      },
      messages: got.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        payload: m.payload
          ? { ...m.payload, sources: m.payload.sources.filter(sourceServable) }
          : null,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// A student may remove their own conversation. Owner-filtered like every other
// query; messages cascade with the row. No course gate here on purpose --
// deleting your own thread after leaving a course exposes nothing.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (!UUID.test(id)) return NOT_FOUND;
    const result = await deleteConversation(serviceClient(), user.id, id);
    if (result.state === "not_found") return NOT_FOUND;
    if (result.state === "unavailable") {
      return NextResponse.json({ error: result.note ?? "Conversations are unavailable." }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
