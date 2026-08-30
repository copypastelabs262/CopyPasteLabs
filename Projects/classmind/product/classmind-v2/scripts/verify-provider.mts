// ONE real call to the configured reasoning provider. Nothing else.
//
//   node --conditions=react-server --env-file=.env.local scripts/verify-provider.mts
//
// Answers the three questions that cannot be answered offline, and answers them
// for the price of a single completion:
//
//   1. Does the configured model id actually exist on THIS account?
//   2. Does the key work?
//   3. Does the response come back in the shape the adapter expects, including
//      usage -- which the processing ledger meters and therefore depends on?
//
// It also prints whatever rate-limit headers the provider returns, because
// Google no longer publishes fixed free-tier numbers and the response headers
// are the only per-project truth available without opening a dashboard.
//
// THE KEY IS NEVER PRINTED. Not in the plan, not in an error body.

import { planProvider } from "../src/lib/reasoning/index.ts";
import { createOpenAICompatibleReasoner } from "../src/lib/reasoning/openai-compatible.ts";

const plan = planProvider(process.env as Record<string, string | undefined>);
if (!plan.ok) {
  console.error(`\nNO PROVIDER: [${plan.code}]\n${plan.message}\n`);
  process.exit(1);
}
if (plan.spec.id === "sarvam") {
  console.error("\nRefusing to verify Sarvam as a reasoning provider. Sarvam is transcription only.\n");
  process.exit(1);
}

console.log("--- Configuration ---");
console.log("  provider :", plan.spec.id);
console.log("  model    :", plan.model);
console.log("  base URL :", plan.baseUrl);
console.log("  key      : present, length", plan.apiKey.length, "(never printed)");
console.log("  json mode:", plan.spec.jsonMode);
console.log("  schema   :", plan.capabilities.supportsJsonSchema ? "strict json_schema" : "json_object fallback");
console.log("  rpm      :", plan.capabilities.requestsPerMinute, "| concurrency:", plan.capabilities.maxConcurrency);

// Capture the response headers on the way past. The adapter deliberately does
// not surface them -- they are provider trivia, not something the engine should
// learn about -- but this script is the one place they are worth reading.
const realFetch = globalThis.fetch;
let headers: Headers | null = null;
let status = 0;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  const res = await realFetch(...args);
  headers = res.headers;
  status = res.status;
  return res;
}) as typeof fetch;

const provider = createOpenAICompatibleReasoner({
  id: plan.spec.id,
  model: plan.model,
  baseUrl: plan.baseUrl,
  apiKey: plan.apiKey,
  capabilities: plan.capabilities,
  jsonMode: plan.spec.jsonMode,
});

// The smallest request that still exercises everything the pipeline relies on:
// a system/user split, JSON mode, and a parseable object coming back. A dozen
// tokens, not a lecture.
const started = Date.now();
try {
  const res = await provider.complete({
    system: "Identify the language of the sentence and answer with the required object.",
    user: 'What language is this sentence written in: "Aaj hum cloud computing padhenge"?',
    expectJson: true,
    // SCHEMA MODE, not just "please reply with JSON". Asking the easy way would
    // prove nothing about the mechanism the pipeline depends on -- and an
    // unsupported response_format returns 400, which is fatal and unretried, so
    // it would fail all twenty windows of a real run. One call finds that out.
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "lang"],
      properties: { ok: { type: "boolean" }, lang: { type: "string" } },
    },
    maxTokens: 200,
  });
  const ms = Date.now() - started;

  console.log("\n--- Result ---");
  console.log("  HTTP status      :", status);
  console.log("  latency          :", ms, "ms");
  console.log("  model reported   :", res.model);
  console.log("  request id       :", res.requestId ?? "(none)");
  console.log("  prompt tokens    :", res.promptTokens ?? "(not reported)");
  console.log("  completion tokens:", res.completionTokens ?? "(not reported)");
  console.log("  raw text         :", JSON.stringify(res.text).slice(0, 300));

  let parsed: unknown = null;
  try { parsed = JSON.parse(res.text.replace(/^```(?:json)?|```$/gm, "").trim()); } catch { /* reported below */ }
  console.log("  parses as JSON   :", parsed !== null ? "YES" : "NO");

  // The ledger records prompt_tokens and completion_tokens. A provider that
  // reports neither would leave every run's cost unknown, which is the exact
  // blindness Phase 0 exists to remove -- so it is worth failing loudly here
  // rather than discovering it after a hundred runs.
  if (res.promptTokens === null && res.completionTokens === null) {
    console.log("\n  WARNING: this provider reported NO token usage. processing_runs will record");
    console.log("  nulls, and per-run cost will be unknowable for this provider.");
  }
} catch (err) {
  console.error("\n--- FAILED ---");
  console.error(" ", err instanceof Error ? err.message : String(err));
  console.error("\n  If this is a 400 mentioning response_format or schema, this provider does NOT");
  console.error("  accept strict json_schema -- set supportsJsonSchema false for it in the registry.");
  console.error("\n  If this is a 404, the model id is wrong or not available on this account.");
  console.error("  If this is a 429, the free tier is exhausted for now.");
  console.error("  Either way: change GEMINI_MODEL in .env.local. Do not switch to Sarvam.");
  process.exitCode = 1;
} finally {
  globalThis.fetch = realFetch;
}

if (headers) {
  const h = headers as Headers;
  const interesting = [...h.keys()].filter((k) => /ratelimit|quota|retry-after/i.test(k)).sort();
  console.log("\n--- Observed quota headers ---");
  if (!interesting.length) console.log("  (none returned by this provider)");
  for (const k of interesting) console.log(`  ${k}: ${h.get(k)}`);
}
