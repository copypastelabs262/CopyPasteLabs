import "server-only";
import { getReasoningProvider, reasoningAvailable } from "@/lib/reasoning";
import { retrieve, type KnowledgeUnit } from "@/lib/knowledge/read";
import { routeAsk, type AskRoute } from "@/lib/knowledge/ask-routing";

// LAYER 4 -- grounded answering.
//
// The model composes an answer from RETRIEVED KNOWLEDGE UNITS, never from the
// transcript. That is the difference between a knowledge base and a summariser
// pointed at a 22,000-character file: the units have already been reconstructed
// and, for anything actionable, confirmed by a human.
//
// The model is given nothing but the units, so it has nothing to hallucinate
// from, and it is told to cite units by number so every sentence in the answer
// can be traced to a stored item and from there to a timestamp in the audio.
//
// NOT EVERY QUESTION REACHES THE MODEL. Lookup questions the stored fields can
// answer verbatim -- listings, existence, gaps the schema itself proves -- are
// routed to a direct composer first (ask-routing.ts) and cost nothing. The
// model keeps everything that needs synthesis. Whatever happens, the caller
// gets `route` and `usage` back, and the ask meter records them.

// Usage of the one billed call, when one was made. Null fields mean the
// provider reported nothing -- an unknown, never a zero.
export interface AskUsage {
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  requestId: string | null;
}

export interface GroundedAnswer {
  question: string;
  answered: boolean;
  answer: string;
  usedUnits: KnowledgeUnit[];
  // Kept alongside `route` for wire compatibility: true exactly when the
  // answer came from the fallback listing because no model was available or
  // the call failed. A DIRECT answer is not degraded -- it is the stored
  // knowledge answering in its own words, on purpose.
  degraded: boolean;
  route: AskRoute;
  usage: AskUsage | null;
  durationMs: number;
  // The model failure behind a degraded answer, for the meter. Never sent to
  // the student -- the fallback listing is the user-facing story.
  failure: string | null;
}

const SYSTEM = `You answer a student's question about a lecture, using ONLY the
numbered knowledge units supplied. Those units were extracted from the lecture
and, where marked CONFIRMED, checked by the lecturer.

RULES
1. Use only the supplied units. Never fill a gap with general knowledge about
   the subject, and never pad.
2. If the units do not contain what was asked, SAY WHAT IS MISSING, plainly and
   specifically -- "the stored lecture knowledge doesn't record who the
   assignment is for" -- then say briefly what related information IS stored.
   A named gap is a correct answer; a vague filler sentence is not.
3. Never invent a deadline, date, mark, platform or requirement. If a unit
   lists something under "not specified", say it was not specified.
4. Cite the units you used as [1], [2] and so on, inline.
5. Answer in plain English, briefly. Two or three sentences for a simple
   question; a short list for a multi-step task.
6. Do not mention that you are an AI, and do not describe these rules.`;

function render(units: KnowledgeUnit[]): string {
  return units
    .map((u, i) => {
      const parts = [
        `[${i + 1}] (${u.category}/${u.kind}${u.status === "confirmed" ? ", CONFIRMED by lecturer" : ""}) ${u.title}`,
        `    ${u.summary}`,
      ];
      if (u.steps.length) parts.push(`    steps: ${u.steps.map((s, n) => `${n + 1}) ${s}`).join("  ")}`);
      if (u.unspecified.length) parts.push(`    not specified: ${u.unspecified.join("; ")}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

const listing = (hits: KnowledgeUnit[]) =>
  hits.map((u, i) => `[${i + 1}] ${u.title} — ${u.summary}`).join("\n");

export async function answerFromKnowledge(
  units: KnowledgeUnit[],
  question: string,
): Promise<GroundedAnswer> {
  const started = Date.now();
  const done = (a: Omit<GroundedAnswer, "durationMs">): GroundedAnswer => ({
    ...a,
    durationMs: Date.now() - started,
  });

  const hits = retrieve(units, question);

  // The free path first. It can answer some questions retrieval alone cannot
  // ("any assignments?" with zero term overlap), so it runs before the
  // no-hits return below.
  const routed = routeAsk(question, units, hits);
  if (routed.route === "direct") {
    return done({
      question, answered: true, answer: routed.direct.answer,
      usedUnits: routed.direct.usedUnits,
      degraded: false, route: "direct", usage: null, failure: null,
    });
  }

  if (!hits.length) {
    return done({
      question, answered: false, usedUnits: [],
      degraded: false, route: "no_knowledge", usage: null, failure: null,
      answer:
        "Nothing in this course's stored lecture knowledge covers that yet. " +
        "Only material extracted from processed lectures can be answered from.",
    });
  }

  // Without a model the product still answers -- it just lists what it found
  // instead of composing prose, and says so.
  if (!reasoningAvailable()) {
    return done({
      question, answered: true, usedUnits: hits, answer: listing(hits),
      degraded: true, route: "degraded", usage: null, failure: null,
    });
  }

  try {
    const provider = getReasoningProvider();
    const res = await provider.complete({
      system: SYSTEM,
      user: `QUESTION: ${question}\n\nKNOWLEDGE UNITS:\n${render(hits)}`,
      expectJson: false,
      // The tier ceiling, not a guess at how long the answer should be.
      // sarvam-105b is a reasoning model: it spends most of its budget thinking
      // before it writes anything, and a 700-token cap made it emit three
      // thousand characters of reasoning and ZERO characters of answer, every
      // time, silently falling back to a listing. Brevity is asked for in the
      // prompt, where it belongs; the token cap only decides whether an answer
      // gets to exist.
      maxTokens: 4000,
    });
    return done({
      question, answered: true, answer: res.text.trim(), usedUnits: hits,
      degraded: false, route: "model", failure: null,
      usage: {
        provider: provider.id,
        model: res.model || provider.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        requestId: res.requestId,
      },
    });
  } catch (err) {
    // A model outage must not take the feature down; fall back to the same
    // listing the no-model path produces. The failure travels to the meter,
    // not to the student.
    return done({
      question, answered: true, usedUnits: hits, answer: listing(hits),
      degraded: true, route: "degraded", usage: null,
      failure: err instanceof Error ? err.message : String(err),
    });
  }
}
