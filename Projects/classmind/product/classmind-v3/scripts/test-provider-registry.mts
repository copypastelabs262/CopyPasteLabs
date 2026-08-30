// Self-test for the reasoning provider registry and its execution policy.
//
//   node --conditions=react-server scripts/test-provider-registry.mts
//
// OFFLINE AND FREE. No key, no network, no database. The rules this product's
// cost control rests on are all CHECKED here rather than asserted in comments:
//
//   1. There is no silent fallback. An unset, unknown or unusable provider is
//      an error.
//   2. Sarvam is transcription only. Its reasoning adapter cannot be reached
//      without an explicit, deliberate override.
//   3. Failures are classified. Fatal errors are never repeated, and 429 is
//      handled ONCE for the whole run rather than by every window separately.
//
// Rule 2 cost ~100 rupees to learn on 2026-08-30. Rule 3 cost a day's Gemini
// quota the same evening: 20 windows became ~60 requests in 34 seconds because
// each retried independently into a rate limit. Rules nobody tests come back.

import { planProvider, REGISTRY } from "../src/lib/reasoning/index.ts";
import { createOpenAICompatibleReasoner, __internals } from "../src/lib/reasoning/openai-compatible.ts";
import { createRequestScheduler, createTelemetry } from "../src/lib/reasoning/scheduler.ts";
import { __internals as engine } from "../src/lib/reasoning/reconstruct.ts";
import { createSarvamReasoner } from "../src/lib/reasoning/sarvam.ts";

let passed = 0;
const failures: string[] = [];

function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) { passed += 1; console.log(`  PASS  ${label}`); return; }
  failures.push(label);
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log("        " + JSON.stringify(detail).slice(0, 300));
}
const section = (t: string) => console.log(`\n--- ${t} ---`);

// A fully working Gemini environment, used as the base for every negative case
// so that each failure below is caused by exactly one missing thing.
const GOOD = {
  REASONING_PROVIDER: "gemini",
  GEMINI_API_KEY: "test-key-not-real",
  GEMINI_MODEL: "gemini-3.7-flash",
};

section("1. No silent fallback");

const unset = planProvider({});
check(!unset.ok && unset.code === "no_provider_configured",
  "an unset REASONING_PROVIDER is an ERROR, not a default", unset);

const unknown = planProvider({ REASONING_PROVIDER: "definitely-not-a-provider" });
check(!unknown.ok && unknown.code === "unknown_provider",
  "an unknown provider name is rejected and the known ones are named", unknown);

// THE REGRESSION THAT MATTERS. A Sarvam key sitting in the environment -- which
// is the NORMAL state, because transcription needs it -- must never rescue a
// broken reasoning configuration.
const withSarvamKeyPresent = planProvider({ SARVAM_API_KEY: "sk-transcription" });
check(!withSarvamKeyPresent.ok,
  "a present SARVAM_API_KEY does NOT satisfy an unset reasoning provider", withSarvamKeyPresent);
check(!withSarvamKeyPresent.ok && withSarvamKeyPresent.code === "no_provider_configured",
  "  ...and the reason given is the missing provider, not the missing key");

// Model is checked before key, so this isolates the key check by supplying the
// model. The claim under test is not the order of the checks -- it is that a
// broken Gemini stays broken instead of becoming Sarvam.
const geminiNoKeySarvamPresent = planProvider({
  REASONING_PROVIDER: "gemini", GEMINI_MODEL: "gemini-3.7-flash", SARVAM_API_KEY: "sk-transcription",
});
check(!geminiNoKeySarvamPresent.ok && geminiNoKeySarvamPresent.code === "missing_key",
  "a keyless Gemini fails on its OWN key, with a Sarvam key sitting right there",
  geminiNoKeySarvamPresent);

const brokenWithSarvamAvailable = [
  {},
  { REASONING_PROVIDER: "" },
  { REASONING_PROVIDER: "nonsense" },
  { REASONING_PROVIDER: "gemini" },
  { REASONING_PROVIDER: "gemini", GEMINI_MODEL: "m" },
  { REASONING_PROVIDER: "gemini", GEMINI_API_KEY: "k" },
  { REASONING_PROVIDER: "groq", GROQ_MODEL: "m" },
].map((e) => planProvider({ ...e, SARVAM_API_KEY: "sk-transcription" }));

check(brokenWithSarvamAvailable.every((p) => !p.ok),
  "NO broken configuration resolves, however available Sarvam is");
const codes = new Set(brokenWithSarvamAvailable.map((p) => (p.ok ? "ok" : p.code)));
check([...codes].every((c) => ["no_provider_configured", "unknown_provider", "missing_key", "missing_model"].includes(c)),
  "  ...and every one fails with a named, explainable reason", [...codes]);

section("2. Sarvam is transcription only");

const sarvamOff = planProvider({ REASONING_PROVIDER: "sarvam", SARVAM_API_KEY: "sk-x" });
check(!sarvamOff.ok && sarvamOff.code === "paid_provider_not_allowed",
  "sarvam reasoning is REFUSED even with a valid key present", sarvamOff);

const sarvamOn = planProvider({
  REASONING_PROVIDER: "sarvam", SARVAM_API_KEY: "sk-x",
  SARVAM_REASONING_MODEL_UNUSED: "sarvam-105b", ALLOW_PAID_REASONING: "1",
});
check(sarvamOn.ok, "the deliberate override still works, so this is a lock and not a wall", sarvamOn);

check(Object.entries(REGISTRY).filter(([, s]) => s.paid).map(([k]) => k).join(",") === "sarvam",
  "sarvam is the ONLY provider marked paid");

for (const flag of ["", "0", "true", "yes", "1 "]) {
  const p = planProvider({ REASONING_PROVIDER: "sarvam", SARVAM_API_KEY: "sk-x", ALLOW_PAID_REASONING: flag });
  check(!p.ok, `ALLOW_PAID_REASONING=${JSON.stringify(flag)} does not unlock it -- only exactly "1" does`);
}

let directImportThrew = false;
try { createSarvamReasoner(); } catch { directImportThrew = true; }
check(directImportThrew && process.env.ALLOW_PAID_REASONING !== "1",
  "importing the Sarvam reasoner directly ALSO throws, so the registry is not the only guard");

section("3. Configuration is required, never defaulted");

check(!planProvider({ REASONING_PROVIDER: "gemini", GEMINI_MODEL: "m" }).ok, "a missing API key is an error");
const noModel = planProvider({ REASONING_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
check(!noModel.ok && noModel.code === "missing_model",
  "a missing MODEL is an error -- no hardcoded model id anywhere", noModel);

const good = planProvider(GOOD);
check(good.ok, "a fully configured Gemini resolves");
check(good.ok && good.model === "gemini-3.7-flash", "the model comes from configuration");
check(good.ok && good.baseUrl === "https://generativelanguage.googleapis.com/v1beta/openai/",
  "the default base URL is Gemini's OpenAI-compatibility endpoint");

const slash = planProvider({ ...GOOD, GEMINI_BASE_URL: "https://example.test/v1" });
check(slash.ok && slash.baseUrl === "https://example.test/v1/",
  "a base URL missing its trailing slash is repaired, not turned into a 404");

section("4. Execution limits come from the provider, and are overridable");

check(good.ok && good.capabilities.requestsPerMinute === 10,
  "Gemini declares its own free-tier request rate", good.ok && good.capabilities);
check(good.ok && good.capabilities.maxConcurrency === 4, "and its own concurrency");

const overridden = planProvider({ ...GOOD, GEMINI_RPM: "3", GEMINI_MAX_CONCURRENCY: "1" });
check(overridden.ok && overridden.capabilities.requestsPerMinute === 3 && overridden.capabilities.maxConcurrency === 1,
  "both are overridable by environment without a code change",
  overridden.ok && overridden.capabilities);

for (const bad of ["0", "-5", "fast", "", "2.5", "Infinity"]) {
  const p = planProvider({ ...GOOD, GEMINI_RPM: bad });
  check(p.ok && p.capabilities.requestsPerMinute === 10,
    `a nonsense GEMINI_RPM=${JSON.stringify(bad)} is IGNORED, not obeyed`, p.ok && p.capabilities.requestsPerMinute);
}

// Groq's binding limit is tokens per minute, not requests, so its declared rate
// is the honest effective one rather than the headline 30 RPM.
check(REGISTRY.groq.capabilities.requestsPerMinute === 3,
  "groq's rate reflects its TOKEN limit, not its advertised request limit");
check(REGISTRY.ollama.capabilities.maxConcurrency === 1,
  "ollama runs one at a time -- a 4GB GPU is slower when it doubles up");

for (const id of Object.keys(REGISTRY)) {
  const spec = REGISTRY[id];
  const p = planProvider({
    REASONING_PROVIDER: id, [spec.keyEnv]: "k", [spec.modelEnv]: "some-model",
    ...(spec.paid ? { ALLOW_PAID_REASONING: "1" } : {}),
  });
  check(p.ok, `"${id}" resolves from configuration with no code change`, p);
}
check(planProvider({ REASONING_PROVIDER: "ollama", OLLAMA_MODEL: "qwen3:4b" }).ok, "ollama needs no API key");

section("5. Failures are classified, not lumped together");

const { classifyStatus, parseRetryAfter, MAX_ATTEMPTS, MAX_RATE_LIMIT_WAIT_MS } = __internals;

for (const st of [400, 401, 403, 404, 422]) {
  check(classifyStatus(st) === "fatal", `${st} is FATAL -- repeating it cannot succeed and only costs`);
}
check(classifyStatus(429) === "rate_limit", "429 is its own kind, not a transient error");
for (const st of [500, 502, 503, 504]) {
  check(classifyStatus(st) === "transient", `${st} is transient -- the provider faltered`);
}

check(parseRetryAfter(new Headers({ "retry-after": "7" })) === 7000, "Retry-After in seconds is honoured");
const parsedDate = parseRetryAfter(new Headers({ "retry-after": new Date(Date.now() + 30_000).toUTCString() })) ?? 0;
check(parsedDate > 25_000 && parsedDate <= 30_000, "Retry-After as an HTTP date is honoured", parsedDate);
check(parseRetryAfter(new Headers({})) === null, "a missing Retry-After is null, not zero");
check(parseRetryAfter(new Headers({ "retry-after": "soon" })) === null, "an unparseable Retry-After is null");

// A stub fetch driven by canned responses. Records every request, so attempt
// counts below are observed rather than inferred.
function stubFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fn = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers(r.headers ?? {}),
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? { error: { code: r.status } }),
    };
  }) as unknown as typeof fetch;
  return { fn, seen };
}

const OK_BODY = {
  id: "req-1", model: "gemini-3.7-flash",
  choices: [{ message: { content: '{"items":[]}' } }],
  usage: { prompt_tokens: 11, completion_tokens: 22 },
};

// 600 RPM -> 100 ms spacing, so the timing assertions are real but fast.
const CAPS = {
  maxWindowChars: 3500, maxCompletionTokens: 4000, supportsJsonSchema: true,
  requestsPerMinute: 600, maxConcurrency: 4,
};

function reasoner(jsonMode: "response_format" | "prompt_only" = "response_format") {
  const scheduler = createRequestScheduler(CAPS.requestsPerMinute);
  const telemetry = createTelemetry();
  return {
    provider: createOpenAICompatibleReasoner({
      id: "gemini", model: "gemini-3.7-flash",
      baseUrl: "https://example.test/v1beta/openai/", apiKey: "secret-key",
      capabilities: CAPS, jsonMode,
    }, scheduler, telemetry),
    telemetry, scheduler,
  };
}

const realFetch = globalThis.fetch;
try {
  section("6. The adapter speaks the provider's dialect, and the engine does not");
  {
    const { fn, seen } = stubFetch([{ status: 200, body: OK_BODY }]);
    globalThis.fetch = fn;
    const { provider, telemetry } = reasoner();
    const res = await provider.complete({ system: "S", user: "U", expectJson: true, maxTokens: 4000 });
    const body = JSON.parse(String(seen[0].init.body));

    check(seen[0].url === "https://example.test/v1beta/openai/chat/completions", "posts to chat/completions", seen[0].url);
    check((seen[0].init.headers as Record<string, string>).authorization === "Bearer secret-key", "authenticates with a bearer token");
    check(body.temperature === 0, "temperature is 0 -- the reuse guard assumes re-asking gives the same answer");
    check(body.messages[0].role === "system" && body.messages[1].role === "user", "system and user are separate messages");
    check(body.response_format?.type === "json_object", "expectJson becomes response_format for this provider");
    check(res.promptTokens === 11 && res.completionTokens === 22, "usage is returned so the ledger can meter it");
    check(telemetry.httpAttempts === 1 && telemetry.succeeded === 1 && telemetry.retries === 0,
      "one call, one attempt, no retries", telemetry);
  }
  {
    const { fn, seen } = stubFetch([{ status: 200, body: OK_BODY }]);
    globalThis.fetch = fn;
    const { provider } = reasoner("prompt_only");
    await provider.complete({ system: "S", user: "U", expectJson: true });
    const body = JSON.parse(String(seen[0].init.body));
    check(body.response_format === undefined,
      "the SAME expectJson:true sends no response_format to a provider that does not want one");
    check(body.max_tokens === 4000, "an unset maxTokens falls back to the provider's capability");
  }

  section("7. Fatal errors are never retried");
  for (const status of [400, 401, 403, 404]) {
    const { fn, seen } = stubFetch([{ status }]);
    globalThis.fetch = fn;
    const { provider, telemetry } = reasoner();
    let threw = false;
    try { await provider.complete({ system: "S", user: "U", expectJson: true }); } catch { threw = true; }
    check(threw && seen.length === 1, `${status} makes EXACTLY ONE request and gives up`, { attempts: seen.length });
    check(telemetry.fatal === 1 && telemetry.retries === 0, `  ...counted as fatal, not retried`, telemetry);
  }

  section("8. Transient errors still retry");
  {
    const { fn, seen } = stubFetch([{ status: 503 }, { status: 503 }, { status: 200, body: OK_BODY }]);
    globalThis.fetch = fn;
    const { provider, telemetry } = reasoner();
    const res = await provider.complete({ system: "S", user: "U", expectJson: true });
    check(res.text.length > 0 && seen.length === 3, "503 twice then success: three attempts, then an answer", { attempts: seen.length });
    check(telemetry.retries === 2 && telemetry.succeeded === 1, "  ...counted as two retries and one success", telemetry);
  }
  {
    const { fn } = stubFetch([{ status: 200, body: { ...OK_BODY, choices: [{ message: { content: "  " } }] } }]);
    globalThis.fetch = fn;
    const { provider, telemetry } = reasoner();
    let threw = false;
    try { await provider.complete({ system: "S", user: "U", expectJson: true }); } catch { threw = true; }
    check(threw && telemetry.httpAttempts === MAX_ATTEMPTS,
      "an empty completion is transient and exhausts the attempt budget", telemetry);
  }

  section("9. 429 is coordinated and bounded -- NO RETRY STORM");
  {
    // THE TEST A REGRESSION. Four windows in flight, every request rejected.
    // Old behaviour: 4 x 3 = 12 requests as fast as the network allowed.
    // Required behaviour: still bounded, and SPACED, because the pause one
    // window receives applies to all of them.
    const { fn, seen } = stubFetch([{ status: 429 }]);
    globalThis.fetch = fn;
    const scheduler = createRequestScheduler(600);
    const telemetry = createTelemetry();
    const provider = createOpenAICompatibleReasoner({
      id: "gemini", model: "m", baseUrl: "https://example.test/v1/", apiKey: "k",
      capabilities: CAPS, jsonMode: "response_format",
    }, scheduler, telemetry);

    const started = Date.now();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => provider.complete({ system: "S", user: "U", expectJson: true })),
    );
    const elapsed = Date.now() - started;

    check(results.every((r) => r.status === "rejected"), "every window fails honestly rather than hanging");
    check(seen.length <= 4 * MAX_ATTEMPTS,
      `total requests are BOUNDED at windows x attempts (${seen.length} <= ${4 * MAX_ATTEMPTS})`, seen.length);
    check(telemetry.rateLimited === seen.length, "every rejection is counted as rate-limited", telemetry);
    check(telemetry.succeeded === 0, "and none is counted as a successful call", telemetry);
    check(elapsed > 400, `the run SLOWED DOWN globally instead of bursting (${elapsed}ms)`, elapsed);
  }
  {
    const { fn, seen } = stubFetch([{ status: 429, headers: { "retry-after": "600" } }]);
    globalThis.fetch = fn;
    const { provider, scheduler } = reasoner();
    let threw = false;
    try { await provider.complete({ system: "S", user: "U", expectJson: true }); } catch { threw = true; }
    check(threw && seen.length === 1,
      `a Retry-After beyond the ${MAX_RATE_LIMIT_WAIT_MS}ms cap fails the window immediately`, { attempts: seen.length });
    check(scheduler.pausedForMs() > 100_000,
      "  ...but the scheduler is still penalised, so the rest of the run backs off", scheduler.pausedForMs());
  }
} finally {
  globalThis.fetch = realFetch;
}

section("10. The scheduler spaces requests globally");
{
  const sch = createRequestScheduler(600);
  check(sch.spacingMs === 100, "spacing is derived from RPM", sch.spacingMs);
  const started = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => sch.acquire()));
  const elapsed = Date.now() - started;
  check(elapsed >= 380, `5 CONCURRENT acquires are serialised into 5 spaced slots (${elapsed}ms)`, elapsed);
}
{
  const sch = createRequestScheduler(600);
  sch.penalise(300);
  check(sch.pausedForMs() > 250, "a penalty registers globally", sch.pausedForMs());
  const started = Date.now();
  await sch.acquire();
  check(Date.now() - started >= 250, "the next acquire waits out the global pause");
}
{
  // A penalty must push the QUEUE, not just the clock -- otherwise everything
  // that piled up during the pause fires the instant it lifts, which is a
  // second burst immediately after the provider asked for fewer.
  const sch = createRequestScheduler(600);
  sch.penalise(200);
  const started = Date.now();
  await Promise.all([sch.acquire(), sch.acquire(), sch.acquire()]);
  check(Date.now() - started >= 380, "queued work resumes SPACED, not all at once");
}
{
  const sch = createRequestScheduler(0);
  check(Number.isFinite(sch.spacingMs) && sch.spacingMs > 0,
    "a nonsense RPM of 0 does not produce an infinite or zero spacing", sch.spacingMs);
}

section("11. The output contract is the ENGINE's, translated per provider");

// Schemas are plain JSON. Walking one needs indexed access that `unknown`
// cannot express without a cast at every step, so the escape hatch is
// declared once here rather than scattered through the assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonNode = Record<string, any>;

const { responseFormat } = __internals;
const capsSchema = { ...CAPS, supportsJsonSchema: true };
const capsNoSchema = { ...CAPS, supportsJsonSchema: false };
const SCHEMA = engine.TEACHING_SCHEMA;

{
  const rf = responseFormat({ jsonMode: "response_format", capabilities: capsSchema },
    { expectJson: true, jsonSchema: SCHEMA }) as JsonNode;
  check(rf.response_format?.type === "json_schema", "a schema-capable provider is asked with json_schema", rf);
  check(rf.response_format?.json_schema?.strict === true,
    "  ...and strictly, because a non-strict schema is only a suggestion");
  check(rf.response_format?.json_schema?.schema === SCHEMA, "  ...carrying the ENGINE's schema unchanged");
}
{
  const rf = responseFormat({ jsonMode: "response_format", capabilities: capsNoSchema },
    { expectJson: true, jsonSchema: SCHEMA }) as JsonNode;
  check(rf.response_format?.type === "json_object",
    "a provider without schema support degrades to json_object, not to nothing", rf);
}
{
  const rf = responseFormat({ jsonMode: "prompt_only", capabilities: capsSchema },
    { expectJson: true, jsonSchema: SCHEMA });
  check(Object.keys(rf).length === 0,
    "a prompt-only provider (ollama) is sent no response_format -- the prompt still states the shape");
}
{
  const rf = responseFormat({ jsonMode: "response_format", capabilities: capsSchema }, { expectJson: false });
  check(Object.keys(rf).length === 0, "a prose request (the student answer composer) asks for no JSON");
}

// The schema must say the SAME THING the prompt says. If these drift, the model
// is told one contract and constrained to another.
{
  const a = engine.ACTIONABLE_SCHEMA as JsonNode;
  const kinds = a.properties.items.items.properties.kind.enum;
  const roles = a.properties.items.items.properties.evidence.items.properties.role.enum;
  check(kinds.join(",") === "assignment,deadline,exam_instruction,announcement",
    "the actionable schema's kinds are exactly the prompt's kinds", kinds);
  check(roles.join(",") === "introduces,requires,step,deadline,context",
    "the actionable schema's evidence roles are exactly the prompt's roles", roles);
}
{
  const t = engine.TEACHING_SCHEMA as JsonNode;
  const kinds = t.properties.items.items.properties.kind.enum;
  const roles = t.properties.items.items.properties.evidence.items.properties.role.enum;
  check(kinds.join(",") === "topic,concept,comparison,procedure,example",
    "the teaching schema's kinds are exactly the prompt's kinds", kinds);
  check(roles.join(",") === "explains", "the teaching schema's evidence role is exactly the prompt's role", roles);
}

// Strict mode is rejected outright unless every object closes itself and lists
// every property as required. A schema that fails this returns 400 on EVERY
// window -- the one failure mode worse than malformed JSON.
function strictOk(node: JsonNode | undefined, path = "root"): string[] {
  const bad: string[] = [];
  if (node?.type === "object") {
    if (node.additionalProperties !== false) bad.push(path + ": additionalProperties must be false");
    const props = Object.keys(node.properties ?? {});
    const req: string[] = node.required ?? [];
    for (const k of props) if (!req.includes(k)) bad.push(path + "." + k + ": not in required");
    for (const k of props) bad.push(...strictOk(node.properties[k], path + "." + k));
  }
  if (node?.type === "array") bad.push(...strictOk(node.items, path + "[]"));
  return bad;
}
for (const [name, sch] of [["actionable", engine.ACTIONABLE_SCHEMA], ["teaching", engine.TEACHING_SCHEMA]] as const) {
  const bad = strictOk(sch as JsonNode);
  check(bad.length === 0, "the " + name + " schema satisfies strict mode at every level", bad);
}

section("12. A truncated answer is reported as truncation, and not retried");
{
  const saved = globalThis.fetch;
  const { fn, seen } = stubFetch([{
    status: 200,
    body: { ...OK_BODY, choices: [{ message: { content: '{"items":[{"title":"cut' }, finish_reason: "length" }] },
  }]);
  globalThis.fetch = fn;
  try {
    const { provider, telemetry } = reasoner();
    let message = "";
    try { await provider.complete({ system: "S", user: "U", expectJson: true }); }
    catch (e) { message = e instanceof Error ? e.message : String(e); }
    check(/stopped at the output limit/i.test(message),
      "finish_reason 'length' is named as truncation, not surfaced as a parser error", message);
    check(seen.length === 1,
      "  ...and is NOT retried -- at temperature 0 the same request truncates identically", { attempts: seen.length });
    check(telemetry.retries === 0, "  ...so no retry is counted", telemetry);
  } finally { globalThis.fetch = saved; }
}


console.log(`\n--- Summary ---\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
