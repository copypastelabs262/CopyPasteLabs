import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse, dbFailure } from "@/lib/auth";
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

// Field ceilings for a reviewer's edit. Generous: a knowledge title is a
// phrase and a summary is a sentence or two. See the note at the edit branch
// below for why an unbounded field here is a COST problem, not a storage one.
const MAX_TITLE = 300;
const MAX_SUMMARY = 4_000;
const MAX_STEPS = 30;
const MAX_STEP_CHARS = 1_000;
const MAX_NOTE = 2_000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: item } = await svc
      .from("knowledge_items").select("id, course_id, category").eq("id", id).maybeSingle();
    if (!item) return NextResponse.json({ error: "Knowledge item not found." }, { status: 404 });
    await requireCourseOwner(item.course_id as string, user);

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
      review_note: body.note?.trim().slice(0, MAX_NOTE) || null,
    };
    if (body.action === "edit") {
      if (!body.title?.trim() || !body.summary?.trim()) {
        return NextResponse.json({ error: "An edit needs a title and a summary." }, { status: 400 });
      }
      // BOUNDED (2026-09-07, security audit). These columns are `text` and
      // `jsonb` with no length constraint behind them, and this route stored
      // whatever arrived after a .trim(). Every stored field is later
      // interpolated into the Ask prompt by answer.ts render(), which bounds the
      // NUMBER of units (8) and quotes (2) but not their SIZE -- so one course
      // owner could make every subsequent question asked in their course carry a
      // multi-megabyte prompt and bill the operator for it. The reviewer is
      // faculty, but the budget they spend is shared.
      //
      // The caps sit far above any real edit: these are one-or-two-sentence
      // fields by design. Refused rather than truncated -- silently storing
      // something other than what a lecturer typed is worse than saying no.
      const tooLong =
        body.title.trim().length > MAX_TITLE ||
        body.summary.trim().length > MAX_SUMMARY ||
        (Array.isArray(body.steps) &&
          (body.steps.length > MAX_STEPS ||
            body.steps.some((x) => String(x).length > MAX_STEP_CHARS)));
      if (tooLong) {
        return NextResponse.json(
          {
            error:
              `That edit is too long. Limits: title ${MAX_TITLE} characters, summary ` +
              `${MAX_SUMMARY}, at most ${MAX_STEPS} steps of ${MAX_STEP_CHARS} characters each.`,
          },
          { status: 400 },
        );
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
    if (error) throw dbFailure("knowledge.review", error, "Could not record that verdict. Please try again.");
    return NextResponse.json({ item: data });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
