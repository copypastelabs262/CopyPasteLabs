import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import {
  getTranscriptionProvider, recallReplayRequest, replaySlugOfJobId,
} from "@/lib/transcription";
import { buildProvenance } from "@/lib/provenance/build";
import {
  evaluateResult, identitySchema, isMissingSchemaError, noteIdentityColumns,
  noteIdentityLedger, type AudioIdentity,
} from "@/lib/provenance/audio-identity";

// One poll per call, not a loop: the row already carries provider_job_id, so
// polling resumes after a refresh or restart with no separate resume mechanism.
// POST, not GET, because it writes.

const BASE_COLUMNS =
  "id, course_id, status, provider_job_id, language_code, created_at, checksum_sha256, file_size_bytes";
const IDENTITY_COLUMNS =
  `${BASE_COLUMNS}, submitted_audio_sha256, submitted_at, replay_fixture_slug, audio_identity`;

interface LectureRow {
  id: string;
  course_id: string;
  status: string;
  provider_job_id: string | null;
  language_code: string | null;
  created_at: string;
  checksum_sha256: string | null;
  file_size_bytes: number | null;
  submitted_audio_sha256?: string | null;
  submitted_at?: string | null;
  replay_fixture_slug?: string | null;
  audio_identity?: AudioIdentity | null;
}

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

interface LedgerAnswer {
  available: boolean;
  boundToLectureId: string | null;
  boundSubmittedSha256: string | null;
}

// THE UNIQUENESS INVARIANT, enforced by a primary key rather than by this code.
//
// `provider_audio_id -> submitted_audio_sha256` is a functional dependency, and
// Postgres cannot express one across rows of `lectures`. It expresses it
// exactly as a primary key on a separate ledger -- and that ledger starts
// empty, so the sixteen historical rows that already share one identity cannot
// make it fail to apply, and not one of them has to be touched to create it.
//
// INSERT ... ON CONFLICT DO NOTHING RETURNING. An empty RETURNING means the
// identity was already bound; we then read the binding and compare digests. The
// key does the work atomically: a read-then-write check here could never
// survive two concurrent polls, which is the same class of bug the transcribe
// route's status predicate closes.
//
// ORDERING, and the orphan case. This runs BEFORE the lecture update. If that
// update then fails, the ledger holds a binding for a lecture with no stored
// transcript. Harmless and self-healing: the next poll of the same lecture
// presents the same identity with the same digest, matches, and proceeds. An
// orphan can only ever cause a false PASS, never a false quarantine.
async function bindAudioIdentity(
  svc: ReturnType<typeof serviceClient>,
  providerAudioId: string,
  submittedSha256: string,
  lectureId: string,
): Promise<LedgerAnswer> {
  const inserted = await svc
    .from("provider_audio_identities")
    .upsert(
      {
        provider_audio_id: providerAudioId,
        submitted_audio_sha256: submittedSha256,
        first_lecture_id: lectureId,
      },
      { onConflict: "provider_audio_id", ignoreDuplicates: true },
    )
    .select("provider_audio_id");

  if (inserted.error) {
    if (isMissingSchemaError(inserted.error)) {
      noteIdentityLedger(false);
      return { available: false, boundToLectureId: null, boundSubmittedSha256: null };
    }
    throw new Error(inserted.error.message);
  }
  noteIdentityLedger(true);

  // Non-empty: we are the first claimant, so the binding is ours by definition.
  if (inserted.data && inserted.data.length > 0) {
    return {
      available: true,
      boundToLectureId: lectureId,
      boundSubmittedSha256: submittedSha256,
    };
  }

  const existing = await svc
    .from("provider_audio_identities")
    .select("submitted_audio_sha256, first_lecture_id")
    .eq("provider_audio_id", providerAudioId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  return {
    available: true,
    boundToLectureId: (existing.data?.first_lecture_id as string | null) ?? null,
    boundSubmittedSha256: (existing.data?.submitted_audio_sha256 as string | null) ?? null,
  };
}

export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { lecture, columns } = await loadLecture(svc, id);
    if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
    await requireCourseOwner(lecture.course_id, user.id);

    // Terminal already: report, don't re-poll. Keeps the endpoint idempotent.
    if (["transcribed", "ready", "failed", "quarantined"].includes(lecture.status)) {
      return NextResponse.json({ lectureId: id, status: lecture.status });
    }
    if (!lecture.provider_job_id) {
      return NextResponse.json({ error: "Lecture has no provider job; submit it first." }, { status: 409 });
    }
    const providerJobId = lecture.provider_job_id;
    // The row first; then this process's memory; then, last, the job id THIS
    // SERVER wrote at submit time. That third fallback is not a way to choose a
    // replay -- it cannot start one -- it is how a poll survives a restart while
    // `replay_fixture_slug` still has nowhere to live. Without it a restart
    // between submit and poll would send a fixture job id to Sarvam.
    const replaySlug =
      lecture.replay_fixture_slug ??
      recallReplayRequest(id) ??
      replaySlugOfJobId(providerJobId);

    const provider = getTranscriptionProvider({ replay_fixture_slug: replaySlug });
    let polled;
    try {
      polled = await provider.poll(providerJobId);
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

    // No transcript was produced, so there is nothing to keep and nothing to
    // quarantine. `failed`, not `quarantined` -- the two words mean different
    // things and the distinction is what makes the quarantine queue readable.
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
      raw = await provider.fetchRawResult(providerJobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retrieving the transcript failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // Lifted out by the ADAPTER. This route does not know what field it came
    // from and does not know the word "Sarvam"; that boundary is the whole
    // point of @/lib/transcription/types.ts and an identity check must not be
    // the one place it is broken.
    const providerAudioId = provider.audioIdentity(raw);

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
      providerJobId,
      descriptor: provider.describe(lecture.language_code ?? undefined),
      providerCreatedAt: polled.providerCreatedAt,
      providerUpdatedAt: polled.providerUpdatedAt,
      runCreatedAt: lecture.created_at,
      rawResponse: raw,
    });

    // The ledger is consulted only when there is a server-measured digest to
    // bind. Binding an identity to a null digest would seed the ledger with
    // nulls and poison every comparison after it -- the same reason the
    // migration's backfill excludes rows with no checksum.
    const submittedSha256 = lecture.submitted_audio_sha256 ?? null;
    let ledger: LedgerAnswer = {
      available: false,
      boundToLectureId: null,
      boundSubmittedSha256: null,
    };
    if (providerAudioId && submittedSha256 && identitySchema().ledger !== false) {
      try {
        ledger = await bindAudioIdentity(svc, providerAudioId, submittedSha256, id);
      } catch (err) {
        // A ledger that cannot be reached is an unavailable check, not a pass
        // and not a lecture failure. evaluateResult says so in the verdict.
        console.error("audio identity ledger unavailable:", err);
        ledger = { available: false, boundToLectureId: null, boundSubmittedSha256: null };
      }
    }

    const identity = evaluateResult({
      lectureId: id,
      providerJobId,
      prior: lecture.audio_identity ?? null,
      claimedSha256: lecture.checksum_sha256,
      submittedSha256,
      declaredBytes: lecture.file_size_bytes,
      observedBytes: lecture.audio_identity?.metrics?.observedBytes ?? null,
      providerAudioId,
      boundToLectureId: ledger.boundToLectureId,
      boundSubmittedSha256: ledger.boundSubmittedSha256,
      submittedAt: lecture.submitted_at ?? null,
      providerCreatedAt: polled.providerCreatedAt,
      provenanceLectureId: provenance.lectureId,
      provenanceProviderJobId: provenance.providerJobId,
      replayFixtureSlug: replaySlug,
      ledgerAvailable: ledger.available,
      storageAvailable: columns,
    });

    // THE TRANSCRIPT IS VALIDATED HERE, AT THE MOMENT IT ARRIVES -- before
    // anything reads it and long before knowledge is derived from it. A
    // rejected transcript is still STORED, with its provenance and its
    // verdict: the raw artefact is what everything is re-derivable from and
    // deleting it would destroy the evidence that the engine misbehaved. What
    // changes is the status. A quarantined lecture never reaches extraction,
    // so no knowledge is ever built on it.
    //
    // TWO independent verdicts now gate this, asking different questions:
    // `transcript_validation` asks whether the text is a language this product
    // serves; `audio_identity` asks whether the text belongs to this recording.
    // The thermodynamics transcript served under "Cloud computing.mp3" passes
    // the first comfortably. Either one rejecting is enough to quarantine, and
    // a failure AFTER a transcript exists is a quarantine rather than a
    // failure precisely because the transcript is the evidence.
    const identityRejected = identity.verdict === "reject";
    const quarantined = validation.verdict === "reject" || identityRejected;

    // raw_transcription_response is stored exactly as received. Normalization
    // happens at read time; this row is the artefact everything re-derives from.
    // Matched on provider_job_id as well as id. The job id was read off this
    // same row moments ago, so the extra predicate only fails if the row was
    // re-submitted concurrently -- in which case this response belongs to a
    // superseded job and must NOT overwrite the newer one. Cheap, and it makes
    // "a transcript is only ever attached to the run that generated it" a
    // property of the write rather than of the code path leading to it.
    const written = await writeResult(svc, id, providerJobId, {
      base: {
        status: quarantined ? "quarantined" : "transcribed",
        provider_status: polled.providerStatus,
        raw_transcription_response: raw,
        provenance,
        transcript_validation: validation,
        // The identity reason comes first when it is the reason: it is the one
        // a faculty member can act on ("this is not your recording") and the
        // language reason would be a distraction from it.
        error_message: identityRejected
          ? identity.reason
          : quarantined
            ? validation.reason
            : null,
        completed_at: new Date().toISOString(),
      },
      identityFields: {
        provider_audio_id: providerAudioId,
        audio_identity: identity,
      },
    });

    if (written.error) return NextResponse.json({ error: written.error }, { status: 500 });
    if (written.rows === 0) {
      return NextResponse.json(
        { error: "This lecture was re-submitted while its transcript was being retrieved; the stale result was discarded." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      lectureId: id,
      status: quarantined ? "quarantined" : "transcribed",
      validation: { verdict: validation.verdict, code: validation.code, reason: validation.reason },
      audioIdentity: { verdict: identity.verdict, code: identity.code, reason: identity.reason },
      identityStored: written.identityStored,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// The identity columns arrive in a migration that is written but not applied.
// When they are absent the transcript, its provenance and its language verdict
// are still written -- losing those would be a far worse outcome than losing a
// check that has nowhere to live. The caller is told which happened.
async function writeResult(
  svc: ReturnType<typeof serviceClient>,
  id: string,
  providerJobId: string,
  spec: { base: Record<string, unknown>; identityFields: Record<string, unknown> },
): Promise<{ rows: number; error: string | null; identityStored: boolean }> {
  const run = (payload: Record<string, unknown>) =>
    svc.from("lectures").update(payload).eq("id", id)
      .eq("provider_job_id", providerJobId).select("id");

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
  return { rows: data?.length ?? 0, error: error ? error.message : null, identityStored: false };
}
