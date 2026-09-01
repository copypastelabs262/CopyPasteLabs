// Does this transcript belong to THIS recording?
//
// transcript-validation.ts answers a different question -- "is this transcript
// linguistically valid?" -- and answers it well. It cannot answer this one, and
// on 2026-08-22 that gap reached a deployed product: a lecture uploaded as
// "Cloud computing.mp3" was stored byte-correct and then served the transcript
// of an engineering THERMODYNAMICS course outline. That transcript is fluent,
// confident English. It scores above every threshold in the language guard. It
// was simply not the transcript of that recording.
//
// The two guards are deliberately orthogonal and share a shape on purpose:
// same three verdicts, same four top-level fields, same "store the verdict,
// never recompute it on read" rule. One helper (blocksDerivation, below) gates
// both, so the extraction gate and the read gate cannot drift apart.
//
// WHAT THIS MODULE IS NOT KEYED TO. There is no filename here, no course id,
// no language, no owner, no subject, no date literal, no fixture slug and no
// allowlist, and it never reads a single character of the transcript. It reads
// digests, an identifier the provider echoed back, two timestamps and a job id.
// A guard tuned to the incident that motivated it would only ever catch that
// incident again.
//
// Pure. No imports, no clock, no I/O -- every time value arrives as an
// argument -- so it runs directly under node and is testable without a
// database, a network or a provider.

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

// The same three words as TranscriptVerdict, and that is the point. A second
// vocabulary for the same idea would mean two sets of downstream filters, and
// eventually one of them would be missed.
export type AudioIdentityVerdict = "pass" | "uncertain" | "reject";

export type AudioIdentityCode =
  // Detected BEFORE the provider is called. No transcript exists yet.
  | "stored_audio_mismatch" // the server's digest disagrees with the browser's claim
  | "declared_size_mismatch" // the object is not the size the client declared
  | "upload_claim_missing" // there is no claim to check (legacy / scripted path)
  // Detected AFTER a transcript exists.
  | "foreign_audio_identity" // this identity is already bound to different audio
  | "provider_audio_id_absent" // the provider echoed no identity at all
  | "result_predates_submission" // the provider's job is older than our submission
  | "job_binding_mismatch" // provenance, job id and row disagree about who owns this
  | "replayed_transcript" // a deliberate, explicitly named fixture replay
  // Detected when the schema this guard needs is not present.
  //
  // Not in the original design, and added deliberately rather than folded into
  // "pass": the audio-identity migration is written but not applied, so on the
  // current database every check below has nowhere to store its answer and the
  // ledger it consults does not exist. A guard that cannot run must SAY it did
  // not run. Reporting `pass` in that state would be the exact failure mode
  // this module exists to remove -- a confident answer over an absent check.
  | "identity_check_unavailable";

export interface AudioIdentityMetrics {
  // What the browser said the file hashed to. Null on every non-browser path,
  // and null on 42 of the 50 rows that existed when this was written.
  claimedSha256: string | null;
  // What the server measured over the exact buffer handed to the provider.
  // This is an observation, not a claim, and it is the only digest in the
  // system that is one.
  submittedSha256: string | null;
  declaredBytes: number | null;
  observedBytes: number | null;
  // The provider's own identity for the audio it decoded. NOT a hash of our
  // bytes; see the note on foreign_audio_identity below.
  providerAudioId: string | null;
  providerJobId: string | null;
  // Which lecture already holds this provider identity, when one does.
  boundToLectureId: string | null;
  submittedAt: string | null;
  providerCreatedAt: string | null;
  replayFixtureSlug: string | null;
  // Whether the ledger and the columns this verdict needs were reachable. A
  // reader a year from now must be able to tell "checked and clean" from
  // "could not check", and the verdict alone cannot express that.
  ledgerAvailable: boolean;
  storageAvailable: boolean;
}

export interface AudioIdentity {
  verdict: AudioIdentityVerdict;
  // Machine-readable cause. Null only when the verdict is an unqualified pass.
  code: AudioIdentityCode | null;
  // Human-readable, written for a faculty member rather than an engineer.
  reason: string | null;
  metrics: AudioIdentityMetrics;
}

// Clock skew between our server and the provider's is real, and a freshness
// check with no tolerance would quarantine healthy lectures on it. Five minutes
// is generous enough to survive skew and short enough to catch the case that
// actually occurred: lecture 5ced44b6's stored response carries a request id
// stamped the DAY BEFORE the job was submitted.
//
// Named honestly: this catches STALE contamination, not concurrent
// contamination. A provider mixing up two jobs in the same minute passes it.
export const FRESHNESS_TOLERANCE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// The gate, shared with the language guard
// ---------------------------------------------------------------------------

// One helper over both records. `transcript_validation` and `audio_identity`
// have the same shape precisely so that the extraction gate and the read gate
// are a single expression rather than two parallel ones.
//
// Only `reject` blocks. `uncertain` is recorded and surfaced but never bars a
// lecture: refusing every transcript whose provider echoed no identity would
// refuse every transcript from any provider that does not echo one.
export function blocksDerivation(
  ...records: Array<{ verdict?: string | null } | null | undefined>
): boolean {
  return records.some((record) => record?.verdict === "reject");
}

// ---------------------------------------------------------------------------
// Schema-capability predicates
// ---------------------------------------------------------------------------

// The audio-identity migration is WRITTEN BUT NOT APPLIED. Until it is applied
// the columns and the ledger it creates do not exist, and the pipeline must
// keep working -- while saying, in the verdict it returns, that the check could
// not run. This predicate is how a route tells "the column is missing" apart
// from "the write failed", without either route hard-coding a Postgres error
// code inline.
//
// 42703 / PGRST204: the column is not there. 42P01 / PGRST205: the table is not
// there. Anything else is a real failure and must NOT be swallowed.
export function isMissingSchemaError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(code)) return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("could not find the") ||
    message.includes("schema cache")
  );
}

// Every column and table this guard needs arrives in one migration, so the
// capability is two flags rather than five. Memoised per process because the
// answer only changes when a migration is applied.
export interface IdentitySchemaState {
  columns: boolean | null;
  ledger: boolean | null;
}

const schemaState: IdentitySchemaState = { columns: null, ledger: null };

export function identitySchema(): IdentitySchemaState {
  return schemaState;
}

export function noteIdentityColumns(present: boolean): void {
  schemaState.columns = present;
}

export function noteIdentityLedger(present: boolean): void {
  schemaState.ledger = present;
}

// Test seam. Nothing in the application calls this.
export function resetIdentitySchema(): void {
  schemaState.columns = null;
  schemaState.ledger = null;
}

// ---------------------------------------------------------------------------
// Stage 1 -- what the server observed, before the provider is called
// ---------------------------------------------------------------------------

export interface SubmissionFacts {
  // The browser's claim, unverified, and absent on every scripted path.
  claimedSha256: string | null;
  // SHA-256, computed server-side, of the exact buffer handed to the provider.
  submittedSha256: string;
  declaredBytes: number | null;
  observedBytes: number;
  replayFixtureSlug: string | null;
  storageAvailable: boolean;
}

function normalizeDigest(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function baseMetrics(): AudioIdentityMetrics {
  return {
    claimedSha256: null,
    submittedSha256: null,
    declaredBytes: null,
    observedBytes: null,
    providerAudioId: null,
    providerJobId: null,
    boundToLectureId: null,
    submittedAt: null,
    providerCreatedAt: null,
    replayFixtureSlug: null,
    ledgerAvailable: false,
    storageAvailable: false,
  };
}

// Runs BEFORE provider.submit(). A reject here means the provider is never
// called at all: there is no point paying to transcribe audio we cannot vouch
// for, and there is no transcript to quarantine, so the lecture FAILS and the
// remedy is a re-upload.
export function evaluateSubmission(facts: SubmissionFacts): AudioIdentity {
  const claimed = normalizeDigest(facts.claimedSha256);
  const submitted = normalizeDigest(facts.submittedSha256);

  const metrics: AudioIdentityMetrics = {
    ...baseMetrics(),
    claimedSha256: claimed,
    submittedSha256: submitted,
    declaredBytes: facts.declaredBytes,
    observedBytes: facts.observedBytes,
    replayFixtureSlug: facts.replayFixtureSlug,
    storageAvailable: facts.storageAvailable,
  };

  // Size first. If the object is a different length from the one the client
  // described, the digest necessarily differs too, and "the upload was
  // truncated" is a more useful sentence than "the fingerprints disagree".
  if (
    typeof facts.declaredBytes === "number" &&
    facts.declaredBytes > 0 &&
    facts.declaredBytes !== facts.observedBytes
  ) {
    return {
      verdict: "reject",
      code: "declared_size_mismatch",
      reason:
        `The uploaded file is ${facts.observedBytes} bytes but was declared as ` +
        `${facts.declaredBytes}. The upload did not finish, so the recording in storage is ` +
        "not the one that was chosen. Upload it again; nothing has been transcribed.",
      metrics,
    };
  }

  if (claimed !== null && submitted !== null && claimed !== submitted) {
    return {
      verdict: "reject",
      code: "stored_audio_mismatch",
      reason:
        "The recording in storage is not the file that was chosen for this lecture: the " +
        "fingerprint taken in the browser and the fingerprint taken on the server do not " +
        "match. Nothing has been transcribed. Upload the recording again.",
      metrics,
    };
  }

  if (claimed === null) {
    // NOT a pass. 42 of 50 existing rows are in this state because only the
    // browser path ever sent a claim, so treating absence as agreement would
    // have marked most of the database verified when none of it was.
    return {
      verdict: "uncertain",
      code: "upload_claim_missing",
      reason:
        "This upload arrived without a fingerprint from the sender, so the server could " +
        "measure what it received but had nothing to compare it against. The recording is " +
        "being transcribed; its origin is recorded as unverified rather than confirmed.",
      metrics,
    };
  }

  return { verdict: "pass", code: null, reason: null, metrics };
}

// ---------------------------------------------------------------------------
// Stage 2 -- what the provider returned, after a transcript exists
// ---------------------------------------------------------------------------

export interface ResultFacts {
  lectureId: string;
  providerJobId: string;
  // The verdict written at submit, when it could be read back. Null when the
  // columns do not exist yet, which is why every byte-level fact below is also
  // passed separately rather than dug out of it.
  prior: AudioIdentity | null;

  claimedSha256: string | null;
  submittedSha256: string | null;
  declaredBytes: number | null;
  observedBytes: number | null;

  // Lifted out of the raw response by the PROVIDER ADAPTER. Nothing here knows
  // which field it came from, and nothing here treats it as a hash of our bytes.
  providerAudioId: string | null;
  // The ledger's answer: who already holds this identity, and for which audio.
  boundToLectureId: string | null;
  boundSubmittedSha256: string | null;

  submittedAt: string | null;
  providerCreatedAt: string | null;
  freshnessToleranceMs?: number;

  // What the provenance record says about itself. If it names a different
  // lecture or a different job from the row it is about to be written onto,
  // something upstream has crossed two runs.
  provenanceLectureId: string | null;
  provenanceProviderJobId: string | null;

  replayFixtureSlug: string | null;
  ledgerAvailable: boolean;
  storageAvailable: boolean;
}

export function evaluateResult(facts: ResultFacts): AudioIdentity {
  const submitted = normalizeDigest(facts.submittedSha256);
  const bound = normalizeDigest(facts.boundSubmittedSha256);
  const tolerance = facts.freshnessToleranceMs ?? FRESHNESS_TOLERANCE_MS;

  const metrics: AudioIdentityMetrics = {
    claimedSha256: normalizeDigest(facts.claimedSha256),
    submittedSha256: submitted,
    declaredBytes: facts.declaredBytes,
    observedBytes: facts.observedBytes,
    providerAudioId: facts.providerAudioId,
    providerJobId: facts.providerJobId,
    boundToLectureId: facts.boundToLectureId,
    submittedAt: facts.submittedAt,
    providerCreatedAt: facts.providerCreatedAt,
    replayFixtureSlug: facts.replayFixtureSlug,
    ledgerAvailable: facts.ledgerAvailable,
    storageAvailable: facts.storageAvailable,
  };

  // A reject decided before the provider was called does not become a pass
  // because the provider later answered politely. Carry it forward verbatim,
  // with the metrics widened to everything now known.
  if (facts.prior && facts.prior.verdict === "reject") {
    return {
      verdict: "reject",
      code: facts.prior.code,
      reason: facts.prior.reason,
      metrics,
    };
  }

  // --- rejections, in order of how directly they prove the transcript is not
  // --- this lecture's.

  // The provenance record is built from the run it describes. If it names
  // another lecture or another job, two runs have been crossed somewhere above
  // this line and nothing downstream can be trusted to have the right one.
  if (
    (facts.provenanceLectureId !== null &&
      facts.provenanceLectureId !== facts.lectureId) ||
    (facts.provenanceProviderJobId !== null &&
      facts.provenanceProviderJobId !== facts.providerJobId)
  ) {
    return {
      verdict: "reject",
      code: "job_binding_mismatch",
      reason:
        "The transcription record that came back describes a different lecture or a " +
        "different transcription job from the one it was requested for. The transcript is " +
        "kept as evidence but is not shown, because it cannot be shown to be this " +
        "recording's.",
      metrics,
    };
  }

  // THE CROSS-CONTAMINATION INVARIANT.
  //
  // A provider audio identity belongs to exactly one piece of audio. If this
  // identity is already bound to a DIFFERENT digest, then two different
  // recordings have been told their transcript came from the same decoded
  // audio, and at most one of them can be right.
  //
  // Note what this deliberately does NOT claim. providerAudioId is a hash of
  // the provider's own decoded audio, not of our bytes -- the response reports
  // audio/wav for a file we sent as mp3 -- so it can never prove "this
  // transcript is of my audio". It discriminates: "have I seen this decoded
  // audio before, under a different recording?" That is a weaker statement and
  // it is the true one.
  //
  // The same identity bound to the SAME digest is a legitimate
  // re-transcription, or two faculty uploading the same recording, and passes.
  if (
    facts.providerAudioId !== null &&
    bound !== null &&
    submitted !== null &&
    bound !== submitted
  ) {
    return {
      verdict: "reject",
      code: "foreign_audio_identity",
      reason:
        "The transcription service reports that this transcript came from audio it has " +
        "already seen -- under a different recording. Two different uploads cannot both " +
        "have produced the same audio, so this transcript is not confirmed to be this " +
        "lecture's. It is kept for review and is not published.",
      metrics,
    };
  }

  // Freshness. A provider job created before we submitted cannot be a
  // transcript of what we submitted.
  const submittedMs = facts.submittedAt ? Date.parse(facts.submittedAt) : NaN;
  const providerMs = facts.providerCreatedAt
    ? Date.parse(facts.providerCreatedAt)
    : NaN;
  if (
    Number.isFinite(submittedMs) &&
    Number.isFinite(providerMs) &&
    providerMs < submittedMs - tolerance
  ) {
    return {
      verdict: "reject",
      code: "result_predates_submission",
      reason:
        "The transcription service produced this transcript before this recording was sent " +
        "to it, so it cannot be a transcript of this recording. It is kept for review and " +
        "is not published.",
      metrics,
    };
  }

  // --- everything below is recorded and surfaced, and blocks nothing.

  // A deliberate replay is the one case where we KNOW the transcript came from
  // other audio, because we asked for it. It is never a pass.
  if (facts.replayFixtureSlug) {
    return {
      verdict: "uncertain",
      code: "replayed_transcript",
      reason:
        `This transcript is a deliberate replay of the stored sample "${facts.replayFixtureSlug}". ` +
        "It was not produced from the audio attached to this lecture, and it exists only so " +
        "the rest of the pipeline can be exercised without a live transcription call.",
      metrics,
    };
  }

  if (!facts.storageAvailable || !facts.ledgerAvailable) {
    return {
      verdict: "uncertain",
      code: "identity_check_unavailable",
      reason:
        "The record that proves a transcript belongs to its own recording is not available " +
        "on this database yet, so that check did not run for this lecture. The transcript " +
        "has not been shown to be wrong -- it has not been checked.",
      metrics,
    };
  }

  if (facts.providerAudioId === null) {
    return {
      verdict: "uncertain",
      code: "provider_audio_id_absent",
      reason:
        "The transcription service returned no identifier for the audio it decoded, so this " +
        "transcript could not be checked against transcripts of other recordings. It is " +
        "recorded as unverified rather than confirmed.",
      metrics,
    };
  }

  if (metrics.claimedSha256 === null) {
    return {
      verdict: "uncertain",
      code: "upload_claim_missing",
      reason:
        "This upload arrived without a fingerprint from the sender, so its origin is " +
        "recorded as unverified rather than confirmed.",
      metrics,
    };
  }

  // An uncertainty raised at submit that nothing above has superseded survives.
  if (facts.prior && facts.prior.verdict === "uncertain") {
    return {
      verdict: "uncertain",
      code: facts.prior.code,
      reason: facts.prior.reason,
      metrics,
    };
  }

  return { verdict: "pass", code: null, reason: null, metrics };
}
