import {
  createRequestScheduler,
  createTelemetry,
  type ProviderTelemetry,
  type RequestScheduler,
} from "./scheduler.ts";
import type {
  ProviderCapabilities,
  ReasoningProvider,
  ReasoningRequest,
  ReasoningResponse,
} from "./types.ts";

// ONE ADAPTER, MANY PROVIDERS.
//
// Gemini (through its OpenAI-compatibility endpoint), Groq, SambaNova, Mistral
// and Ollama all speak the same wire format: POST chat/completions, a messages
// array, temperature and max_tokens, and the answer at
// choices[0].message.content with usage alongside. Writing one adapter per
// vendor would be writing the same file repeatedly and calling it architecture.
//
// The vendor-specific part is CONFIGURATION -- base URL, model, key, how this
// provider wants to be asked for JSON, and how fast it tolerates being asked.

export interface OpenAICompatibleConfig {
  // Reported as ReasoningProvider.id and written into processing_runs.provider,
  // so it is part of the idempotency cache key. Changing it invalidates reuse,
  // which is correct: a different provider is a different reading.
  id: string;
  model: string;
  // Must end with a slash. Joined directly with "chat/completions".
  baseUrl: string;
  apiKey: string;
  capabilities: ProviderCapabilities;
  // HOW THIS PROVIDER WANTS TO BE ASKED FOR JSON.
  //
  // The engine says `expectJson: true` and nothing more; translating that into
  // provider mechanics is this layer's whole job. "prompt_only" is not a
  // failure mode -- the callers already parse fenced output tolerantly, and a
  // provider that rejects an unknown response_format would fail every call.
  jsonMode: "response_format" | "prompt_only";
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------
//
// Three kinds, because they need three different responses and lumping them
// together is what produced the Test A request storm.
//
//   fatal              the request is wrong and will be wrong next time.
//                      Repeating it cannot succeed and, on a paid provider,
//                      costs money to prove.
//   rate_limit         the request was fine; we sent too many. Handled by the
//                      SHARED scheduler, never by this window backing off on
//                      its own.
//   transient          the provider faltered. Bounded local retry is right.
//   schema_validation  the request was fine and the GENERATION failed the
//                      declared schema. One retry, exactly -- see below.
export type FailureKind = "fatal" | "rate_limit" | "transient" | "schema_validation";

export function classifyStatus(status: number, body = ""): FailureKind {
  if (status === 429) return "rate_limit";
  if (status >= 500) return "transient";
  // THE ONE CARVE-OUT FROM "4xx IS FATAL", and it is deliberately narrow.
  //
  // Groq's strict json_schema mode VALIDATES the completion after generating
  // it rather than fully constraining decoding -- a 400 with code
  // "json_validate_failed" cannot happen under true constrained decoding, yet
  // the 2026-08-31 baseline run produced one (1 window of 20: a top-level
  // array where the schema's root is an object). That 400 is not "the request
  // is wrong": the same request produced 19 valid generations in its
  // neighbouring windows. Provider inference is not bit-identical between
  // calls even at temperature 0, so one re-ask is a real chance at a valid
  // shape. The one-retry bound lives in complete(); anything past that is
  // paying to reproduce a failure, which is what fatal exists to prevent.
  if (status === 400 && body.includes('"json_validate_failed"')) return "schema_validation";
  // 400 invalid request · 401 auth · 403 forbidden · 404 unknown model · 422.
  // 403 is deliberately fatal: no provider-specific transient case has been
  // demonstrated, and guessing one would reintroduce paid retries of a request
  // that cannot succeed.
  return "fatal";
}

// Fields are declared and assigned explicitly rather than as constructor
// parameter properties: node's strip-only TypeScript support rejects those, and
// this module has to stay runnable by plain `node` so the offline suites can
// exercise the retry policy without a build step.
export class ProviderHttpError extends Error {
  readonly status: number;
  readonly kind: FailureKind;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, kind: FailureKind, retryAfterMs: number | null) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

// An empty completion is a 200 with a well-formed body and no content in it.
// The provider did not refuse; it just produced nothing. Observed to repeat
// once and then succeed, so it is transient -- and it was the one failure mode
// the original policy did NOT retry, which is how a whole lecture came back
// empty on 2026-08-22.
export class EmptyCompletionError extends Error {
  readonly kind: FailureKind = "transient";
}

// The model ran out of output budget mid-answer. NOT retried, deliberately:
// temperature is 0, so asking the identical question again produces the
// identical truncation. Repeating it would burn a request to reproduce a known
// failure -- the same reasoning that makes a 400 fatal.
//
// It gets its own error because three of the seven failures on 2026-08-30
// surfaced as `Expected ',' or ']' after array element in JSON at position
// 1032`, which reads like a parser bug and is actually the provider stopping
// early. Naming it is the difference between debugging our parser and
// debugging the request.
export class TruncatedCompletionError extends Error {
  readonly kind: FailureKind = "fatal";
}

// Retry-After is authoritative when present: it is the provider telling us
// exactly how long to wait, which beats any backoff curve we could invent.
// Both RFC forms are accepted -- delay-seconds and an HTTP date.
export function parseRetryAfter(headers: Headers, now = Date.now()): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

const MAX_ATTEMPTS = 3;
// Transient backoff only. Rate limiting does NOT use this -- it uses the
// scheduler's global pause, which is the entire point.
const TRANSIENT_BACKOFF_MS = 1_500;
// Beyond this, waiting out a rate limit inside one HTTP request is worse than
// failing the window: the run still has other windows to spend its budget on,
// and an incomplete pass is preserved rather than published. The scheduler is
// still penalised, so the rest of the run slows down regardless.
const MAX_RATE_LIMIT_WAIT_MS = 45_000;

export function createOpenAICompatibleReasoner(
  cfg: OpenAICompatibleConfig,
  // Injectable so tests can drive the policy without real timers, and so a
  // future caller could share one limiter across several providers.
  scheduler: RequestScheduler = createRequestScheduler(cfg.capabilities.requestsPerMinute),
  telemetry: ProviderTelemetry = createTelemetry(),
): ReasoningProvider {
  return {
    id: cfg.id,
    model: cfg.model,
    capabilities: cfg.capabilities,
    telemetry,

    async complete(request: ReasoningRequest): Promise<ReasoningResponse> {
      let lastError: unknown = null;
      // Tracked per class, not per attempt: a schema-validation failure gets
      // its one retry even when a transient failure spent the first attempt,
      // and never more than one no matter what happened in between.
      let schemaRetried = false;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        // EVERY attempt queues, retries included. A retry that skipped the
        // queue would be the burst this whole design exists to prevent.
        await scheduler.acquire();
        telemetry.httpAttempts += 1;
        if (attempt > 0) telemetry.retries += 1;

        try {
          const res = await callOnce(cfg, request);
          telemetry.succeeded += 1;
          return res;
        } catch (err) {
          lastError = err;
          const kind =
            err instanceof ProviderHttpError ? err.kind
            : err instanceof EmptyCompletionError ? "transient"
            : isTransportFailure(err) ? "transient"
            : "fatal";

          if (kind === "fatal") {
            telemetry.fatal += 1;
            throw err; // will not succeed next time; repeating only costs
          }

          if (kind === "schema_validation") {
            // ONE retry, exactly. The generation failed the schema, not the
            // request -- but a second identical ask that also failed is strong
            // evidence the window is stuck, and every further ask is paid.
            if (schemaRetried) {
              telemetry.fatal += 1;
              throw err;
            }
            schemaRetried = true;
            continue; // re-queues through the shared scheduler; no extra sleep
          }

          if (kind === "rate_limit") {
            telemetry.rateLimited += 1;
            const stated = err instanceof ProviderHttpError ? err.retryAfterMs : null;
            // No Retry-After? Back off by a whole spacing window, doubling per
            // attempt. Conservative on purpose: under-waiting here is what
            // produced 60 requests in 34 seconds.
            const wait = stated ?? scheduler.spacingMs * Math.pow(2, attempt + 1);
            scheduler.penalise(wait);
            if (wait > MAX_RATE_LIMIT_WAIT_MS) throw err;
            continue; // the pause is global; acquire() above will honour it
          }

          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, TRANSIENT_BACKOFF_MS * (attempt + 1)));
          }
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  };
}

function isTransportFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(message);
}

// ONE ENGINE CONTRACT, THREE PROVIDER DIALECTS.
//
// The engine hands over the same JSON Schema regardless of who is answering.
// This function is the entire provider-specific part of honouring it, and it
// degrades rather than failing:
//
//   json_schema   constrained decoding. The model CANNOT emit a shape that
//                 violates the contract, which is the actual fix for the seven
//                 malformed responses of 2026-08-30 -- retrying them at
//                 temperature 0 would only have reproduced them.
//   json_object   valid JSON guaranteed, shape not. Better than nothing.
//   nothing       the prompt already states the shape in prose, and the
//                 callers parse fenced output tolerantly.
export function responseFormat(
  cfg: Pick<OpenAICompatibleConfig, "jsonMode" | "capabilities">,
  request: Pick<ReasoningRequest, "expectJson" | "jsonSchema">,
): Record<string, unknown> {
  if (!request.expectJson) return {};
  if (cfg.jsonMode === "prompt_only") return {};

  if (request.jsonSchema && cfg.capabilities.supportsJsonSchema) {
    return {
      response_format: {
        type: "json_schema",
        json_schema: {
          // The name is required by the format and is not otherwise meaningful.
          name: "classmind_knowledge_items",
          // Strict is the point. Without it the schema is a suggestion.
          strict: true,
          schema: request.jsonSchema,
        },
      },
    };
  }

  return { response_format: { type: "json_object" } };
}

async function callOnce(
  cfg: OpenAICompatibleConfig,
  request: ReasoningRequest,
): Promise<ReasoningResponse> {
  const res = await fetch(`${cfg.baseUrl}chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      // Zero, always, on every provider. Two runs over the same lecture should
      // produce the same knowledge, and the reuse guard in processing_runs
      // assumes exactly that: it serves an earlier run's result on the grounds
      // that asking again would produce the same answer.
      temperature: 0,
      max_tokens: request.maxTokens ?? cfg.capabilities.maxCompletionTokens,
      ...responseFormat(cfg, request),
    }),
  });

  if (!res.ok) {
    // Body, not headers -- the request carried the key and must never be echoed.
    const detail = await res.text().catch(() => "");
    throw new ProviderHttpError(
      `${cfg.id} reasoning failed (${res.status}): ${detail.slice(0, 300)}`,
      res.status,
      classifyStatus(res.status),
      parseRetryAfter(res.headers),
    );
  }

  const body = (await res.json()) as {
    id?: string;
    model?: string;
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const choice = body.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (!text.trim()) throw new EmptyCompletionError(`${cfg.id} reasoning returned an empty completion.`);

  // Checked BEFORE parsing, so a truncated answer is reported as truncation
  // rather than as whatever the parser makes of half an array.
  if (choice?.finish_reason === "length") {
    throw new TruncatedCompletionError(
      `${cfg.id} stopped at the output limit after ${body.usage?.completion_tokens ?? "?"} tokens, ` +
        `so its answer is incomplete (asked for up to ${request.maxTokens ?? cfg.capabilities.maxCompletionTokens}).`,
    );
  }

  return {
    text,
    // What the provider says it used, falling back to what we asked for. A
    // provider silently serving a different model is worth seeing in the
    // ledger rather than assuming away.
    model: body.model ?? cfg.model,
    requestId: body.id ?? null,
    promptTokens: body.usage?.prompt_tokens ?? null,
    completionTokens: body.usage?.completion_tokens ?? null,
  };
}

// Exposed for scripts/test-provider-registry.mts. Which failures are worth
// asking again is a policy decision that cost a lecture's worth of knowledge to
// get wrong once and a whole quota to get wrong twice, so it is asserted rather
// than assumed.
export const __internals = {
  classifyStatus,
  parseRetryAfter,
  responseFormat,
  isTransportFailure,
  MAX_ATTEMPTS,
  MAX_RATE_LIMIT_WAIT_MS,
  TRANSIENT_BACKOFF_MS,
};
