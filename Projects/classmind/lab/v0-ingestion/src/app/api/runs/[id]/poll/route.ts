import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTranscriptionProvider } from "@/lib/transcription";
import { buildProvenance } from "@/lib/provenance/build";

// Polls the provider once and advances the run if the job reached a terminal
// state. Deliberately one poll per call, not a loop: the row already carries
// provider_job_id, so polling resumes after a refresh or restart with no
// separate resume mechanism. POST, not GET, because it writes.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { data: run, error } = await supabase
    .from("runs")
    .select("id, status, provider_job_id, provider_status, created_at")
    .eq("id", id)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  // Terminal already: report, don't re-poll. Makes the endpoint idempotent.
  if (run.status === "completed" || run.status === "failed") {
    return NextResponse.json({ runId: id, status: run.status });
  }

  if (!run.provider_job_id) {
    return NextResponse.json(
      { error: "Run has no provider job; submit it first." },
      { status: 409 },
    );
  }

  const provider = getTranscriptionProvider();

  let polled;
  try {
    polled = await provider.poll(run.provider_job_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provider poll failed.";
    // A failed poll is a transport problem, not a failed run -- leave the
    // run in `transcribing` so the next poll can still recover it.
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (polled.state === "in_progress") {
    await supabase
      .from("runs")
      .update({ provider_status: polled.providerStatus })
      .eq("id", id);
    return NextResponse.json({
      runId: id,
      status: "transcribing",
      providerStatus: polled.providerStatus,
    });
  }

  if (polled.state === "failed") {
    await supabase
      .from("runs")
      .update({
        status: "failed",
        provider_status: polled.providerStatus,
        error_message: polled.errorMessage ?? "Provider reported failure.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({
      runId: id,
      status: "failed",
      error: polled.errorMessage,
    });
  }

  let raw: unknown;
  try {
    raw = await provider.fetchRawResult(run.provider_job_id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Retrieving the transcript failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Provenance is built and written in the same statement as the artefact it
  // describes. Constitution IV forbids retrofitting it afterwards, so there is
  // deliberately no path here that stores a transcript without one.
  const provenance = buildProvenance({
    descriptor: provider.descriptor,
    providerCreatedAt: polled.providerCreatedAt,
    providerUpdatedAt: polled.providerUpdatedAt,
    runCreatedAt: run.created_at,
    rawResponse: raw,
  });

  // raw_transcription_response is stored exactly as received. Normalization
  // into transcript_normalized is a later step and must not happen here --
  // the raw response is the artefact everything else is re-derivable from.
  const { error: updateError } = await supabase
    .from("runs")
    .update({
      status: "completed",
      provider_status: polled.providerStatus,
      raw_transcription_response: raw,
      provenance,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ runId: id, status: "completed" });
}
