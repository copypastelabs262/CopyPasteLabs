import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { AUDIO_BUCKET } from "@/lib/storage/runs-bucket";
import { getTranscriptionProvider } from "@/lib/transcription";

// Submits an already-uploaded audio object to the transcription provider and
// records the provider's job id. Audio bytes stream server-side from Storage
// to the provider; they never pass through a browser again.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { data: run, error } = await supabase
    .from("runs")
    .select("id, status, storage_path, original_filename, content_type")
    .eq("id", id)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  if (run.status !== "pending_upload" && run.status !== "uploaded") {
    return NextResponse.json(
      { error: "Run is " + run.status + "; nothing to submit." },
      { status: 409 },
    );
  }

  // The object's presence in Storage is the proof of upload. There is no
  // separate "mark uploaded" call to go missing or arrive out of order.
  const { data: file, error: downloadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .download(run.storage_path);

  if (downloadError || !file) {
    return NextResponse.json(
      { error: "Audio is not in storage yet; upload it before transcribing." },
      { status: 409 },
    );
  }

  const provider = getTranscriptionProvider();

  let submitted;
  try {
    submitted = await provider.submit({
      bytes: await file.arrayBuffer(),
      filename: run.original_filename,
      contentType: run.content_type,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Provider submission failed.";
    await supabase
      .from("runs")
      .update({ status: "failed", error_message: message })
      .eq("id", id);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // provider_job_id lands in the same write that moves the run to
  // `transcribing`, so a crash can never leave an in-flight job unpollable.
  const { error: updateError } = await supabase
    .from("runs")
    .update({
      status: "transcribing",
      provider_job_id: submitted.providerJobId,
      provider_status: submitted.providerStatus,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    runId: id,
    status: "transcribing",
    providerJobId: submitted.providerJobId,
    providerStatus: submitted.providerStatus,
  });
}
