import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { LECTURE_BUCKET } from "@/lib/storage";
import { getTranscriptionProvider } from "@/lib/transcription";

// Streams the stored audio to the provider and records the job id. The audio
// never passes through a browser again.
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: lecture } = await svc
      .from("lectures")
      .select("id, course_id, status, storage_path, original_filename, content_type")
      .eq("id", id)
      .maybeSingle();
    if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });

    const course = await requireCourseOwner(lecture.course_id as string, user.id);

    if (lecture.status !== "pending_upload" && lecture.status !== "uploaded") {
      return NextResponse.json({ error: `Lecture is ${lecture.status}; nothing to submit.` }, { status: 409 });
    }

    // The object's presence in Storage is the proof of upload. There is no
    // separate "mark uploaded" call to go missing or arrive out of order.
    const { data: file, error: downloadError } = await svc.storage
      .from(LECTURE_BUCKET)
      .download(lecture.storage_path as string);
    if (downloadError || !file) {
      return NextResponse.json({ error: "Audio is not in storage yet; upload it before transcribing." }, { status: 409 });
    }

    const provider = getTranscriptionProvider();
    let submitted;
    try {
      submitted = await provider.submit(
        {
          bytes: await file.arrayBuffer(),
          filename: lecture.original_filename as string,
          contentType: lecture.content_type as string,
        },
        // The course knows what language it is taught in. That beats the
        // engine's guess -- Lab v0 proved auto-detect can romanize an English
        // lecture into Arabic when its confidence is low.
        course.transcription_language as string,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Provider submission failed.";
      await svc.from("lectures").update({ status: "failed", error_message: message }).eq("id", id);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // provider_job_id lands in the same write that moves the lecture to
    // `transcribing`, so a crash can never leave an in-flight job unpollable.
    const { error: updateError } = await svc
      .from("lectures")
      .update({
        status: "transcribing",
        provider_job_id: submitted.providerJobId,
        provider_status: submitted.providerStatus,
        language_code: submitted.languageCode,
      })
      .eq("id", id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({
      lectureId: id, status: "transcribing",
      providerStatus: submitted.providerStatus, languageCode: submitted.languageCode,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
