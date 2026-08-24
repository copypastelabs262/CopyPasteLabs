import "server-only";
import { requireEnv } from "@/lib/env";
import type { ReasoningProvider, ReasoningRequest, ReasoningResponse } from "@/lib/reasoning/types";

// Sarvam's chat completions endpoint, reached with the same subscription key
// the transcription adapter uses.
//
// Chosen over a general-purpose model for one reason that matters here: the
// lectures this product exists to read are code-switched Hindi/English, and the
// reasoning task is largely reference resolution across that code-switching
// ("vo project" -> the project described in the previous sentence). A model
// trained on Indic and code-mixed text is doing its native task; a model that
// treats Hinglish as noisy English is guessing.
const ENDPOINT = "https://api.sarvam.ai/v1/chat/completions";
const MODEL = "sarvam-105b";

export function createSarvamReasoner(): ReasoningProvider {
  return {
    id: "sarvam",
    model: MODEL,
    async complete(request: ReasoningRequest): Promise<ReasoningResponse> {
      // One retry, for the transport only. A reasoning call runs for tens of
      // seconds and a dropped connection part-way through is a real occurrence
      // (observed as ECONNRESET mid-run); losing a whole window's knowledge to
      // it would be silly. A 4xx is not retried -- that is a bad request and
      // repeating it just costs money.
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await callOnce(request);
        } catch (err) {
          lastError = err;
          const message = err instanceof Error ? err.message : String(err);
          if (!/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(message)) throw err;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  };
}

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
