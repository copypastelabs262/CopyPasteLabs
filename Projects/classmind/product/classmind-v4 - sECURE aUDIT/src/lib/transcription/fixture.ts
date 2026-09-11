import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  AudioToTranscribe,
  JobPoll,
  ProviderDescriptor,
  SubmittedJob,
  TranscriptionProvider,
} from "@/lib/transcription/types";
import { DEFAULT_LANGUAGE_CODE } from "@/lib/transcription/types";

// A deterministic TranscriptionProvider that replays real Sarvam responses
// instead of calling Sarvam.
//
// It exists because every stage downstream of transcription -- normalization,
// evidence offsets, extraction, review, the student view -- can only be tested
// against a transcript that is shaped like a real one. Synthesising that shape
// by hand would test the synthesiser. So the payloads here are verbatim Sarvam
// Batch responses captured during Lab v0 RUN 1 and exported once to
// fixtures/transcription/; nothing in the product reads Lab v0's `runs` table.
//
// This is NOT a mock in the usual sense: the response bytes are real, the
// provenance written from them is real, and the misdetected-language fixture
// reproduces a real failure. What is simulated is only the network call and
// the queue delay.
//
// HOW IT IS CHOSEN, AND WHY THAT CHANGED
//
// It used to be chosen two ways, both implicit, and both are gone:
//
//   1. `TRANSCRIPTION_PROVIDER=fixture` -- an ambient environment variable,
//      exactly the kind of thing that is set for a demo and then forgotten.
//   2. `pickFixture(filename)` -- which transcript you got was decided by the
//      NAME of the uploaded file: a substring match against the fixture slugs,
//      falling back to a stable hash of the filename modulo the fixture count.
//
// On 2026-08-22 a lecture uploaded as "Cloud computing.mp3" matched no slug,
// fell through to the hash, landed on `course-outline-en`, and was served the
// transcript of an engineering thermodynamics course outline. That is the
// entire mechanism of the failure: selection was implicit, filename-derived,
// and looked plausible.
//
// Replay is now per-lecture, explicit and named at creation time
// (`lectures.replay_fixture_slug`), refused outright on any deployment, and
// the slug arrives here as an ARGUMENT. `submit()` is not given a filename at
// all any more -- there is no value left for it to key a decision off, which is
// a stronger guarantee than promising not to look at one.

const FIXTURE_DIR = join(process.cwd(), "fixtures", "transcription");

interface Fixture {
  slug: string;
  sourceRunId: string;
  sourceFilename: string;
  providerStatus: string;
  capturedFrom: string;
  rawResponse: unknown;
}

let cache: Fixture[] | null = null;

function loadFixtures(): Fixture[] {
  if (cache) return cache;
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) {
    throw new Error(`No transcription fixtures in ${FIXTURE_DIR}.`);
  }
  cache = files.map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf8")) as Fixture);
  return cache;
}

// The job id carries the fixture slug, so poll() and fetchRawResult() resolve
// with no server-side state. A restart mid-job therefore recovers rather than
// orphaning the lecture in `transcribing` forever.
const JOB_PREFIX = "fixture:";

function parseJobId(providerJobId: string): { slug: string; submittedAtMs: number } {
  const rest = providerJobId.slice(JOB_PREFIX.length);
  const at = rest.lastIndexOf(":");
  const slug = at === -1 ? rest : rest.slice(0, at);
  const submittedAtMs = at === -1 ? 0 : Number(rest.slice(at + 1));
  return { slug, submittedAtMs: Number.isFinite(submittedAtMs) ? submittedAtMs : 0 };
}

function fixtureBySlug(slug: string): Fixture {
  const found = loadFixtures().find((f) => f.slug === slug);
  if (!found) {
    throw new Error(
      `Unknown transcription fixture "${slug}". Known fixtures: ${listFixtureSlugs().join(", ")}.`,
    );
  }
  return found;
}

// Long enough that the UI genuinely renders its `transcribing` state and the
// poll path is exercised, short enough not to slow a demo down.
const SIMULATED_QUEUE_MS = 4_000;

// The slug is required and is validated here, at construction, rather than
// inside submit(). An unknown fixture must fail at the moment somebody asks for
// it, in the request that asked, not three steps later inside a provider call
// where it would read as a transcription failure.
export function createFixtureProvider(slug: string): TranscriptionProvider {
  const fixture = fixtureBySlug(slug);

  return {
    describe(languageCode?: string): ProviderDescriptor {
      const language = languageCode ?? DEFAULT_LANGUAGE_CODE;
      return {
        engine: "fixture-replay",
        // Named after what actually produced the bytes, not after this module.
        // A provenance record claiming "fixture" as the engine would hide the
        // fact that the transcript really is Saarika v2.5 output.
        modelSnapshot: "saarika:v2.5 (replayed from Lab v0 RUN 1, 2026-08-21)",
        modelSnapshotIsDated: false,
        modelVersion: "saarika:v2.5",
        apiVersion: "sarvam-batch-v1 (replayed)",
        decodingParams: {
          model: "saarika:v2.5",
          language_code: language,
          with_timestamps: true,
          with_diarization: false,
          replayed: true,
          replayFixtureSlug: fixture.slug,
        },
        configuredLanguage: language,
        limitations: [
          `REPLAYED, NOT TRANSCRIBED. No live ASR call was made; this response was captured from Lab v0 RUN 1 on 2026-08-21 and is being replayed because this lecture was created with replayFixture="${fixture.slug}".`,
          "The audio stored against this lecture is NOT the audio that produced this transcript.",
          "processingTimeMs and provider timestamps are simulated.",
        ],
      };
    },

    // Takes the audio only so the signature matches the interface. It reads
    // nothing out of it, and there is no longer a filename in it to read.
    async submit(_audio: AudioToTranscribe, languageCode?: string): Promise<SubmittedJob> {
      return {
        providerJobId: `${JOB_PREFIX}${fixture.slug}:${Date.now()}`,
        providerStatus: "Queued",
        languageCode: languageCode ?? DEFAULT_LANGUAGE_CODE,
      };
    },

    async poll(providerJobId: string): Promise<JobPoll> {
      const { slug: jobSlug, submittedAtMs } = parseJobId(providerJobId);
      const polled = fixtureBySlug(jobSlug);
      const elapsed = Date.now() - submittedAtMs;

      if (submittedAtMs > 0 && elapsed < SIMULATED_QUEUE_MS) {
        return {
          state: "in_progress",
          providerStatus: "Processing",
          errorMessage: null,
          providerCreatedAt: null,
          providerUpdatedAt: null,
        };
      }

      const createdAt = new Date(submittedAtMs || Date.now()).toISOString();
      return {
        state: "completed",
        providerStatus: polled.providerStatus ?? "Completed",
        errorMessage: null,
        providerCreatedAt: createdAt,
        providerUpdatedAt: new Date((submittedAtMs || Date.now()) + SIMULATED_QUEUE_MS).toISOString(),
      };
    },

    async fetchRawResult(providerJobId: string): Promise<unknown> {
      const { slug: jobSlug } = parseJobId(providerJobId);
      // Verbatim, exactly as the real provider contract requires.
      return fixtureBySlug(jobSlug).rawResponse;
    },

    // Reports what the captured response actually contains, which for three of
    // the four fixtures is a real Sarvam audio_hash.
    //
    // The design's implementation table said this should return null. It is
    // implemented faithfully instead, for two reasons. First, the migration's
    // own backfill reads `raw_transcription_response ->> 'audio_hash'` for
    // EVERY historical row, fixture replays included, so a null here would put
    // the live pipeline and the ledger's own seed data in disagreement.
    // Second, and more important: the 2026-08-22 contamination WAS a fixture
    // replay. A replay that reports no identity is a replay the
    // cross-contamination invariant cannot see, which would have left the guard
    // blind on the exact path that failed. Returning the real value means a
    // second lecture replaying the same fixture over different audio is caught
    // by the ledger like any other collision.
    audioIdentity(raw: unknown): string | null {
      if (typeof raw !== "object" || raw === null) return null;
      const value = (raw as Record<string, unknown>).audio_hash;
      return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    },
  };
}

export function listFixtureSlugs(): string[] {
  return loadFixtures().map((f) => f.slug);
}

// Which fixture a job id belongs to, or null if it is not a fixture job.
//
// This is NOT a second way to CHOOSE a replay -- it cannot start one. It reads
// a job id THIS SERVER wrote, at submit time, after a replay had already been
// authorised, and reports which fixture that job was for. No client can set a
// provider job id, so nothing user-controlled reaches this.
//
// It exists because `replay_fixture_slug` has nowhere to live until
// 20260830150000 is applied, so a restart between submit and poll would
// otherwise leave the poll route asking Sarvam about a job Sarvam never had.
// Deleting this function once that migration is applied costs nothing.
export function fixtureSlugOfJobId(providerJobId: string): string | null {
  if (!providerJobId.startsWith(JOB_PREFIX)) return null;
  const { slug } = parseJobId(providerJobId);
  return slug && isKnownFixtureSlug(slug) ? slug : null;
}

export function isKnownFixtureSlug(slug: string): boolean {
  return loadFixtures().some((f) => f.slug === slug);
}
