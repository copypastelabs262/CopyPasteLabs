---
project: classmind
session_id: 2026-08-30T1947Z-cost-controls-provider-abstraction-and-groq
schema_version: 1
generated_by: End-Session/1.0.0 (hand-authored)
generated_at: 2026-08-30T19:47:00Z
---

# 2026-08-30 — The reasoning layer stops being Sarvam, and starts being measurable

## Starting state

The operator topped up the Sarvam account, uploaded no lecture, and by 13:21 UTC the account
returned `402 No credits available`. Nothing in the product could say where the money had gone.

`Projects/classmind/product/classmind-v2/` existed as an uncommitted fork. v1 was the reference
pipeline. Reasoning ran on `sarvam-105b` — the same credential as transcription.

## What was done

### 1. The money leak, found and closed

Two defects, both structural:

- **Layer 1 had an idempotency guard; Layer 2 — the paid layer — had none.** At `temperature: 0` a
  re-run produces byte-identical output at full price. `dev.log` recorded exactly that: the same
  lecture reconstructed twice, 63 s then 62 s.
- **The provider returned `prompt_tokens` and `completion_tokens` on every response and
  `runWindow` discarded them.** `stats.calls` was counted, returned in the API response, and stored
  nowhere. There had never been a way to answer "what did that run cost".

`processing_runs` (migration `20260830160000`, applied) is both halves: a six-column cache key
(transcript hash · method · version · provider · model) decides reuse, and the same row records the
cost. Only `outcome='succeeded' AND complete` is reusable — caching a partial pass would make a
transient provider failure permanent. `?force=1` overrides and is recorded as forced.

`LectureUpload.tsx` treated `ready` as needing extraction, so a lecture another path had already
processed was extracted again. Fixed.

### 2. Sarvam locked to transcription only

Recorded in root `CLAUDE.md`, both product `CLAUDE.md` files, and enforced in code. The registry
refuses to hand out the Sarvam reasoner without `ALLOW_PAID_REASONING=1`; `createSarvamReasoner()`
throws independently so a direct import cannot route around it. `reasoningAvailable()` no longer
reads `SARVAM_API_KEY` — that function was the actual coupling.

**The rule costs ~2 points of quality** (`sarvam-105b` scores 56.1 on romanized code-mixed input
vs Gemini Flash's 54.1 on Indi-RomCoM) and is worth it, because a model you cannot afford to call
cannot be iterated on.

### 3. Provider abstraction (Phase 1A)

One `openai-compatible` adapter serves Gemini, Groq, SambaNova, Mistral and Ollama — adding a
provider is a registry entry, not a file. `getReasoningProvider()` **throws** when
`REASONING_PROVIDER` is unset; there is no default, because the old default is what spent a
transcription budget on reasoning. Model ids are configuration with no hardcoded fallback.

### 4. The rate-limit storm, and the fix

First Groq-era run attempt on Gemini: **20 windows became ~60 requests in 34 seconds, all 429.**
Each window retried independently, three attempts each, four concurrent — retrying *into* a rate
limit, which converts "slow down" into a self-inflicted outage.

`scheduler.ts` makes the decision to slow down **once per run** instead of per window. Every HTTP
attempt queues, retries included. A 429 penalises the shared queue, so work that piles up during a
pause resumes spaced rather than bursting. Failures are now classified: 400/401/403/404 fatal and
never retried, 429 coordinated, 5xx and transport bounded-retry.

Result on the next run: **27 attempts for 20 windows at ~8.2 req/min**, against ~105/min before.

### 5. Structured output as an engine contract

Seven of twenty windows on `gemini-3.5-flash` returned prose or truncated arrays. At temperature 0
retrying reproduces the same malformed response, so retry is not the fix — constrained decoding is.

`ReasoningRequest.jsonSchema` is declared **by the engine**, transcribed verbatim from the
"Output shape" blocks already in the prompts. The adapter translates it per provider: strict
`json_schema` where supported, `json_object` where not, prose-only for Ollama. Same contract, three
dialects — which is what keeps output comparable when the model is swapped.

`finish_reason: "length"` now raises a named truncation error instead of surfacing as
`Expected ',' or ']' at position 1032`, which reads like a parser bug and is actually the provider
stopping early.

### 6. Provider migration: Gemini → Groq

**Gemini's real free-tier daily limit is far below the ~500 RPD cited by third-party sources.**
`gemini-3.5-flash` was refused after roughly **30 requests**, while `gemini-3.5-flash-lite`
succeeded seconds later on the same key — proving quotas are **per-model, not project-wide**. One
lecture run consumed a day's capacity.

Groq, verified against Groq's own documentation: `openai/gpt-oss-120b` at 30 RPM / 1,000 RPD /
8,000 TPM / **200,000 TPD**, strict schema support (only three Groq models have it —
`llama-3.3-70b-versatile` does **not**), and no training on customer data, account-wide.

A single ClassMind-shaped probe — real prompt, real schema, real window from this lecture, real
`locateQuote` verification — **passed all four criteria**: schema compliance 5/5 items, correct
Hinglish comprehension, and **verbatim Hinglish quoting**:

    LOCATED @654s "Monopolizing matlab ek hi service ke liye ek resource break nahi karna chahie..."

That last one was the real risk: a model that "corrects" Hinglish into English fails `locateQuote`,
every item is dropped, and the run reports success with no knowledge.

## Decisions made

Not written to `decisions.md`; recorded here as required, filing is a deliberate act.

1. **Sarvam is transcription only**, permanently. Reasoning adapter kept but disabled.
2. **Groq `openai/gpt-oss-120b` is the development provider**; Gemini `gemini-3.5-flash` retained as
   the quality reference for cross-provider comparison.
3. **The JSON output contract belongs to the engine**, not the provider.
4. **Option D — asymmetric context** approved in principle, not built: teaching stays windowed
   (local information, many items), actionable moves to one full-transcript call (distributed
   information, few items). Pass-level completeness agreed so a failed actionable pass cannot
   discard good teaching knowledge.

## Problems hit

- **Three extraction attempts, none completed.** 429 storm; then 8/20 JSON failures; then the test
  runner's HTTP client timed out at undici's 5-minute default and Next.js cancelled the handler
  mid-run. Nothing was written by any of them.
- **Groq charges rate-limit budget on the RESERVATION, not usage.** A call using 1,435 in + 1,950
  out was charged 5,435 = `input + max_tokens`. Sustained safe rate is therefore ~1.5 req/min, not
  the 5 that 8,000 TPM naively implies.
- **The consequence is architectural: at that rate a 20-window run takes ~20 minutes**, which
  exceeds undici's client timeout and, more importantly, **Vercel's `maxDuration = 300`.** The
  current architecture cannot run on a deployment at Groq's real token rate.

## Unresolved

- **No clean baseline run exists.** Every attempt failed for a different reason.
- The reuse guard and `?force=1` have never executed — both need a successful run first.
- Option D unbuilt; cross-window consolidation still absent (`dedupeByEvidence` merges by evidence
  overlap, which a 15-minute-apart obligation does not have).
- `Projects/classmind/product/classmind-v2 - Copy/` is a stray 2,306-file duplicate. Its
  `.env.local` is covered by the root `.gitignore`, so no credential exposure, but it should be
  deleted.

## Ending state

The reasoning layer is provider-independent, rate-limit-aware, cost-metered and schema-enforced.
**311 offline checks pass**; tsc and eslint clean. Groq is validated by probe. The Sarvam baseline
is untouched at 24 knowledge items / 28 evidence rows, and no Sarvam reasoning call was made.

## Next session should start with

Fixing the client timeout in `scripts/verify-processing-run.mts` (test tooling only), then the
clean 20-window baseline run on Groq. Budget ~109K of 200K daily tokens; roughly one attempt per
day. Then Option D.
