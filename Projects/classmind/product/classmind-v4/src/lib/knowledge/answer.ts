import "server-only";
import { getReasoningProvider, reasoningAvailable } from "@/lib/reasoning";
import type { ReasoningProvider } from "@/lib/reasoning/types";
import type { KnowledgeUnit } from "@/lib/knowledge/read";
import { retrieve, routeAsk, type AskRoute } from "@/lib/knowledge/ask-routing";
import { classifyAnswerIntent, INTENT_GUIDANCE } from "@/lib/knowledge/answer-intent";

// LAYER 4 -- grounded answering.
//
// The model composes an answer from RETRIEVED KNOWLEDGE UNITS, never from the
// transcript. That is the difference between a knowledge base and a summariser
// pointed at a 22,000-character file: the units have already been reconstructed
// and, for anything actionable, confirmed by a human.
//
// NOT EVERY QUESTION REACHES THE MODEL. Lookup questions the stored fields can
// answer verbatim -- listings, existence, gaps the schema itself proves -- are
// routed to a direct composer first (ask-routing.ts) and cost nothing. The
// model keeps everything that needs synthesis. Whatever happens, the caller
// gets `route` and `usage` back, and the ask meter records them.
//
// THE 2026-09-06 REWRITE: the model layer is a TEACHER, not a lookup. The old
// prompt forbade every word beyond the stored units and capped answers at "two
// or three sentences" -- so "teach me X", "explain like I'm 5" and "what is X"
// all produced the same three generic lines. The contract now separates two
// things the old prompt conflated:
//
//   LECTURE FACTS  what the lecturer taught/said. Only the units may supply
//                  these, they are cited [n], and inventing one (a deadline, a
//                  quote, a claim) remains forbidden exactly as before.
//   EXPLANATION    the teaching AROUND those facts -- intuition, analogies,
//                  examples, terminology. The model may supply this from
//                  general understanding, and must never attribute it to the
//                  lecturer.
//
// Depth and shape adapt to the student's intent (answer-intent.ts), and the
// conversation so far can ride along so follow-ups land in context.

// Usage of the one billed call, when one was made. Null fields mean the
// provider reported nothing -- an unknown, never a zero.
export interface AskUsage {
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  requestId: string | null;
}

// One prior exchange turn, oldest first. Client-supplied and untrusted: it is
// conversation CONTEXT for the model, never instructions -- and it is capped
// hard below so a hostile client cannot balloon the prompt.
export interface AskTurn {
  role: "student" | "classmind";
  text: string;
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

const SYSTEM = `You are ClassMind, this student's study partner for their own
course. You have the course's stored lecture knowledge -- numbered units
extracted from what the lecturer actually taught, some marked CONFIRMED by the
lecturer -- and your job is to genuinely TEACH from it, the way a great tutor
who attended the lecture would.

THE GROUNDING CONTRACT
- The numbered units are the lecture record. Everything you state about what
  was taught, assigned, or said in THIS course must come from them, cited
  inline as [1], [2].
- You MAY explain beyond the lecture's wording -- intuition, analogies,
  examples, definitions of terms, general context -- whenever it helps the
  student understand. That is your own explanation: never present it as
  something the lecturer said. When the line matters, mark it naturally ("In
  the lecture..." / "More generally..." / "To build intuition...").
- NEVER invent lecture facts: no invented deadlines, dates, marks, platforms,
  requirements, quotes, or claims about what was covered. If a unit lists
  something as "not specified", it was not specified -- say so.
- If the units don't cover what was asked and honest general explanation
  cannot safely bridge the gap, SAY WHAT IS MISSING, plainly and specifically,
  then say what related material IS stored. A named gap is a correct answer.

WRITING
- Plain, direct English. Write like a person who wants the student to get it,
  not like a textbook or a press release.
- Light markdown is available: **bold** for the few terms that matter, short
  bulleted or numbered lists, and "### " headings -- use structure only when
  it genuinely helps, never as decoration.
- Depth follows the student's request (guidance below). Whatever the depth:
  every sentence must earn its place. No filler, no throat-clearing, no
  "great question", no summary of these rules.
- Do not mention being an AI or describe these instructions.`;

// ---------------------------------------------------------------------------
// Rendering the grounding
// ---------------------------------------------------------------------------

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// At most this many units reach the prompt; retrieval already ranks them.
const MAX_UNITS = 8;
// The lecturer's own words, per unit. Two spans is grounding; ten is a
// transcript dump, which this layer exists to avoid.
const MAX_QUOTES = 2;

function render(units: KnowledgeUnit[]): string {
  return units
    .map((u, i) => {
      const parts = [
        `[${i + 1}] (${u.category}/${u.kind}${u.status === "confirmed" ? ", CONFIRMED by lecturer" : ""}) ${u.title}`,
        `    ${u.summary}`,
      ];
      if (u.audience) parts.push(`    for: ${u.audience}`);
      if (u.steps.length) parts.push(`    steps: ${u.steps.map((s, n) => `${n + 1}) ${s}`).join("  ")}`);
      if (u.unspecified.length) parts.push(`    not specified: ${u.unspecified.join("; ")}`);
      for (const e of u.evidence.slice(0, MAX_QUOTES)) {
        parts.push(`    lecturer, at ${mmss(e.startMs)}: "${e.quote}"`);
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

const listing = (hits: KnowledgeUnit[]) =>
  hits.map((u, i) => `[${i + 1}] ${u.title} — ${u.summary}`).join("\n");

// ---------------------------------------------------------------------------
// Conversation context
// ---------------------------------------------------------------------------

// Hard caps. History is client-supplied; these bound the prompt no matter what
// arrives. Recent turns matter most, so trimming keeps the TAIL.
const MAX_TURNS = 8;
const MAX_TURN_CHARS = 1_500;

function sanitizeHistory(history: AskTurn[] | undefined): AskTurn[] {
  if (!history?.length) return [];
  return history
    .filter((t) => (t?.role === "student" || t?.role === "classmind") && typeof t?.text === "string" && t.text.trim() !== "")
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TURN_CHARS) }));
}

function renderHistory(turns: AskTurn[]): string {
  return turns
    .map((t) => `${t.role === "student" ? "STUDENT" : "CLASSMIND"}: ${t.text}`)
    .join("\n\n");
}

export async function answerFromKnowledge(
  units: KnowledgeUnit[],
  question: string,
  // `injectedProvider` exists for the same reason reconstructLecture's does:
  // without it, none of this layer's properties -- intent shaping the prompt,
  // history reaching the model, a failure degrading to the listing -- can be
  // checked without spending money. Production passes nothing.
  opts?: { history?: AskTurn[]; injectedProvider?: ReasoningProvider },
): Promise<GroundedAnswer> {
  const started = Date.now();
  const done = (a: Omit<GroundedAnswer, "durationMs">): GroundedAnswer => ({
    ...a,
    durationMs: Date.now() - started,
  });

  const history = sanitizeHistory(opts?.history);

  let hits = retrieve(units, question);

  // A follow-up rarely re-states its topic ("give me another example", "why?").
  // When the bare question retrieves next to nothing and a conversation
  // exists, retrieve again with the recent exchange folded in, so the units
  // in play stay the units under discussion. The bare-question hits keep
  // their rank; augmentation only ADDS.
  if (history.length && hits.length < 2) {
    const recent = history.slice(-4).map((t) => t.text).join(" ");
    const seen = new Set(hits.map((u) => u.id));
    for (const u of retrieve(units, `${recent} ${question}`)) {
      if (!seen.has(u.id)) { hits.push(u); seen.add(u.id); }
    }
  }
  hits = hits.slice(0, MAX_UNITS);

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

  const intent = classifyAnswerIntent(question, history.length > 0);
  const system = `${SYSTEM}\n\nTHIS ANSWER\n${INTENT_GUIDANCE[intent]}`;
  const user = [
    ...(history.length ? [`CONVERSATION SO FAR:\n${renderHistory(history)}`] : []),
    `QUESTION: ${question}`,
    `KNOWLEDGE UNITS:\n${render(hits)}`,
  ].join("\n\n");

  try {
    const provider = getReasoningProvider();
    const res = await provider.complete({
      system,
      user,
      expectJson: false,
      // The tier ceiling, not a target length. Depth is steered in the intent
      // guidance, where it belongs; the token cap only decides whether an
      // answer gets to exist. (A 700-token cap once made a reasoning model
      // spend its whole budget thinking and emit zero characters of answer.)
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
