import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse, dbFailure } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";

const KINDS = ["syllabus", "policy", "schedule", "note"];

// Course Context is faculty-authored and influences EXTRACTION only. Nothing in
// the transcription path reads it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await requireCourseOwner(id, user);

    const body = (await request.json()) as { kind?: string; title?: string; body?: string };
    if (!body.kind || !KINDS.includes(body.kind)) {
      return NextResponse.json({ error: `kind must be one of ${KINDS.join(", ")}` }, { status: 400 });
    }
    if (!body.title?.trim() || !body.body?.trim()) {
      return NextResponse.json({ error: "Title and body are required." }, { status: 400 });
    }

    const svc = serviceClient();
    const { data, error } = await svc
      .from("course_context")
      .insert({ course_id: id, kind: body.kind, title: body.title.trim(), body: body.body.trim() })
      .select("id, kind, title, body, created_at")
      .single();
    if (error) throw dbFailure("course.context", error, "Could not save that context document. Please try again.");
    return NextResponse.json({ context: data });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
