import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { getTranscriptionProvider } from "@/lib/transcription";
import { buildProvenance } from "@/lib/provenance/build";

// One poll per call, not a loop: the row already carries provider_job_id, so
// polling resumes after a refresh or restart with no separate resume mechanism.
// POST, not GET, because it writes.
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: lecture } = await svc
      .from("lectures")
      .select("id, course_id, status, provider_job_id, language_code, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
    await requireCourseOwner(lecture.course_id as string, user.id);

    // Terminal already: report, don't re-poll. Keeps the endpoint idempotent.
    if (["transcribed", "ready", "failed", "quarantined"].includes(lecture.status as string)) {
      return NextResponse.json({ lectureId: id, status: lecture.status });
    }
    if (!lecture.provider_job_id) {
      return NextResponse.json({ error: "Lecture has no provider job; submit it first." }, { status: 409 });
    }

    const provider = getTranscriptionProvider();
    let polled;
    try {
      polled = await provider.poll(lecture.provider_job_id as string);
    } catch (err) {
      // A failed poll is a transport problem, not a failed lecture -- leave it
      // in `transcribing` so the next poll can still recover it.
      const message = err instanceof Error ? err.message : "Provider poll failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (polled.state === "in_progress") {
      await svc.from("lectures").update({ provider_status: polled.providerStatus }).eq("id", id);
      return NextResponse.json({ lectureId: id, status: "transcribing", providerStatus: polled.providerStatus });
    }

    if (polled.state === "failed") {
      await svc.from("lectures").update({
        status: "failed",
        provider_status: polled.providerStatus,
        error_message: polled.errorMessage ?? "Provider reported failure.",
        completed_at: new Date().toISOString(),
      }).eq("id", id);
      return NextResponse.json({ lectureId: id, status: "failed", error: polled.errorMessage });
    }

    let raw: unknown;
    try {
      raw = await provider.fetchRawResult(lecture.provider_job_id as string);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retrieving the transcript failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // Provenance is built and written in the same statement as the artefact it
    // describes. Constitution IV forbids retrofitting it, so there is
    // deliberately no path here that stores a transcript without one. The
    // descriptor is rebuilt from the language this lecture was actually
    // submitted with, not from the course's current setting.
    const { provenance, validation } = buildProvenance({
      // The record names the run and the provider call it came from, so a
      // transcript can be proved to belong to this lecture without trusting
      // the row it happens to be sitting in.
      lectureId: id,
      providerJobId: lecture.provider_job_id as string,
      descriptor: provider.describe((lecture.language_code as string | null) ?? undefined),
      providerCreatedAt: polled.providerCreatedAt,
      providerUpdatedAt: polled.providerUpdatedAt,
      runCreatedAt: lecture.created_at as string,
      rawResponse: raw,
    });

    // THE TRANSCRIPT IS VALIDATED HERE, AT THE MOMENT IT ARRIVES -- before
    // anything reads it and long before knowledge is derived from it. A
    // rejected transcript is still STORED, with its provenance and its
    // verdict: the raw artefact is what everything is re-derivable from and
    // deleting it would destroy the evidence that the engine misbehaved. What
    // changes is the status. A quarantined lecture never reaches extraction,
    // so no knowledge is ever built on it.
    //
    // This is the step that was missing when Sarvam returned romanized Arabic
    // for an English lecture on a live call: the transcript was stored as
    // "transcribed", extraction ran, and 21 candidates were produced from a
    // lecture nobody had given.
    const quarantined = validation.verdict === "reject";

    // raw_transcription_response is stored exactly as received. Normalization
    // happens at read time; this row is the artefact everything re-derives from.
    // Matched on provider_job_id as well as id. The job id was read off this
    // same row moments ago, so the extra predicate only fails if the row was
    // re-submitted concurrently -- in which case this response belongs to a
    // superseded job and must NOT overwrite the newer one. Cheap, and it makes
    // "a transcript is only ever attached to the run that generated it" a
    // property of the write rather than of the code path leading to it.
    const { data: updated, error: updateError } = await svc
      .from("lectures")
      .update({
        status: quarantined ? "quarantined" : "transcribed",
        provider_status: polled.providerStatus,
        raw_transcription_response: raw,
        provenance,
        transcript_validation: validation,
        error_message: quarantined ? validation.reason : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_job_id", lecture.provider_job_id as string)
      .select("id");
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if (!updated?.length) {
      return NextResponse.json(
        { error: "This lecture was re-submitted while its transcript was being retrieved; the stale result was discarded." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      lectureId: id,
      status: quarantined ? "quarantined" : "transcribed",
      validation: { verdict: validation.verdict, code: validation.code, reason: validation.reason },
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
