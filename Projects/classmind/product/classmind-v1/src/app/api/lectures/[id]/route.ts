import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, requireCourseOwner, errorResponse } from "@/lib/auth";
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
    let supersededCount = 0;
    if (isOwner) {
      const all = (await svc
        .from("extraction_candidates")
        .select("id, kind, title, detail, due_phrase, due_resolved, evidence_start_ms, evidence_end_ms, evidence_char_start, evidence_char_end, evidence_text, confidence, matched_cue, extraction_method, extraction_version, created_at")
        .eq("lecture_id", id)
        .order("evidence_start_ms", { ascending: true })).data ?? [];

      // Only the MOST RECENT extraction run reaches the review queue.
      //
      // Candidates are immutable and a re-run inserts alongside the old rows
      // rather than replacing them -- deliberately, because comparing methods on
      // identical input is the whole reason the method is pluggable. The cost is
      // that a reviewer would see the same sentence once per run, which is the
      // fastest way to make a review queue stop being read.
      //
      // Keyed on method AND version, and chosen by recency rather than by
      // version order, because switching methods is now a real event: the
      // actionable-only `rules` method produced one candidate for a lecture that
      // the composite `lecture` method reads as thirty. Highest-version-per-
      // method would have shown both sets at once.
      //
      // Nothing is deleted: this is a read filter, the count it held back is
      // reported, and knowledge.ts still honours a verdict already given on a
      // now-superseded candidate.
      let newestRun: { key: string; at: number } | null = null;
      for (const c of all) {
        const key = `${c.extraction_method}@${c.extraction_version}`;
        const at = Date.parse(c.created_at as string);
        if (!newestRun || at > newestRun.at) newestRun = { key, at };
      }
      candidates = all.filter(
        (c) => `${c.extraction_method}@${c.extraction_version}` === newestRun?.key,
      );
      supersededCount = all.length - candidates.length;

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
      // Non-zero means an older extraction version produced rows that are not
      // being shown. Surfaced rather than silently dropped.
      supersededCount,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// Delete a lecture, its audio, and everything derived from it.
//
// Necessary well before launch: the wrong file, the wrong lecture, a duplicate,
// or a private recording uploaded by accident are all one misclick away, and
// until now there was no way to undo any of them.
//
// Order matters. The storage object goes first and the row second, because
// removing an object is idempotent -- a retry after a half-failure succeeds --
// whereas deleting the row first would strand the audio with nothing pointing
// at it and no way to find it again.
//
// Derived data needs no explicit handling: extraction_candidates cascades from
// lectures, and candidate_reviews cascades from candidates. Deleting them here
// as well would be a second, weaker copy of a rule the schema already enforces.
export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: lecture } = await svc
      .from("lectures")
      .select("id, course_id, title, storage_path")
      .eq("id", id)
      .maybeSingle();
    if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });

    // Owner only, and scoped to THIS lecture's course. Deletion is the one
    // action where getting the authorization check wrong destroys data rather
    // than leaking it.
    await requireCourseOwner(lecture.course_id as string, user.id);

    const { data: candidates } = await svc
      .from("extraction_candidates").select("id").eq("lecture_id", id);
    const candidateCount = (candidates ?? []).length;

    const { error: storageError } = await svc.storage
      .from(LECTURE_BUCKET)
      .remove([lecture.storage_path as string]);
    if (storageError) {
      return NextResponse.json(
        { error: `Could not delete the audio, so nothing was deleted: ${storageError.message}` },
        { status: 502 },
      );
    }

    const { error: rowError } = await svc.from("lectures").delete().eq("id", id);
    if (rowError) {
      return NextResponse.json(
        {
          error:
            `The audio was deleted but the lecture record was not: ${rowError.message}. ` +
            "Deleting the lecture again will finish the job.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      deleted: {
        lectureId: id,
        title: lecture.title,
        storagePath: lecture.storage_path,
        candidatesRemoved: candidateCount,
      },
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
