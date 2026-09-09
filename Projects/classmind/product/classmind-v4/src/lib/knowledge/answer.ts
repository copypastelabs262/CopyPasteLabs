import "server-only";
// Relative imports, not "@/" aliases: this module is exercised offline by
// scripts/test-answer-intent.mts under plain node, which cannot resolve the
// alias -- same convention as the reasoning engine.
import { getReasoningProvider, reasoningAvailable } from "../reasoning/index.ts";
import type { ReasoningProvider } from "../reasoning/types.ts";
import type { KnowledgeUnit } from "./read.ts";
import { retrieve, routeAsk, type AskRoute } from "./ask-routing.ts";
import { classifyAnswerIntent, INTENT_GUIDANCE } from "./answer-intent.ts";

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
- CITATION DISCIPLINE: a sentence carrying [n] may contain only facts the
  cited unit actually supports. Illustrative numbers, systems and scenarios
  you supply yourself are welcome but NEVER carry a citation -- state the
  grounded point with its [n] first, then run your example or analogy after
  it, uncited. When one sentence would mix a lecture fact with your own
  reasoning, split it: the fact takes the [n], the reasoning takes none.
- FACTS vs RECOMMENDATIONS: when you advise, prioritise or suggest what to do
  ("start with this", "this needs attention first"), that is YOUR
  recommendation -- say so in your own voice, uncited, and never present it
  as something the lecturer or the record states. The recorded facts the
  recommendation rests on keep their citations.
- The units can contain speech-recognition artifacts (odd spellings, phonetic
  errors). Teach with the correct term; never point the student at the
  artifact.
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

// Where an answer is allowed to look, and therefore what each unit must be
// LABELLED with. A lecture-scoped answer needs no labels (everything is this
// lecture); a subject-scoped answer names the lecture each fact came from
// ("which lecture covered X" is a real question); a global answer names the
// subject AND the lecture, because a cross-subject fact without its subject
// is a fact from nowhere.
export interface AnswerContext {
  scope: "lecture" | "course" | "global";
  courseNames?: Map<string, string>;
  // Subjects the global fan-out cap left unread. Almost always zero; when it
  // isn't, the SUBJECTS line must say so, because a truncated world presented
  // as complete makes the model confidently deny work that exists.
  subjectsOmitted?: number;
}

// At most this many units reach the prompt; retrieval already ranks them.
const MAX_UNITS = 8;
// The lecturer's own words, per unit. Two spans is grounding; ten is a
// transcript dump, which this layer exists to avoid.
const MAX_QUOTES = 2;

// PER-FIELD CEILINGS (added 2026-09-07, security audit).
//
// MAX_UNITS and MAX_QUOTES bound how MANY things reach the prompt. Nothing
// bounded how BIG each one is, and none of these fields has a length constraint
// anywhere behind it: knowledge_items.title and .summary are `text`, steps and
// unspecified are `jsonb` arrays, and both writers -- a model reconstructing a
// transcript, and a faculty edit at /api/knowledge/{id}/review -- stored
// whatever they were handed.
//
// So prompt size was a value a course owner could choose, and prompt size is
// billed per token on every question any of their students asks. The write path
// now refuses oversized edits; this is the same bound applied where it actually
// costs money, so it also holds for rows written before that check existed and
// for anything a model produces.
//
// Truncation is MARKED, never silent: a model shown a sentence that stops
// mid-word with no indication will confidently complete it.
const MAX_TITLE_CHARS = 300;
const MAX_SUMMARY_CHARS = 1_500;
const MAX_STEP_CHARS = 400;
const MAX_STEPS_RENDERED = 12;
const MAX_UNSPECIFIED_RENDERED = 8;
const MAX_QUOTE_CHARS = 500;
const MAX_LABEL_CHARS = 200;

function clip(value: string, max: number): string {
  const v = String(value ?? "");
  return v.length <= max ? v : `${v.slice(0, max)}... [truncated]`;
}

function render(units: KnowledgeUnit[], context?: AnswerContext): string {
  return units
    .map((u, i) => {
      const parts = [
        `[${i + 1}] (${u.category}/${u.kind}${u.status === "confirmed" ? ", CONFIRMED by lecturer" : ""}) ${clip(u.title, MAX_TITLE_CHARS)}`,
        `    ${clip(u.summary, MAX_SUMMARY_CHARS)}`,
      ];
      if (context?.scope === "course") {
        parts.push(`    lecture: ${clip(u.lectureTitle, MAX_LABEL_CHARS)}`);
      } else if (context?.scope === "global") {
        const subject = context.courseNames?.get(u.courseId);
        parts.push(
          `    from: ${clip(subject ?? "another subject", MAX_LABEL_CHARS)} — ${clip(u.lectureTitle, MAX_LABEL_CHARS)}`,
        );
      }
      if (u.audience) parts.push(`    for: ${clip(u.audience, MAX_LABEL_CHARS)}`);
      if (u.steps.length) {
        parts.push(
          `    steps: ${u.steps
            .slice(0, MAX_STEPS_RENDERED)
            .map((s, n) => `${n + 1}) ${clip(s, MAX_STEP_CHARS)}`)
            .join("  ")}`,
        );
      }
      if (u.unspecified.length) {
        parts.push(
          `    not specified: ${u.unspecified
            .slice(0, MAX_UNSPECIFIED_RENDERED)
            .map((g) => clip(g, MAX_STEP_CHARS))
            .join("; ")}`,
        );
      }
      for (const e of u.evidence.slice(0, MAX_QUOTES)) {
        parts.push(`    lecturer, at ${mmss(e.startMs)}: "${clip(e.quote, MAX_QUOTE_CHARS)}"`);
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
  opts?: { history?: AskTurn[]; context?: AnswerContext; injectedProvider?: ReasoningProvider },
): Promise<GroundedAnswer> {
  const started = Date.now();
  const done = (a: Omit<GroundedAnswer, "durationMs">): GroundedAnswer => ({
    ...a,
    durationMs: Date.now() - started,
  });

  const history = sanitizeHistory(opts?.history);

  let hits = retrieve(units, question);

  // A follow-up rarely re-states its topic ("give me another example", "why?").
  // Whenever a conversation exists, retrieve AGAIN with the recent exchange
  // folded in and merge, so the units under discussion stay in play. Always --
  // not only when the bare question found little: retrieve()'s short-words
  // fallback returns the FIRST units rather than none, which once made
  // "give me a real-world example" look well-retrieved while carrying zero
  // units about the topic being discussed, and the model then (honestly, per
  // its grounding) denied knowing the topic. The bare-question hits keep
  // their rank; augmentation only ADDS.
  if (history.length) {
    const recent = history.slice(-4).map((t) => t.text).join(" ");
    const seen = new Set(hits.map((u) => u.id));
    for (const u of retrieve(units, `${recent} ${question}`)) {
      if (!seen.has(u.id)) { hits.push(u); seen.add(u.id); }
    }
  }
  hits = hits.slice(0, MAX_UNITS);

  // The free path first. It can answer some questions retrieval alone cannot
  // ("any assignments?" with zero term overlap), so it runs before the
  // no-hits return below. The attribution rides along so a cross-subject
  // listing can group by subject without a model call.
  const routed = routeAsk(question, units, hits, {
    courseNames: opts?.context?.scope === "global" ? opts.context.courseNames : undefined,
  });
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
  const provider =
    opts?.injectedProvider ?? (reasoningAvailable() ? getReasoningProvider() : null);
  if (!provider) {
    return done({
      question, answered: true, usedUnits: hits, answer: listing(hits),
      degraded: true, route: "degraded", usage: null, failure: null,
    });
  }

  const intent = classifyAnswerIntent(question, history.length > 0);
  const system = `${SYSTEM}\n\nTHIS ANSWER\n${INTENT_GUIDANCE[intent]}`;
  // A global answer reasons over the student's whole academic world, so the
  // model is told what that world IS -- the subjects in scope -- before the
  // retrieved units. Nothing outside this list exists for the answer.
  const omitted = opts?.context?.subjectsOmitted ?? 0;
  const subjectsLine =
    opts?.context?.scope === "global" && opts.context.courseNames?.size
      ? [
          `THE STUDENT'S SUBJECTS: ${[...opts.context.courseNames.values()].join(" | ")}` +
            (omitted > 0
              ? ` (and ${omitted} more subject${omitted === 1 ? "" : "s"} NOT searched here — say so if asked about everything)`
              : ""),
        ]
      : [];
  const user = [
    ...subjectsLine,
    ...(history.length ? [`CONVERSATION SO FAR:\n${renderHistory(history)}`] : []),
    `QUESTION: ${question}`,
    `KNOWLEDGE UNITS:\n${render(hits, opts?.context)}`,
  ].join("\n\n");

  try {
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

// Exposed for scripts/test-answer-intent.mts -- the prompt contract and the
// pure mechanics this layer's claims rest on, checkable without a model.
export const __internals = { SYSTEM, render, sanitizeHistory, renderHistory, MAX_TURNS, MAX_TURN_CHARS };
