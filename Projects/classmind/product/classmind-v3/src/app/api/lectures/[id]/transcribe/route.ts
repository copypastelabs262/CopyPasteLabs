import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { LECTURE_BUCKET } from "@/lib/storage";
import {
  getTranscriptionProvider, liveCallIsAllowedHere, liveCallRefusalReason,
  recallReplayRequest,
} from "@/lib/transcription";
import {
  evaluateSubmission, identitySchema, isMissingSchemaError,
  noteIdentityColumns, type AudioIdentity,
} from "@/lib/provenance/audio-identity";

// Streams the stored audio to the provider and records the job id. The audio
// never passes through a browser again.

// The heaviest route in the app by a wide margin: it pulls the whole object out
// of Supabase Storage and pushes it to the provider, so a 50 MB lecture is two
// large transfers inside one request. Everything else finishes in milliseconds
// and keeps the platform default.
//
// 60s is the ceiling on Vercel's Hobby plan and is accepted on every plan, so
// this value deploys anywhere. On Pro it can go to 300 -- raise it here, not in
// vercel.json, if a real lecture ever times out. If it does time out the lecture
// is recoverable rather than lost: it stays `pending_upload` with the audio
// already in storage, so submitting again re-runs only the transfer.
//
// The SHA-256 added below is measured, not assumed: `hashMs` is returned in the
// response so a real 50 MB lecture can be checked against this budget rather
// than argued about. Node's crypto hashes at hundreds of MB/s, so it is
// expected to be a rounding error next to the two transfers -- but "expected"
// is why the number is reported.
export const maxDuration = 60;

const BASE_COLUMNS =
  "id, course_id, status, storage_path, original_filename, content_type, checksum_sha256, file_size_bytes";
const IDENTITY_COLUMNS = `${BASE_COLUMNS}, replay_fixture_slug`;

interface LectureRow {
  id: string;
  course_id: string;
  status: string;
  storage_path: string;
  original_filename: string;
  content_type: string;
  checksum_sha256: string | null;
  file_size_bytes: number | null;
  replay_fixture_slug?: string | null;
}

// The identity columns arrive in 20260830150000_audio_identity.sql, which is
// written but not applied. Ask for them; if they are not there, fall back and
// remember, so this costs one extra round trip per process rather than one per
// request.
async function loadLecture(
  svc: ReturnType<typeof serviceClient>,
  id: string,
): Promise<{ lecture: LectureRow | null; columns: boolean }> {
  if (identitySchema().columns !== false) {
    const { data, error } = await svc
      .from("lectures").select(IDENTITY_COLUMNS).eq("id", id).maybeSingle();
    if (!error) {
      noteIdentityColumns(true);
      return { lecture: (data as LectureRow | null) ?? null, columns: true };
    }
    if (!isMissingSchemaError(error)) throw new Error(error.message);
    noteIdentityColumns(false);
  }
  const { data, error } = await svc
    .from("lectures").select(BASE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return { lecture: (data as LectureRow | null) ?? null, columns: false };
}

// The extension comes from the storage path this server generated, never from
// the name the uploader typed. `lectureObjectPath` writes `<id>/original.<ext>`.
function extensionOf(storagePath: string): string {
  const dot = storagePath.lastIndexOf(".");
  return dot === -1 ? "bin" : storagePath.slice(dot + 1);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    // Optional, and it can only ever cause a REFUSAL -- never a replay. See the
    // registry note in @/lib/transcription: while `replay_fixture_slug` has
    // nowhere to live on the row, a server restart would drop a remembered
    // replay request and this route would fall through to a live, billable
    // transcription of audio the caller never intended to spend money on.
    // Callers that asked for a replay say so again here so that loss aborts.
    let expectReplay = false;
    try {
      const body = (await request.json()) as { expectReplay?: boolean } | null;
      expectReplay = body?.expectReplay === true;
    } catch {
      // No body is the normal case: the browser posts nothing.
    }

    const { lecture, columns } = await loadLecture(svc, id);
    if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });

    const course = await requireCourseOwner(lecture.course_id, user.id);

    if (lecture.status !== "pending_upload" && lecture.status !== "uploaded") {
      return NextResponse.json({ error: `Lecture is ${lecture.status}; nothing to submit.` }, { status: 409 });
    }

    const replaySlug = lecture.replay_fixture_slug ?? recallReplayRequest(id);
    if (expectReplay && !replaySlug) {
      return NextResponse.json({
        error:
          "This lecture was created as a fixture replay, but this server no longer holds that " +
          "request -- the column that would persist it does not exist yet and the process has " +
          "restarted. Refusing to fall back to a live transcription. Create the lecture again, " +
          "or apply supabase/migrations/20260830150000_audio_identity.sql.",
      }, { status: 409 });
    }

    // Refused BEFORE the 50 MB download, not after: a call that is going to be
    // refused should cost nothing at all. On a developer machine a lecture that
    // named no fixture is almost certainly an unmigrated caller, and
    // transcribing it for real would bill somebody for a mistake. Opt in with
    // ALLOW_LIVE_SARVAM=1; that variable cannot enable replay anywhere, and
    // this guard does not apply on a deployment, where a live call is the
    // product rather than an accident.
    if (!replaySlug && !liveCallIsAllowedHere()) {
      return NextResponse.json({ error: liveCallRefusalReason() }, { status: 400 });
    }

    // The object's presence in Storage is the proof of upload. There is no
    // separate "mark uploaded" call to go missing or arrive out of order.
    const { data: file, error: downloadError } = await svc.storage
      .from(LECTURE_BUCKET)
      .download(lecture.storage_path);
    if (downloadError || !file) {
      return NextResponse.json({ error: "Audio is not in storage yet; upload it before transcribing." }, { status: 409 });
    }

    const bytes = await file.arrayBuffer();

    // THE SERVER'S OWN OBSERVATION, over the exact buffer that is handed to
    // provider.submit() three lines below. Not a re-read, not a second
    // download, not the client's word for it. Everything downstream that says
    // "these are the bytes that were transcribed" rests on this one statement
    // being about the same object as the submit call.
    const hashStartedAt = Date.now();
    const submittedSha256 = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    const hashMs = Date.now() - hashStartedAt;

    const identity: AudioIdentity = evaluateSubmission({
      claimedSha256: lecture.checksum_sha256,
      submittedSha256,
      declaredBytes: lecture.file_size_bytes,
      observedBytes: bytes.byteLength,
      replayFixtureSlug: replaySlug,
      storageAvailable: columns,
    });

    // CHECKED BEFORE THE PROVIDER IS CALLED, deliberately. There is no point
    // paying to transcribe audio we cannot vouch for, and there is no
    // transcript yet, so there is nothing to quarantine: `quarantined` means "a
    // transcript exists and is kept as evidence". Calling this state
    // quarantined would be a lie. The remedy is a re-upload.
    if (identity.verdict === "reject") {
      await writeLecture(svc, id, {
        base: { status: "failed", error_message: identity.reason },
        identityFields: { audio_identity: identity, submitted_audio_sha256: submittedSha256 },
      });
      return NextResponse.json({
        error: identity.reason,
        lectureId: id,
        status: "failed",
        audioIdentity: publicIdentity(identity),
      }, { status: 409 });
    }

    let provider;
    try {
      provider = getTranscriptionProvider({ replay_fixture_slug: replaySlug });
    } catch (err) {
      // Replay refused here (a deployment, or a production build). A refusal,
      // not a fallback: quietly transcribing for real would spend money the
      // caller did not ask to spend.
      const message = err instanceof Error ? err.message : "Provider selection failed.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    let submitted;
    try {
      submitted = await provider.submit(
        {
          bytes,
          // OUR identifier, not the uploader's filename. See AudioToTranscribe.
          lectureId: id,
          fileExtension: extensionOf(lecture.storage_path),
          contentType: lecture.content_type,
        },
        // The course knows what language it is taught in. That beats the
        // engine's guess -- Lab v0 proved auto-detect can romanize an English
        // lecture into Arabic when its confidence is low.
        course.transcription_language as string,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Provider submission failed.";
      await writeLecture(svc, id, {
        base: { status: "failed", error_message: message },
        identityFields: { audio_identity: identity, submitted_audio_sha256: submittedSha256 },
      });
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // provider_job_id lands in the same write that moves the lecture to
    // `transcribing` AND in the same write as the digest of the bytes that job
    // was given. A row can never name a job without naming its audio.
    //
    // The status is a PREDICATE of this update, not a check made before it.
    // Previously the route read the status, decided, then wrote: two concurrent
    // submits both passed the read and the second overwrote the first's job id,
    // orphaning a live provider job whose result nothing would ever collect.
    // The poll route already guards its write with `.eq("provider_job_id")`;
    // this is the same trick on the other end.
    const submittedAt = new Date().toISOString();
    const claim = await writeLecture(svc, id, {
      base: {
        status: "transcribing",
        provider_job_id: submitted.providerJobId,
        provider_status: submitted.providerStatus,
        language_code: submitted.languageCode,
      },
      identityFields: {
        submitted_audio_sha256: submittedSha256,
        submitted_at: submittedAt,
        audio_identity: identity,
      },
      statusPredicate: ["pending_upload", "uploaded"],
    });

    if (claim.error) return NextResponse.json({ error: claim.error }, { status: 500 });
    if (claim.rows === 0) {
      return NextResponse.json({
        error:
          "This lecture was submitted concurrently and is no longer awaiting submission; this " +
          "submission was discarded rather than allowed to overwrite the live job.",
      }, { status: 409 });
    }

    return NextResponse.json({
      lectureId: id, status: "transcribing",
      providerStatus: submitted.providerStatus, languageCode: submitted.languageCode,
      replayFixture: replaySlug ?? null,
      audioIdentity: publicIdentity(identity),
      identityStored: claim.identityStored,
      hashMs,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// What a caller is told about the verdict. The metrics stay on the row: they
// name other lectures, and a lecture's owner has no business being handed the
// id of somebody else's.
function publicIdentity(identity: AudioIdentity) {
  return { verdict: identity.verdict, code: identity.code, reason: identity.reason };
}

// One writer, so the fallback for the unapplied migration exists once instead
// of at four call sites. Writes the identity columns when they exist; when they
// do not, writes everything else and says so, rather than failing the upload or
// pretending the check was stored.
async function writeLecture(
  svc: ReturnType<typeof serviceClient>,
  id: string,
  spec: {
    base: Record<string, unknown>;
    identityFields: Record<string, unknown>;
    statusPredicate?: string[];
  },
): Promise<{ rows: number; error: string | null; identityStored: boolean }> {
  const run = async (payload: Record<string, unknown>) => {
    let query = svc.from("lectures").update(payload).eq("id", id);
    if (spec.statusPredicate) query = query.in("status", spec.statusPredicate);
    return query.select("id");
  };

  if (identitySchema().columns !== false) {
    const { data, error } = await run({ ...spec.base, ...spec.identityFields });
    if (!error) {
      noteIdentityColumns(true);
      return { rows: data?.length ?? 0, error: null, identityStored: true };
    }
    if (!isMissingSchemaError(error)) {
      return { rows: 0, error: error.message, identityStored: false };
    }
    noteIdentityColumns(false);
  }

  const { data, error } = await run(spec.base);
  return {
    rows: data?.length ?? 0,
    error: error ? error.message : null,
    identityStored: false,
  };
}
