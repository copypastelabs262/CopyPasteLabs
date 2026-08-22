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
// Selected with TRANSCRIPTION_PROVIDER=fixture. Sarvam remains the default, so
// nothing can fall back to replay by accident.

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

// Filename first, so a demo can choose its transcript by naming the upload
// after a fixture slug. Otherwise a stable hash, so the same upload always
// replays the same transcript -- a fixture provider that returned a different
// transcript on re-run would be untestable.
function pickFixture(filename: string): Fixture {
  const fixtures = loadFixtures();
  const normalized = filename.toLowerCase();
  const named = fixtures.find((f) => normalized.includes(f.slug));
  if (named) return named;

  let hash = 0;
  for (let i = 0; i < filename.length; i += 1) {
    hash = (hash * 31 + filename.charCodeAt(i)) >>> 0;
  }
  return fixtures[hash % fixtures.length];
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
  if (!found) throw new Error(`Unknown transcription fixture "${slug}".`);
  return found;
}

// Long enough that the UI genuinely renders its `transcribing` state and the
// poll path is exercised, short enough not to slow a demo down.
const SIMULATED_QUEUE_MS = 4_000;

export function createFixtureProvider(): TranscriptionProvider {
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
        },
        configuredLanguage: language,
        limitations: [
          "REPLAYED, NOT TRANSCRIBED. No live ASR call was made; this response was captured from Lab v0 RUN 1 on 2026-08-21 and is being replayed by TRANSCRIPTION_PROVIDER=fixture.",
          "The audio stored against this lecture is NOT the audio that produced this transcript.",
          "processingTimeMs and provider timestamps are simulated.",
        ],
      };
    },

    async submit(audio: AudioToTranscribe, languageCode?: string): Promise<SubmittedJob> {
      const fixture = pickFixture(audio.filename);
      return {
        providerJobId: `${JOB_PREFIX}${fixture.slug}:${Date.now()}`,
        providerStatus: "Queued",
        languageCode: languageCode ?? DEFAULT_LANGUAGE_CODE,
      };
    },

    async poll(providerJobId: string): Promise<JobPoll> {
      const { slug, submittedAtMs } = parseJobId(providerJobId);
      const fixture = fixtureBySlug(slug);
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
        providerStatus: fixture.providerStatus ?? "Completed",
        errorMessage: null,
        providerCreatedAt: createdAt,
        providerUpdatedAt: new Date((submittedAtMs || Date.now()) + SIMULATED_QUEUE_MS).toISOString(),
      };
    },

    async fetchRawResult(providerJobId: string): Promise<unknown> {
      const { slug } = parseJobId(providerJobId);
      // Verbatim, exactly as the real provider contract requires.
      return fixtureBySlug(slug).rawResponse;
    },
  };
}

export function listFixtureSlugs(): string[] {
  return loadFixtures().map((f) => f.slug);
}
