// ONE definition of: this lecture's transcript did not come from this
// recording, or we cannot show that it did.
//
// WHY THIS EXISTS
//
// On 2026-08-22 lecture 5ced44b6-e156-4ddb-9146-14035d366620, uploaded as
// "Cloud computing.mp3", was stored `ready` carrying the transcript of an
// engineering THERMODYNAMICS course outline captured from a Lab v0 run the day
// before. Its provenance says so in plain English -- engine "fixture-replay",
// provider_job_id "fixture:course-outline-en:1787402755651", a limitation
// reading "The audio stored against this lecture is NOT the audio that
// produced this transcript" -- and a student could still read it today. In
// production 41 of 49 lectures carry the same replayed engine.
//
// The row is evidence and is not being repaired. What changes is who can reach
// it: this predicate is applied at READ time, on every student-facing path.
//
// WHAT IT IS NOT
//
// Not a quarantine, not a deletion, not a language check. `transcript_validation`
// answers "is this transcript linguistically plausible?" and passes a fluent
// English transcript of the wrong lecture without hesitation. This answers a
// different question -- "is this transcript MINE, and can I show it?" -- and a
// lecture must clear both.
//
// PURITY IS A REQUIREMENT, NOT A STYLE
//
// No imports, no I/O, no `server-only`. It takes the row's fields and returns a
// verdict, so `node scripts/test-replay-gate.mts` can exercise every shape
// directly without a database, a server or a build. A rule that can only be
// tested through HTTP is a rule that stops being tested.

// Engines whose output we are prepared to call a genuine transcription of the
// audio it was submitted with.
//
// AN ALLOWLIST, DELIBERATELY. The fail-closed requirement is the whole design:
// an engine string nobody added here is NOT VERIFIABLE and its lecture is
// hidden from students. Adding a new provider therefore means adding it here,
// which is a visible, reviewable act. A blocklist would have the opposite
// property -- every engine invented in future would default to visible, which
// is precisely how a replayed transcript stayed readable for eight days.
const VERIFIABLE_LIVE_ENGINES: readonly string[] = ["sarvam"];

// Substrings that mark an engine as a replay rather than a transcription.
// Matched case-insensitively, anywhere in the string, so "fixture-replay",
// "sarvam-fixture", "replay(sarvam)" and "FixtureReplay" all match. Redundant
// with the allowlist above by construction -- none of these would be
// allowlisted anyway -- and kept because it names the reason precisely and
// keeps working if someone ever widens the allowlist carelessly.
const REPLAY_ENGINE_MARKERS: readonly string[] = [
  "replay", "fixture", "mock", "stub", "fake", "dummy",
  "synthetic", "simulat", "canned", "sample", "seed",
];

// A provider job id whose scheme prefix says the job was never a live call.
// The production shape is "fixture:<slug>:<epoch-ms>"; a real Sarvam id is
// "20260822_<uuid>" and carries no colon at all, so it cannot collide with any
// of these.
const NON_LIVE_JOB_SCHEMES: readonly string[] = [
  "fixture", "replay", "seed", "mock", "stub", "fake", "dummy",
  "synthetic", "sample", "canned", "demo", "test",
];

// Verdicts the audio-identity check (migration 20260830150000) may record.
// `pass` is the only one that positively establishes the transcript belongs to
// this recording.
const IDENTITY_VERDICT_PASS: readonly string[] = ["pass", "passed", "match", "matched", "ok", "verified"];
// `reject` is the verdict the operator named. `uncertain` is DELIBERATELY NOT
// here and deliberately not hiding: it is a recognised verdict that explicitly
// declines to reject, and treating it as a rejection would hide every lecture
// the check cannot decide -- a far larger blast radius than the rule was asked
// for. If that turns out to be the wrong call it is one line: move "uncertain"
// into IDENTITY_VERDICT_REJECT.
const IDENTITY_VERDICT_REJECT: readonly string[] = ["reject", "rejected", "mismatch", "fail", "failed", "contaminated"];

export type ReplayCode =
  | "replay_fixture_slug"
  | "replay_engine"
  | "replay_decoding_params"
  | "replay_limitation"
  | "replay_job_id"
  | "audio_identity_reject"
  | "audio_identity_unrecognised"
  | "provenance_missing"
  | "provenance_engine_unrecognised";

// Exactly the fields this rule reads. Everything is optional and everything
// tolerates the wrong type, because two of these columns do not exist in the
// database yet (`audio_identity`, `replay_fixture_slug` ship in migration
// 20260830150000, which is written but not applied) and `provenance` is jsonb
// with no schema behind it. A caller that cannot supply a field omits it; the
// rule then judges on what it has, and judges strictly.
export interface LectureProvenanceFacts {
  // lectures.provenance -- expected to be a ProcessingProvenance object.
  provenance?: unknown;
  // lectures.provider_job_id.
  providerJobId?: string | null;
  // lectures.audio_identity: { verdict: pass|uncertain|reject, code, reason, metrics }.
  // Absent today. Absent is NOT a rejection; see the note in the verdict below.
  audioIdentity?: unknown;
  // lectures.replay_fixture_slug: non-null only for a deliberate, named replay.
  replayFixtureSlug?: unknown;
  // Whether the row carries a transcript at all.
  //
  // DEFAULTS TO TRUE when omitted, and that default is the fail-closed one: a
  // caller reading knowledge or serving a lecture page is by definition looking
  // at something derived from a transcript. Pass `false` only when the row
  // demonstrably has no transcript -- a lecture still uploading has nothing to
  // leak, and flagging it would make "hidden" mean two different things.
  hasTranscript?: boolean;
}

export interface ReplayVerdict {
  // TRUE means: replayed, contaminated, or not shown to be genuine. Hide it
  // from students.
  replayedOrUnverifiable: boolean;
  code: ReplayCode | null;
  // One sentence, safe to log and safe to show a faculty owner.
  reason: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function lower(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim().toLowerCase() : null;
}

// Reads the verdict out of an audio-identity record without assuming which key
// carries it. The migration says `verdict`; a bare string is accepted too, so a
// simpler shape than the one planned still works.
function identityVerdict(value: unknown): string | null {
  const direct = lower(value);
  if (direct) return direct;
  const rec = asRecord(value);
  if (!rec) return null;
  for (const key of ["verdict", "result", "status", "decision", "outcome"]) {
    const found = lower(rec[key]);
    if (found) return found;
  }
  return null;
}

export function replayVerdict(facts: LectureProvenanceFacts): ReplayVerdict {
  const hasTranscript = facts.hasTranscript !== false;

  // 1. The database's own explicit marker. Non-null only for a transcript that
  //    is a deliberate, named replay of a captured fixture, so it needs no
  //    interpretation at all.
  const slug = lower(facts.replayFixtureSlug);
  if (slug) {
    return {
      replayedOrUnverifiable: true,
      code: "replay_fixture_slug",
      reason: `This transcript is a replay of the captured fixture "${slug}", not a transcription of this recording.`,
    };
  }

  const provenance = asRecord(facts.provenance);
  const engine = provenance ? lower(provenance.engine) : null;

  // 2. The engine says it replayed.
  if (engine && REPLAY_ENGINE_MARKERS.some((m) => engine.includes(m))) {
    return {
      replayedOrUnverifiable: true,
      code: "replay_engine",
      reason: `The transcript was produced by "${engine}", which replays a captured response rather than transcribing this recording.`,
    };
  }

  if (provenance) {
    // 3. The decoding parameters say it replayed. The fixture provider writes
    //    `decodingParams.replayed: true` on every row it produces; an engine
    //    string renamed tomorrow would not move this.
    const params = asRecord(provenance.decodingParams);
    if (params && params.replayed === true) {
      return {
        replayedOrUnverifiable: true,
        code: "replay_decoding_params",
        reason: "The provenance record marks this run as replayed rather than transcribed.",
      };
    }

    // 4. The record's own limitations say it replayed. This is the artefact
    //    confessing in prose -- "REPLAYED, NOT TRANSCRIBED", "The audio stored
    //    against this lecture is NOT the audio that produced this transcript" --
    //    and it is the last line of defence if every structured field is
    //    rewritten.
    const limitations = Array.isArray(provenance.limitations) ? provenance.limitations : [];
    for (const item of limitations) {
      const text = lower(item);
      if (!text) continue;
      if (text.includes("replay") || text.includes("not the audio that produced")) {
        return {
          replayedOrUnverifiable: true,
          code: "replay_limitation",
          reason: "The provenance record states that this transcript did not come from this recording.",
        };
      }
    }
  }

  // 5. The provider job id names a scheme that is not a live call.
  const jobId = lower(facts.providerJobId);
  if (jobId) {
    const scheme = jobId.split(":")[0];
    if (jobId.includes(":") && NON_LIVE_JOB_SCHEMES.includes(scheme)) {
      return {
        replayedOrUnverifiable: true,
        code: "replay_job_id",
        reason: `Provider job "${jobId}" is a ${scheme} reference, not a transcription job for this recording.`,
      };
    }
  }

  // 6. The audio-identity check, once it exists.
  //
  //    ABSENT IS NOT A VERDICT. Every row in production lacks this column
  //    today, and treating "no answer yet" as a rejection would hide the whole
  //    corpus on the strength of a migration nobody has run. What IS treated as
  //    a rejection: an explicit reject, and a verdict string this file does not
  //    recognise -- because an unrecognised verdict is, by definition, one we
  //    cannot read as "genuine".
  if (facts.audioIdentity !== undefined && facts.audioIdentity !== null) {
    const verdict = identityVerdict(facts.audioIdentity);
    if (verdict !== null) {
      if (IDENTITY_VERDICT_REJECT.includes(verdict)) {
        return {
          replayedOrUnverifiable: true,
          code: "audio_identity_reject",
          reason: "The audio-identity check rejected this transcript: it does not belong to this recording.",
        };
      }
      if (!IDENTITY_VERDICT_PASS.includes(verdict) && verdict !== "uncertain") {
        return {
          replayedOrUnverifiable: true,
          code: "audio_identity_unrecognised",
          reason: `The audio-identity check returned "${verdict}", which this build does not recognise as establishing that the transcript is genuine.`,
        };
      }
    }
  }

  // 7. FAIL CLOSED.
  //
  //    Everything above is a positive finding of replay. What remains is the
  //    absence of one, and absence is not evidence. A lecture that HAS a
  //    transcript but cannot name a recognised live engine for it has not shown
  //    the transcript is genuine, so it is not shown to students.
  //
  //    This is the clause that makes the rule safe against the future: an
  //    engine added to the pipeline and not added to VERIFIABLE_LIVE_ENGINES
  //    disappears from student view rather than quietly appearing in it. That
  //    is a loud, cheap, reversible failure. The opposite -- a new engine
  //    defaulting to visible -- is the failure this whole module exists to
  //    prevent, and it is silent.
  if (hasTranscript) {
    if (!provenance || !engine) {
      return {
        replayedOrUnverifiable: true,
        code: "provenance_missing",
        reason: "This lecture has a transcript but no provenance record naming the engine that produced it, so it cannot be shown to be genuine.",
      };
    }
    if (!VERIFIABLE_LIVE_ENGINES.includes(engine)) {
      return {
        replayedOrUnverifiable: true,
        code: "provenance_engine_unrecognised",
        reason: `Engine "${engine}" is not a recognised live transcription engine in this build, so this transcript cannot be shown to be genuine.`,
      };
    }
  }

  return { replayedOrUnverifiable: false, code: null, reason: null };
}

// The predicate. TRUE means hide it from students.
export function isReplayedOrUnverifiable(facts: LectureProvenanceFacts): boolean {
  return replayVerdict(facts).replayedOrUnverifiable;
}
