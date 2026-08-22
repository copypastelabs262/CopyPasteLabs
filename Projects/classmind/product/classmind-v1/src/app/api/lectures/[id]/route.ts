import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { normalizeRawTranscript } from "@/lib/transcript/normalize";
import { LECTURE_BUCKET } from "@/lib/storage";

// One lecture, role-aware.
//
// Owner: transcript plus every candidate and its review history.
// Enrolled student: transcript only, and only once the lecture is `ready` --
// candidates never appear in this payload for a non-owner, which is why an
// unconfirmed item cannot reach a student even by guessing a URL.
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: lecture } = await svc
      .from("lectures")
      .select("id, course_id, title, status, provider_status, original_filename, file_size_bytes, content_type, language_code, provenance, raw_transcription_response, error_message, created_at, completed_at, recorded_on, storage_path")
      .eq("id", id)
      .maybeSingle();
    if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });

    const { isOwner } = await requireCourseAccess(lecture.course_id as string, user.id);
    if (!isOwner && lecture.status !== "ready") {
      return NextResponse.json({ error: "This lecture is not published yet." }, { status: 403 });
    }

    const transcript = normalizeRawTranscript(lecture.raw_transcription_response);

    // A short-lived signed URL so evidence can be heard, not just read. Article 7
    // makes time in the audio the durable anchor; this is what makes that anchor
    // clickable.
    let audioUrl: string | null = null;
    const { data: signed } = await svc.storage
      .from(LECTURE_BUCKET)
      .createSignedUrl(lecture.storage_path as string, 3600);
    if (signed?.signedUrl) audioUrl = signed.signedUrl;

    let candidates: unknown[] = [];
    let reviews: unknown[] = [];
    if (isOwner) {
      candidates = (await svc
        .from("extraction_candidates")
        .select("id, kind, title, detail, due_phrase, due_resolved, evidence_start_ms, evidence_end_ms, evidence_char_start, evidence_char_end, evidence_text, confidence, matched_cue, extraction_method, extraction_version, created_at")
        .eq("lecture_id", id)
        .order("evidence_start_ms", { ascending: true })).data ?? [];

      const ids = (candidates as { id: string }[]).map((c) => c.id);
      reviews = ids.length
        ? (await svc
            .from("candidate_reviews")
            .select("id, candidate_id, action, final_kind, final_title, final_detail, final_due_phrase, note, created_at")
            .in("candidate_id", ids)
            .order("created_at", { ascending: false })).data ?? []
        : [];
    }

    return NextResponse.json({
      lecture: {
        id: lecture.id, courseId: lecture.course_id, title: lecture.title,
        status: lecture.status, providerStatus: lecture.provider_status,
        originalFilename: lecture.original_filename,
        fileSizeBytes: Number(lecture.file_size_bytes),
        languageCode: lecture.language_code, provenance: lecture.provenance,
        errorMessage: lecture.error_message, createdAt: lecture.created_at,
        completedAt: lecture.completed_at, recordedOn: lecture.recorded_on,
      },
      isOwner, audioUrl, transcript,
      // Surfaced only when normalization failed, so an unrecognised provider
      // shape is visible rather than rendering as an empty transcript.
      rawTranscriptionResponse:
        transcript === null ? lecture.raw_transcription_response : null,
      candidates, reviews,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
