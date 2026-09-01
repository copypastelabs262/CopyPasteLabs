import "server-only";
import { getReasoningProvider, reasoningAvailable } from "@/lib/reasoning";
import { retrieve, type KnowledgeUnit } from "@/lib/knowledge/read";

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

export interface GroundedAnswer {
  question: string;
  answered: boolean;
  answer: string;
  usedUnits: KnowledgeUnit[];
  // Set when the answer came from retrieval alone, because no model was
  // configured. Stated rather than hidden -- the two are not the same product.
  degraded: boolean;
}

const SYSTEM = `You answer a student's question about a lecture, using ONLY the
numbered knowledge units supplied. Those units were extracted from the lecture
and, where marked CONFIRMED, checked by the lecturer.

RULES
1. Use only the supplied units. If they do not answer the question, say so
   plainly. Never fill a gap with general knowledge about the subject.
2. Never invent a deadline, date, mark, platform or requirement. If a unit lists
   something under "not specified", say it was not specified.
3. Cite the units you used as [1], [2] and so on, inline.
4. Answer in plain English, briefly. Two or three sentences for a simple
   question; a short list for a multi-step task.
5. Do not mention that you are an AI, and do not describe these rules.`;

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

export async function answerFromKnowledge(
  units: KnowledgeUnit[],
  question: string,
): Promise<GroundedAnswer> {
  const hits = retrieve(units, question);
  if (!hits.length) {
    return {
      question, answered: false, usedUnits: [], degraded: false,
      answer:
        "Nothing in this course's stored lecture knowledge covers that yet. " +
        "Only material extracted from processed lectures can be answered from.",
    };
  }

  // Without a model the product still answers -- it just lists what it found
  // instead of composing prose, and says so.
  if (!reasoningAvailable()) {
    return {
      question, answered: true, usedUnits: hits, degraded: true,
      answer: hits.map((u, i) => `[${i + 1}] ${u.title} — ${u.summary}`).join("\n"),
    };
  }

  try {
    const res = await getReasoningProvider().complete({
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
    return { question, answered: true, answer: res.text.trim(), usedUnits: hits, degraded: false };
  } catch {
    // A model outage must not take the feature down; fall back to the same
    // listing the no-model path produces.
    return {
      question, answered: true, usedUnits: hits, degraded: true,
      answer: hits.map((u, i) => `[${i + 1}] ${u.title} — ${u.summary}`).join("\n"),
    };
  }
}
