import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import {
  LECTURE_BUCKET, ALLOWED_MIME_TYPES, FILE_SIZE_LIMIT_BYTES, lectureObjectPath,
} from "@/lib/storage";

// Creates the lecture row and returns a signed upload URL. The id is generated
// here so the storage path is known before the row is written -- one insert, no
// insert-then-update that could leave a row with no storage_path.
// Audio bytes go browser -> Storage directly and never touch this server.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: courseId } = await params;
    const user = await requireUser();
    await requireCourseOwner(courseId, user.id);

    const body = (await request.json()) as {
      title?: string; originalFilename?: string; fileSizeBytes?: number;
      contentType?: string; checksumSha256?: string; recordedOn?: string;
    };

    if (!body.originalFilename) return NextResponse.json({ error: "originalFilename is required." }, { status: 400 });
    if (!body.contentType || !(ALLOWED_MIME_TYPES as readonly string[]).includes(body.contentType)) {
      return NextResponse.json({ error: `contentType must be one of: ${ALLOWED_MIME_TYPES.join(", ")}` }, { status: 400 });
    }
    if (!body.fileSizeBytes || body.fileSizeBytes <= 0) {
      return NextResponse.json({ error: "fileSizeBytes must be positive." }, { status: 400 });
    }
    if (body.fileSizeBytes > FILE_SIZE_LIMIT_BYTES) {
      return NextResponse.json({ error: `File exceeds the ${FILE_SIZE_LIMIT_BYTES} byte limit.` }, { status: 400 });
    }

    const lectureId = randomUUID();
    const path = lectureObjectPath(lectureId, body.originalFilename);
    const svc = serviceClient();

    const { data: signed, error: signError } = await svc.storage
      .from(LECTURE_BUCKET)
      .createSignedUploadUrl(path);
    if (signError || !signed) {
      return NextResponse.json({ error: signError?.message ?? "Could not create upload URL." }, { status: 500 });
    }

    const { error: insertError } = await svc.from("lectures").insert({
      id: lectureId,
      course_id: courseId,
      title: body.title?.trim() || body.originalFilename,
      status: "pending_upload",
      original_filename: body.originalFilename,
      storage_path: path,
      file_size_bytes: body.fileSizeBytes,
      content_type: body.contentType,
      checksum_sha256: body.checksumSha256 ?? null,
      recorded_on: body.recordedOn || null,
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json({ lectureId, signedUrl: signed.signedUrl, path });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
