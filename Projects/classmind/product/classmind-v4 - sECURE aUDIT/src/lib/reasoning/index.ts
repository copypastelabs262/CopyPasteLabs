import "server-only";
import { createSarvamReasoner } from "./sarvam.ts";
import { createOpenAICompatibleReasoner } from "./openai-compatible.ts";
import type { ProviderCapabilities, ReasoningProvider } from "./types.ts";

// THE REASONING PROVIDER REGISTRY.
//
// Which model answers is CONFIGURATION. Adding a provider is an entry in the
// table below; changing provider is one environment variable. Nothing outside
// this file names a model, and the processing engine never learns which one it
// is talking to.
//
// TWO RULES, BOTH STRUCTURAL RATHER THAN ADVISORY:
//
//   1. NO SILENT FALLBACK. An unset, unknown or unusable provider throws. It
//      used to return Sarvam unconditionally, which is how a paid transcription
//      credential came to be spending itself on reasoning. A missing
//      configuration is an error; it is never a reason to reach for whatever
//      key happens to be lying around.
//
//   2. SARVAM IS TRANSCRIPTION ONLY. Locked 2026-08-30. Its reasoning adapter
//      survives for future evaluation and is unusable without an explicit
//      ALLOW_PAID_REASONING=1, which is unset in development and production.
//      SARVAM_API_KEY is never read on the reasoning path unless the operator
//      has deliberately turned that switch on.

export interface ProviderSpec {
  id: string;
  // Paid providers need ALLOW_PAID_REASONING=1. This is the only thing standing
  // between a config typo and a bill.
  paid: boolean;
  keyEnv: string;
  // Required, not defaulted. A hardcoded model id is a model dependency wearing
  // a different hat, and the point of this file is not to have one.
  modelEnv: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  jsonMode: "response_format" | "prompt_only";
  capabilities: ProviderCapabilities;
  // Execution limits are the thing most likely to need tuning without a deploy
  // -- a tier changes, a quota is raised -- so they are overridable per
  // provider rather than baked in.
  rpmEnv: string;
  concurrencyEnv: string;
}

// Identical to the constants reconstruct.ts uses today. Phase 1A replaces the
// provider and nothing else: same windows, same caps, same prompts. Values live
// here so that a later phase can differ them per provider once the evaluation
// harness can prove what that costs.
// WINDOW SIZE AND TOKEN CAP ARE UNCHANGED and identical for every provider.
// Phase 1A replaced the provider and nothing else; changing how the lecture is
// divided changes recall, and that is an optimisation for after the evaluation
// harness exists. Only the EXECUTION limits differ per provider below.
const ENGINE_SHAPE = {
  maxWindowChars: 3_500,
  maxCompletionTokens: 4_000,
} as const;

export const REGISTRY: Record<string, ProviderSpec> = {
  gemini: {
    id: "gemini",
    paid: false,
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    baseUrlEnv: "GEMINI_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    jsonMode: "response_format",
    rpmEnv: "GEMINI_RPM",
    concurrencyEnv: "GEMINI_MAX_CONCURRENCY",
    capabilities: {
      ...ENGINE_SHAPE,
      supportsJsonSchema: true,
      // Free-tier Gemini Flash is documented around 10 RPM. Test A sent ~105
      // RPM and every request was rejected. Google no longer publishes fixed
      // per-project numbers, so this is the conservative published figure and
      // it is overridable the moment the real one is known.
      requestsPerMinute: 10,
      // Safe at any value because the scheduler, not this, enforces the rate.
      // Four keeps the pipeline full while the limiter spaces the requests.
      maxConcurrency: 4,
    },
  },
  groq: {
    id: "groq",
    paid: false,
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    baseUrlEnv: "GROQ_BASE_URL",
    defaultBaseUrl: "https://api.groq.com/openai/v1/",
    jsonMode: "response_format",
    rpmEnv: "GROQ_RPM",
    concurrencyEnv: "GROQ_MAX_CONCURRENCY",
    capabilities: {
      ...ENGINE_SHAPE,
      supportsJsonSchema: true,
      // Groq's free tier permits 30 RPM but only ~6,000 tokens per minute, and
      // a reconstruction window costs roughly 1,800. TOKENS are the binding
      // limit, so the honest request rate is about three per minute -- stating
      // 30 here would just rediscover Test A against a different quota.
      requestsPerMinute: 3,
      maxConcurrency: 2,
    },
  },
  ollama: {
    id: "ollama",
    paid: false,
    // Ollama ignores the credential; the adapter still sends one, and an empty
    // string would be indistinguishable from a missing key. A literal is what
    // the local runtime expects.
    keyEnv: "OLLAMA_API_KEY_UNUSED",
    modelEnv: "OLLAMA_MODEL",
    baseUrlEnv: "OLLAMA_BASE_URL",
    defaultBaseUrl: "http://localhost:11434/v1/",
    jsonMode: "prompt_only",
    rpmEnv: "OLLAMA_RPM",
    concurrencyEnv: "OLLAMA_MAX_CONCURRENCY",
    capabilities: {
      ...ENGINE_SHAPE,
      supportsJsonSchema: false,
      // No quota locally; the limit is the GPU. One at a time, because a 4 GB
      // card serving two requests at once is slower than serving them in turn.
      requestsPerMinute: 600,
      maxConcurrency: 1,
    },
  },
  sarvam: {
    id: "sarvam",
    // THE ONLY PAID ENTRY, AND IT IS DISABLED. See rule 2 above.
    paid: true,
    keyEnv: "SARVAM_API_KEY",
    modelEnv: "SARVAM_REASONING_MODEL_UNUSED",
    baseUrlEnv: "SARVAM_BASE_URL_UNUSED",
    defaultBaseUrl: "https://api.sarvam.ai/v1/",
    jsonMode: "prompt_only",
    rpmEnv: "SARVAM_RPM_UNUSED",
    concurrencyEnv: "SARVAM_MAX_CONCURRENCY_UNUSED",
    capabilities: {
      ...ENGINE_SHAPE,
      supportsJsonSchema: false,
      requestsPerMinute: 10,
      maxConcurrency: 4,
    },
  },
};

export type Plan =
  | {
      ok: true; spec: ProviderSpec; model: string; baseUrl: string; apiKey: string;
      // The spec's capabilities with any environment override applied. Callers
      // read THIS, never spec.capabilities, so an override cannot be honoured
      // in one place and ignored in another.
      capabilities: ProviderCapabilities;
    }
  | { ok: false; code: PlanFailure; message: string };

export type PlanFailure =
  | "no_provider_configured"
  | "unknown_provider"
  | "paid_provider_not_allowed"
  | "missing_key"
  | "missing_model";

// PURE. Takes an environment rather than reading process.env, so the rules
// above are testable offline without a key, a network, or a live database --
// which is the only way "there is no silent fallback to Sarvam" can be a
// checked claim instead of a comment.
export function planProvider(env: Record<string, string | undefined>): Plan {
  const name = (env.REASONING_PROVIDER ?? "").trim();
  const known = Object.keys(REGISTRY).join(", ");

  if (!name) {
    return {
      ok: false,
      code: "no_provider_configured",
      message:
        "REASONING_PROVIDER is not set, so no reasoning model is configured. Set it in .env.local " +
        `(one of: ${known}). This is deliberately an error rather than a default: reasoning used to ` +
        "fall back to Sarvam, and that fallback is what spent a transcription budget on processing.",
    };
  }

  const spec = REGISTRY[name];
  if (!spec) {
    return {
      ok: false,
      code: "unknown_provider",
      message: `REASONING_PROVIDER="${name}" is not a known provider. Known providers: ${known}.`,
    };
  }

  if (spec.paid && (env.ALLOW_PAID_REASONING ?? "") !== "1") {
    return {
      ok: false,
      code: "paid_provider_not_allowed",
      message:
        `"${spec.id}" is a PAID reasoning provider and is disabled. Sarvam is transcription only: ` +
        "once a transcript is stored, no processing step may call it again for that lecture. " +
        "It is kept as an adapter for future evaluation and needs ALLOW_PAID_REASONING=1, which " +
        "should stay unset in development and production.",
    };
  }

  const model = (env[spec.modelEnv] ?? "").trim();
  if (!model) {
    return {
      ok: false,
      code: "missing_model",
      message:
        `${spec.modelEnv} is not set. The model id is configuration, never a hardcoded default -- ` +
        "a default here would be a model dependency by another name.",
    };
  }

  // Ollama runs locally and authenticates nothing, so it is the one provider
  // for which an absent credential is the normal case rather than a mistake.
  const apiKey = (env[spec.keyEnv] ?? "").trim() || (spec.id === "ollama" ? "ollama" : "");
  if (!apiKey) {
    return {
      ok: false,
      code: "missing_key",
      message: `${spec.keyEnv} is not set, so provider "${spec.id}" cannot be used.`,
    };
  }

  const baseUrlRaw = (env[spec.baseUrlEnv] ?? "").trim() || spec.defaultBaseUrl;
  // A base URL without its trailing slash silently produces ".../v1chat/
  // completions" and a 404 that reads like an outage.
  const baseUrl = baseUrlRaw.endsWith("/") ? baseUrlRaw : `${baseUrlRaw}/`;

  // A malformed or nonsensical override is IGNORED rather than obeyed. Reading
  // GEMINI_RPM="fast" as 0 would divide the spacing by zero; reading it as
  // Infinity would remove the limiter entirely, which is the failure this
  // whole mechanism exists to prevent.
  const positiveInt = (raw: string | undefined, fallback: number): number => {
    const n = Number((raw ?? "").trim());
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };

  const capabilities: ProviderCapabilities = {
    ...spec.capabilities,
    requestsPerMinute: positiveInt(env[spec.rpmEnv], spec.capabilities.requestsPerMinute),
    maxConcurrency: positiveInt(env[spec.concurrencyEnv], spec.capabilities.maxConcurrency),
  };

  return { ok: true, spec, model, baseUrl, apiKey, capabilities };
}

export function getReasoningProvider(): ReasoningProvider {
  const plan = planProvider(process.env as Record<string, string | undefined>);
  if (!plan.ok) throw new Error(plan.message);

  // Sarvam keeps its own adapter: its endpoint is OpenAI-shaped but its auth
  // header is not, and rewriting a working paid adapter to prove a point about
  // uniformity would be changing something this phase is not allowed to touch.
  if (plan.spec.id === "sarvam") return createSarvamReasoner();

  // One provider instance per call, and reconstructLecture resolves it once per
  // lecture -- so the scheduler built inside it is shared by every window of
  // that run, which is exactly the coordination the rate limiter needs.
  return createOpenAICompatibleReasoner({
    id: plan.spec.id,
    model: plan.model,
    baseUrl: plan.baseUrl,
    apiKey: plan.apiKey,
    capabilities: plan.capabilities,
    jsonMode: plan.spec.jsonMode,
  });
}

// Can the pipeline reconstruct at all? Answered by the registry, NOT by asking
// whether a Sarvam key happens to exist -- which is what this function used to
// do, and which quietly made a transcription credential the gate on reasoning.
export function reasoningAvailable(): boolean {
  return planProvider(process.env as Record<string, string | undefined>).ok;
}

// Why not, in the operator's words. The extract route degrades honestly rather
// than reporting "no reasoning model is configured" for five different reasons.
export function reasoningUnavailableReason(): string | null {
  const plan = planProvider(process.env as Record<string, string | undefined>);
  return plan.ok ? null : plan.message;
}

export type { ReasoningProvider, ReasoningRequest, ReasoningResponse, ProviderCapabilities } from "./types.ts";
