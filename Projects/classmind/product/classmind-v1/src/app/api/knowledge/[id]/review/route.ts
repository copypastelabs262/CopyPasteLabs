import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";

// A verdict on one reconstructed knowledge item.
//
// This replaces per-sentence review. A lecturer confirms "find a current
// research paper, implement it, deploy it on the cloud" once -- not the four
// sentences it was assembled from, and not the thirty topics they also taught.
//
// Unlike a candidate verdict this UPDATES the row rather than inserting a
// separate record. A knowledge item is already a derived, replaceable artefact;
// the immutable record of what the machine originally proposed lives one layer
// down in extraction_candidates, which is never touched by a review.
const ACTIONS = ["confirm", "reject", "edit"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: item } = await svc
      .from("knowledge_items").select("id, course_id, category").eq("id", id).maybeSingle();
    if (!item) return NextResponse.json({ error: "Knowledge item not found." }, { status: 404 });
    await requireCourseOwner(item.course_id as string, user.id);

    const body = (await request.json()) as {
      action?: string; title?: string; summary?: string; steps?: string[]; note?: string;
    };
    if (!body.action || !ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: `action must be one of ${ACTIONS.join(", ")}` }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      status: body.action === "reject" ? "rejected" : "confirmed",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: body.note?.trim() || null,
    };
    if (body.action === "edit") {
      if (!body.title?.trim() || !body.summary?.trim()) {
        return NextResponse.json({ error: "An edit needs a title and a summary." }, { status: 400 });
      }
      patch.title = body.title.trim();
      patch.summary = body.summary.trim();
      if (Array.isArray(body.steps)) {
        patch.steps = body.steps.map((s) => String(s).trim()).filter(Boolean);
      }
    }

    const { data, error } = await svc
      .from("knowledge_items").update(patch).eq("id", id)
      .select("id, status, title").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
