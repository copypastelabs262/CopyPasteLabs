import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { deleteConversation, getConversation } from "@/lib/knowledge/conversations";

// One stored conversation, whole: its identity and every message in order,
// with each assistant message's persisted provenance (route, sources) so the
// client renders a resumed thread exactly as it was shown live.
//
// OWNERSHIP IS THE ONLY KEY. The store filters every query to the session
// user, and "absent" and "someone else's" are the same 404 on purpose -- a
// guessed id must learn nothing, not even existence.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const got = await getConversation(serviceClient(), user.id, id);
    if (got.state === "not_found") {
      return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
    }
    if (got.state === "unavailable") {
      return NextResponse.json({ state: "unavailable", note: got.note });
    }
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
        payload: m.payload,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// A student may remove their own conversation. Owner-filtered like every other
// query; messages cascade with the row.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const result = await deleteConversation(serviceClient(), user.id, id);
    if (result.state === "not_found") {
      return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
    }
    if (result.state === "unavailable") {
      return NextResponse.json({ error: result.note ?? "Conversations are unavailable." }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
