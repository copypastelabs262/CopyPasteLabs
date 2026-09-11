import "server-only";
import { requireEnv } from "../env.ts";
import type { ReasoningProvider, ReasoningRequest, ReasoningResponse } from "./types.ts";

// Sarvam's chat completions endpoint, reached with the same subscription key
// the transcription adapter uses.
//
// Chosen over a general-purpose model for one reason that matters here: the
// lectures this product exists to read are code-switched Hindi/English, and the
// reasoning task is largely reference resolution across that code-switching
// ("vo project" -> the project described in the previous sentence). A model
// trained on Indic and code-mixed text is doing its native task; a model that
// treats Hinglish as noisy English is guessing.
//
// Relative imports with explicit extensions, matching src/lib/extraction. This
// module and its callers stay runnable by plain `node --conditions=react-server`,
// which is what lets the reconstruction suite exercise Layer 2 offline.
const ENDPOINT = "https://api.sarvam.ai/v1/chat/completions";
const MODEL = "sarvam-105b";

// WHAT IS WORTH ASKING TWICE.
//
// Measured on a live run: the same lecture extracted twice, minutes apart,
// stored 0 items and then 2 items, with the only difference being
// "Sarvam reasoning returned an empty completion" on one window. An empty
// completion is a 200 with a well-formed body and no content in it -- the
// provider did not refuse, it just produced nothing -- and it was the one
// failure mode NOT retried, because the original policy only knew about
// transport errors. That single omission is how a whole lecture came out empty.
//
// A 4xx is still never retried: that is a bad request, and repeating it just
// costs money. A 429 and a 5xx are the provider asking to be asked again.
function isRetryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // Transport. A reasoning call runs for tens of seconds and a dropped
  // connection part-way through is a real occurrence (observed as ECONNRESET).
  if (/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(message)) return true;
  // The empty completion. Nothing about the request caused it.
  if (/empty completion/i.test(message)) return true;
  // Rate limiting and provider-side faults.
  if (/Sarvam reasoning failed \((?:429|5\d\d)\)/.test(message)) return true;
  return false;
}

// Three attempts, not two. The second attempt exists for a dropped connection;
// the third exists because an empty completion has been observed to repeat
// once and then succeed. Backoff is linear and short -- the caller is inside a
// request with a 300-second budget, and only FAILING windows pay this cost.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_500;

// DISABLED ADAPTER. Sarvam is transcription only, locked 2026-08-30.
//
// The registry already refuses to hand this out without ALLOW_PAID_REASONING=1.
// This second check exists because the registry is not the only way to reach
// this function -- a direct import would bypass it -- and the rule this guards
// is the one whose violation is measured in money rather than in test failures.
// Two cheap checks beat one, when the failure mode is a bill.
function assertPaidReasoningAllowed(): void {
  if (process.env.ALLOW_PAID_REASONING === "1") return;
  throw new Error(
    "Sarvam reasoning is disabled. Sarvam is transcription only: once a transcript is stored, " +
      "no processing step may call it again for that lecture. This adapter is kept for future " +
      "provider evaluation and requires ALLOW_PAID_REASONING=1, which is unset by design. " +
      "Set REASONING_PROVIDER to a free provider instead.",
  );
}

export function createSarvamReasoner(): ReasoningProvider {
  assertPaidReasoningAllowed();
  return {
    id: "sarvam",
    model: MODEL,
    async complete(request: ReasoningRequest): Promise<ReasoningResponse> {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          return await callOnce(request);
        } catch (err) {
          lastError = err;
          if (!isRetryable(err)) throw err;
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  };
}

// Exposed for scripts/test-reconstruction.mts. Which failures are worth asking
// again is a policy decision that cost a lecture's worth of knowledge to get
// wrong, so it is asserted rather than assumed.
export const __internals = { isRetryable, MAX_ATTEMPTS };

async function callOnce(request: ReasoningRequest): Promise<ReasoningResponse> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "api-subscription-key": requireEnv("SARVAM_API_KEY"),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      // Zero, always. Two runs over the same lecture should produce the same
      // knowledge; a product whose memory changes when you re-process it is
      // not a memory.
      temperature: 0,
      max_tokens: request.maxTokens ?? 2000,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Sarvam reasoning failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await res.json()) as {
    id?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("Sarvam reasoning returned an empty completion.");

  return {
    text,
    model: MODEL,
    requestId: body.id ?? null,
    promptTokens: body.usage?.prompt_tokens ?? null,
    completionTokens: body.usage?.completion_tokens ?? null,
  };
}
