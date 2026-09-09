import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse, dbFailure } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";

const ACTIONS = ["confirm", "edit", "reject"];
// Includes the teaching and reference kinds: a faculty member editing a
// candidate may legitimately decide the machine filed a definition as a topic.
const KINDS = [
  "assignment", "deadline", "exam_scope", "announcement", "guidance",
  "lesson_scope", "topic", "definition", "enumeration", "comparison", "reference",
];

// Records a verdict on a candidate.
//
// This INSERTS; it never updates the candidate. Capture Contract Article 5: the
// machine's proposal and the human's ruling are two distinct immutable records,
// approval never overwrites the proposal, and rejections are retained rather
// than deleted -- the denials are the most informative examples the system
// produces and the only ones that can ever train it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: candidate } = await svc
      .from("extraction_candidates")
      .select("id, lecture_id, course_id, kind, title, detail, due_phrase, due_resolved")
      .eq("id", id)
      .maybeSingle();
    if (!candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

    // Only the course owner rules on their own lecture's candidates.
    // THE LEAF'S course_id IS NOT TRUSTED ON ITS OWN (2026-09-07, closure pass).
    //
    // Authorizing against a column carried on the row being written is only safe
    // while exactly one writer sets it, and sets it from the parent. That is true
    // today (extract writes lecture_id and course_id together from the lecture),
    // so this is not a live hole -- it is a hole one future writer away, and the
    // failure mode is the worst kind: the ownership check would be evaluated
    // against the ATTACKER's own course and pass.
    //
    // Resolved through the lecture instead, and the two must agree.
    const { data: parent } = await svc
      .from("lectures")
      .select("course_id")
      .eq("id", candidate.lecture_id as string)
      .maybeSingle();
    if (!parent || parent.course_id !== candidate.course_id) {
      return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
    }
    await requireCourseOwner(parent.course_id as string, user);

    const body = (await request.json()) as {
      action?: string; kind?: string; title?: string; detail?: string;
      duePhrase?: string | null; dueResolved?: string | null; note?: string;
    };
    if (!body.action || !ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: `action must be one of ${ACTIONS.join(", ")}` }, { status: 400 });
    }
    if (body.action === "edit") {
      if (!body.title?.trim() || !body.detail?.trim()) {
        return NextResponse.json({ error: "An edit needs a title and detail." }, { status: 400 });
      }
      if (body.kind && !KINDS.includes(body.kind)) {
        return NextResponse.json({ error: `kind must be one of ${KINDS.join(", ")}` }, { status: 400 });
      }
    }

    // On a plain confirm the proposal's own values are copied into the verdict.
    // Storing them rather than leaving nulls means a later change to the
    // candidate could never silently alter what was approved.
    const isEdit = body.action === "edit";
    const { data, error } = await svc.from("candidate_reviews").insert({
      candidate_id: id,
      actor_id: user.id,
      action: body.action,
      final_kind: body.action === "reject" ? null : (isEdit ? body.kind ?? candidate.kind : candidate.kind),
      final_title: body.action === "reject" ? null : (isEdit ? body.title!.trim() : candidate.title),
      final_detail: body.action === "reject" ? null : (isEdit ? body.detail!.trim() : candidate.detail),
      final_due_phrase: body.action === "reject" ? null : (isEdit ? (body.duePhrase ?? null) : candidate.due_phrase),
      final_due_resolved: body.action === "reject" ? null : (isEdit ? (body.dueResolved || null) : candidate.due_resolved),
      note: body.note?.trim() || null,
    }).select("id, action, created_at").single();

    if (error) throw dbFailure("candidates.review", error, "Could not record that verdict. Please try again.");
    return NextResponse.json({ review: data });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
