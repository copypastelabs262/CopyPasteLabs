import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  AUDIO_BUCKET,
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMIT_BYTES,
  buildAudioObjectPath,
} from "@/lib/storage/runs-bucket";

interface CreateRunRequestBody {
  originalFilename: string;
  fileSizeBytes: number;
  contentType: string;
  checksumSha256: string;
}

function validate(body: Partial<CreateRunRequestBody>): string | null {
  if (!body.originalFilename) return "originalFilename is required.";
  if (
    !body.contentType ||
    !(ALLOWED_MIME_TYPES as readonly string[]).includes(body.contentType)
  ) {
    return `contentType must be one of: ${ALLOWED_MIME_TYPES.join(", ")}`;
  }
  if (!body.fileSizeBytes || body.fileSizeBytes <= 0) {
    return "fileSizeBytes must be a positive number.";
  }
  if (body.fileSizeBytes > FILE_SIZE_LIMIT_BYTES) {
    return `fileSizeBytes exceeds the ${FILE_SIZE_LIMIT_BYTES} byte limit.`;
  }
  if (!body.checksumSha256) return "checksumSha256 is required.";
  return null;
}

export async function POST(request: Request) {
  let body: Partial<CreateRunRequestBody>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  // validate() has narrowed body to CreateRunRequestBody past this point.
  const run = body as CreateRunRequestBody;

  const supabase = createServiceRoleClient();

  // The run's id is generated here, not left to the DB default, so the
  // storage path is known before the row is written -- one insert, not an
  // insert-then-update that could leave a row with no storage_path if the
  // process dies in between.
  const runId = randomUUID();
  const path = buildAudioObjectPath(runId, run.originalFilename);

  const { data: signed, error: signError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUploadUrl(path);

  if (signError || !signed) {
    return NextResponse.json(
      { error: signError?.message ?? "Could not create upload URL." },
      { status: 500 },
    );
  }

  const { error: insertError } = await supabase.from("runs").insert({
    id: runId,
    status: "pending_upload",
    original_filename: run.originalFilename,
    storage_path: path,
    file_size_bytes: run.fileSizeBytes,
    content_type: run.contentType,
    checksum_sha256: run.checksumSha256,
  });

  if (insertError) {
    // The signed URL now points at a row that doesn't exist. Harmless: it
    // expires in 2 hours and was never handed to a client.
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    runId,
    signedUrl: signed.signedUrl,
    token: signed.token,
    path,
  });
}
