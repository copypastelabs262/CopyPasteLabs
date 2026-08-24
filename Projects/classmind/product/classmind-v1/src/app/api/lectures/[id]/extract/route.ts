import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { normalizeRawTranscript } from "@/lib/transcript/normalize";
import { getExtractionMethod } from "@/lib/extraction";
import { reconstructLecture, RECONSTRUCTION_METHOD, RECONSTRUCTION_VERSION } from "@/lib/reasoning/reconstruct";
import { storeKnowledge } from "@/lib/knowledge/store";
import { reasoningAvailable } from "@/lib/reasoning";
import type { CourseContextDocument } from "@/lib/extraction/types";

// The course_context.kind vocabulary is a faculty-facing one; extraction has its
// own, narrower one. Mapping here keeps the UI free to grow new kinds without
// forcing every extraction method to learn them.
const CONTEXT_KIND: Record<string, CourseContextDocument["kind"]> = {
  syllabus: "syllabus", policy: "policy", schedule: "notes", note: "notes",
};

// Runs the whole processing pipeline for one lecture:
//
//   Layer 1  candidate detection   (rules + teaching structure, offline)
//   Layer 2  contextual reconstruction (a model, over bounded windows)
//   Layer 3  knowledge storage
//
// Layer 1 output is kept as the immutable proposal record, but it is no longer
// the product's knowledge -- a sentence is not a fact. Layer 2 is what turns
// four sentences about a research paper into one assignment with three steps.
//
// Reconstruction calls a model several times over a long lecture, so this can
// take tens of seconds.
export const maxDuration = 300;

// Produces CANDIDATES from a transcribed lecture. Nothing here is visible to a
// student: every row lands in extraction_candidates and needs a human verdict
// before it can appear as course knowledge.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: lecture } = await svc
      .from("lectures")
      .select("id, course_id, status, raw_transcription_response")
      .eq("id", id)
      .maybeSingle();
    if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
    await requireCourseOwner(lecture.course_id as string, user.id);

    if (!lecture.raw_transcription_response) {
      return NextResponse.json({ error: "Lecture has no transcript yet." }, { status: 409 });
    }

    const transcript = normalizeRawTranscript(lecture.raw_transcription_response);
    if (!transcript) {
      return NextResponse.json(
        { error: "The transcript could not be normalized, so extraction cannot run." },
        { status: 409 },
      );
    }

    const methodId = new URL(request.url).searchParams.get("method") ?? undefined;
    const method = getExtractionMethod(methodId);

    // Re-running must not duplicate proposals. Candidates are immutable, so the
    // guard is "has this exact method+version already read this lecture" rather
    // than a delete-and-reinsert, which would destroy review history.
    const { data: existing } = await svc
      .from("extraction_candidates")
      .select("id")
      .eq("lecture_id", id)
      .eq("extraction_method", method.id)
      .eq("extraction_version", method.version)
      .limit(1);
    // Layer 1 is skipped when this exact method+version has already read the
    // lecture -- candidates are immutable and would only duplicate. Layer 2
    // still runs below, because re-processing exists precisely to apply a
    // better reasoning pass to signals that have not changed.
    const layerOneAlreadyRun = Boolean(existing?.length);

    // Course Context enters HERE and only here. The transcription path never
    // reads it, so context can sharpen interpretation without ever altering the
    // evidence it is interpreting.
    const { data: contextRows } = await svc
      .from("course_context")
      .select("kind, title, body")
      .eq("course_id", lecture.course_id as string);

    const courseContext: CourseContextDocument[] = (contextRows ?? []).map((r) => ({
      kind: CONTEXT_KIND[r.kind as string] ?? "notes",
      title: r.title as string,
      body: r.body as string,
    }));

    const candidates = method.extract({ segments: transcript.segments, courseContext });

    if (candidates.length && !layerOneAlreadyRun) {
      const { error } = await svc.from("extraction_candidates").insert(
        candidates.map((c) => ({
          lecture_id: id,
          course_id: lecture.course_id,
          kind: c.kind, title: c.title, detail: c.detail,
          due_phrase: c.duePhrase, due_resolved: c.dueResolved,
          evidence_start_ms: c.evidenceStartMs, evidence_end_ms: c.evidenceEndMs,
          evidence_char_start: c.evidenceCharStart, evidence_char_end: c.evidenceCharEnd,
          evidence_text: c.evidenceText,
          confidence: c.confidence, matched_cue: c.matchedCue,
          extraction_method: method.id, extraction_version: method.version,
        })),
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ---- Layer 2 + 3: reconstruct meaning, then store it -------------------
    //
    // Runs on every lecture automatically. Nothing here is specific to a
    // subject, a lecturer or a language: the same pass reads any transcript.
    let knowledge: Awaited<ReturnType<typeof storeKnowledge>> | null = null;
    let reconstruction: Awaited<ReturnType<typeof reconstructLecture>>["stats"] | null = null;
    let reasoningError: string | null = null;

    if (!reasoningAvailable()) {
      // Honest degradation. Candidates exist, knowledge does not, and the
      // response says which -- rather than letting sentence fragments pass for
      // understanding.
      reasoningError = "No reasoning model is configured, so no knowledge was reconstructed.";
    } else {
      try {
        const result = await reconstructLecture(transcript, candidates);
        reconstruction = result.stats;
        knowledge = await storeKnowledge(
          id, lecture.course_id as string, result.items, result.method, result.version,
        );
      } catch (err) {
        reasoningError = err instanceof Error ? err.message : String(err);
      }
    }

    // The lecture is now readable course material. Teaching knowledge is live;
    // anything actionable waits for a human.
    await svc.from("lectures").update({ status: "ready" }).eq("id", id);

    return NextResponse.json({
      lectureId: id,
      method: method.id, version: method.version,
      candidateCount: candidates.length,
      reconstruction: reconstruction
        ? { ...reconstruction, method: RECONSTRUCTION_METHOD, version: RECONSTRUCTION_VERSION }
        : null,
      knowledge,
      reasoningError,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
