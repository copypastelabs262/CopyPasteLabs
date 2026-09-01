import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import {
  LECTURE_BUCKET, FILE_SIZE_LIMIT_BYTES, lectureObjectPath,
  isAllowedAudio, canonicalAudioContentType,
} from "@/lib/storage";
import {
  fixtureSlugExists, knownFixtureSlugs, rememberReplayRequest,
  replayIsAllowedHere, replayRefusalReason,
} from "@/lib/transcription";
import { isMissingSchemaError } from "@/lib/provenance/audio-identity";

// Creates the lecture row and returns a signed upload URL. The id is generated
// here so the storage path is known before the row is written -- one insert, no
// insert-then-update that could leave a row with no storage_path.
// Audio bytes go browser -> Storage directly and never touch this server.

// A SHA-256 digest and nothing else. Checked for shape as well as presence,
// because a malformed claim compared against a real digest would always
// mismatch and would quarantine a perfectly good upload.
const SHA256_HEX = /^[0-9a-f]{64}$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: courseId } = await params;
    const user = await requireUser();
    await requireCourseOwner(courseId, user.id);

    const body = (await request.json()) as {
      title?: string; originalFilename?: string; fileSizeBytes?: number;
      contentType?: string; checksumSha256?: string; recordedOn?: string;
      replayFixture?: string;
    };

    if (!body.originalFilename) return NextResponse.json({ error: "originalFilename is required." }, { status: 400 });
    // Any audio/* content type is accepted, and so is a recognised audio file
    // extension when the client could not name a type -- Windows reports many
    // real recordings as application/octet-stream or nothing at all. A file
    // that satisfies neither signal is refused here, before a row or a signed
    // URL exists for it.
    if (!isAllowedAudio(body.contentType ?? "", body.originalFilename)) {
      return NextResponse.json({
        error:
          "This does not look like an audio recording. Send an audio/* contentType, or a " +
          "filename with a recognised audio extension (mp3, m4a, mp4, wav, aac, aiff, ogg, " +
          "opus, flac, amr, wma, webm, 3gp).",
      }, { status: 400 });
    }
    if (!body.fileSizeBytes || body.fileSizeBytes <= 0) {
      return NextResponse.json({ error: "fileSizeBytes must be positive." }, { status: 400 });
    }
    if (body.fileSizeBytes > FILE_SIZE_LIMIT_BYTES) {
      return NextResponse.json({ error: `File exceeds the ${FILE_SIZE_LIMIT_BYTES} byte limit.` }, { status: 400 });
    }

    // NOW REQUIRED. It used to be optional, and the consequence was measurable:
    // 42 of the 50 rows that existed on 2026-08-30 carry no digest at all,
    // because only the browser path ever sent one. Those rows can never be
    // checked against the bytes that were actually transcribed, and they cannot
    // be repaired after the fact.
    //
    // Closing it at the source rather than tolerating it forever. Legacy nulls
    // stay null -- they are evidence, not a backlog -- but no new row may join
    // them. The browser already computes this; every script can.
    const claimed = body.checksumSha256?.trim().toLowerCase();
    if (!claimed) {
      return NextResponse.json({
        error:
          "checksumSha256 is required: send the SHA-256 of the file you are about to upload. " +
          "The server re-computes it over the bytes it hands the transcription engine and " +
          "refuses to transcribe audio that does not match, which is only possible if the " +
          "claim exists.",
      }, { status: 400 });
    }
    if (!SHA256_HEX.test(claimed)) {
      return NextResponse.json(
        { error: "checksumSha256 must be a 64-character lowercase hex SHA-256 digest." },
        { status: 400 },
      );
    }

    // Replay is per lecture, named explicitly, and refused on any deployment.
    //
    // A rejected REQUEST appears in the logs of the machine that refused it. An
    // ambient TRANSCRIPTION_PROVIDER=fixture, which is what this replaces, left
    // no trace at all -- it simply made every lecture a replay until somebody
    // noticed. That difference is the whole point of moving the switch here.
    const replayFixture = body.replayFixture?.trim();
    if (replayFixture) {
      if (!replayIsAllowedHere()) {
        return NextResponse.json({ error: replayRefusalReason() }, { status: 400 });
      }
      if (!fixtureSlugExists(replayFixture)) {
        return NextResponse.json({
          error:
            `Unknown replayFixture "${replayFixture}". Known fixtures: ` +
            `${knownFixtureSlugs().join(", ")}.`,
        }, { status: 400 });
      }
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

    const row = {
      id: lectureId,
      course_id: courseId,
      title: body.title?.trim() || body.originalFilename,
      status: "pending_upload",
      original_filename: body.originalFilename,
      storage_path: path,
      file_size_bytes: body.fileSizeBytes,
      content_type: body.contentType,
      checksum_sha256: claimed,
      recorded_on: body.recordedOn || null,
    };

    // `replay_fixture_slug` arrives in 20260830150000_audio_identity.sql, which
    // is written but not applied. Try the row that names it; fall back to the
    // row that does not, and remember the request in this process instead.
    //
    // The fallback is reported to the caller rather than hidden: a replay that
    // lives only in server memory does not survive a restart, and a caller that
    // is not told cannot protect itself against silently getting a live,
    // billable transcription instead.
    let replayPersistence: "row" | "process-memory" | null = replayFixture ? "row" : null;
    let insertError = replayFixture
      ? (await svc.from("lectures").insert({ ...row, replay_fixture_slug: replayFixture })).error
      : (await svc.from("lectures").insert(row)).error;

    if (insertError && replayFixture && isMissingSchemaError(insertError)) {
      insertError = (await svc.from("lectures").insert(row)).error;
      if (!insertError) {
        rememberReplayRequest(lectureId, replayFixture);
        replayPersistence = "process-memory";
      }
    }
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json({
      lectureId,
      signedUrl: signed.signedUrl,
      path,
      replayFixture: replayFixture ?? null,
      replayPersistence,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
