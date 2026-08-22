import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeRawTranscript } from "@/lib/runs/normalize";

// The one read route the UI needs. Deliberately narrow: one run by id, no
// list endpoint, no filtering, no pagination. Everything the page renders
// comes from here.
//
// The transcript is normalized on read from raw_transcription_response and is
// never written back -- poll/route.ts states that the raw response is the
// artefact everything else is re-derivable from, and this respects that.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { data: run, error } = await supabase
    .from("runs")
    .select(
      "id, status, original_filename, file_size_bytes, content_type, created_at, completed_at, error_message, provider_status, provenance, raw_transcription_response",
    )
    .eq("id", id)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const transcript = normalizeRawTranscript(run.raw_transcription_response);

  return NextResponse.json({
    runId: run.id,
    status: run.status,
    originalFilename: run.original_filename,
    fileSizeBytes: Number(run.file_size_bytes),
    contentType: run.content_type,
    createdAt: run.created_at,
    completedAt: run.completed_at,
    errorMessage: run.error_message,
    providerStatus: run.provider_status,
    provenance: run.provenance,
    transcript,
    // Surfaced only when normalization failed, so an unrecognised provider
    // shape is visible rather than silently rendering an empty transcript.
    rawTranscriptionResponse:
      transcript === null ? run.raw_transcription_response : null,
  });
}
