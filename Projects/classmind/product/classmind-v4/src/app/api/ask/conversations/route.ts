import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { listConversations } from "@/lib/knowledge/conversations";

// The caller's own GLOBAL conversations -- the home surface's threads, and
// only those. Lecture and subject threads live under their courses; scopes
// never bleed into each other's listings.
export async function GET() {
  try {
    const user = await requireUser();
    const listed = await listConversations(serviceClient(), user.id, { global: true });
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
