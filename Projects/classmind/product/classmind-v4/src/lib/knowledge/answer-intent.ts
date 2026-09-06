// What kind of answer is the student actually asking for?
//
// The routing layer (ask-routing.ts) decides WHETHER the model is needed.
// This module decides, once the model IS needed, HOW it should answer -- a
// definition, a lesson, an analogy, an example, a comparison, more depth, or
// a continuation of the conversation. Before 2026-09-06 every model answer
// was forced through one shape ("two or three sentences"), which made "teach
// me X" and "what is X" indistinguishable -- the single biggest weakness of
// the student experience.
//
// Pure and dependency-free so the truth table is pinned offline
// (scripts/test-answer-intent.mts) and the classification costs nothing.
//
// Order matters: the more specific signals win. "Explain cache scaling like
// I'm 5" contains both "explain" and the ELI5 marker; the ELI5 marker is the
// student's actual request.

export type AnswerIntent =
  | "eli5"        // simplest possible explanation, analogy-first
  | "example"     // a concrete example of the concept in play
  | "stepbystep"  // structured, one-piece-at-a-time teaching
  | "detail"      // substantially deeper treatment
  | "teach"       // a lesson, not a definition
  | "compare"     // similarities/differences
  | "why"         // motivation/purpose/causality
  | "followup"    // continues the conversation; answer THE follow-up only
  | "explain";    // default: clear, genuinely explanatory answer

const ELI5 = /\b(like i'?m (?:a )?(?:5|five)|eli ?5|five[- ]year[- ]old|in simple (?:terms|words)|simply|as simply as|layman'?s)\b/i;
const EXAMPLE = /\b(example|examples|for instance|instance of|illustrat\w+|show me how|demonstrate)\b/i;
const STEPBYSTEP = /\b(step[- ]by[- ]step|one step at a time|walk (?:me )?through|step at a time)\b/i;
const DETAIL = /\b(in detail|in depth|detailed|deeper|deep dive|thorough(?:ly)?|elaborate|comprehensive)\b/i;
const TEACH = /\b(teach|tutor|help me (?:learn|understand|study)|i want to learn|learn about)\b/i;
const COMPARE = /\b(compare|comparison|difference|differences|differ|versus|vs\.?|distinguish|contrast)\b/i;
const WHY = /^\s*why\b|\bwhy\s+(?:is|are|do|does|did|would|should|use|need)\b/i;

// Signals that the question leans on the conversation rather than standing
// alone: bare pronouns for the thing under discussion, do-overs, "another".
const ANAPHORIC =
  /\b(that|this|it|again|another|one more|more of|didn'?t (?:under)?stand|don'?t (?:under)?stand|differently|rephrase|simpler|confus\w+|what does that mean|say that)\b/i;

export function classifyAnswerIntent(question: string, hasHistory: boolean): AnswerIntent {
  const q = question.trim();
  if (ELI5.test(q)) return "eli5";
  if (STEPBYSTEP.test(q)) return "stepbystep";
  if (EXAMPLE.test(q)) return "example";
  if (DETAIL.test(q)) return "detail";
  if (COMPARE.test(q)) return "compare";
  if (TEACH.test(q)) return "teach";
  if (WHY.test(q)) return "why";
  // Only a question that leans on prior turns is a follow-up. A self-contained
  // question mid-conversation ("what is virtualization?") is answered on its
  // own terms; nothing above matched, so the anaphora test decides.
  if (hasHistory && (ANAPHORIC.test(q) || q.split(/\s+/).length <= 4)) return "followup";
  return "explain";
}

// The per-intent teaching guidance appended to the system prompt. One block
// each, written as instructions about SHAPE and DEPTH -- the grounding rules
// (what may be said at all) live in the base prompt and apply to every
// intent equally.
export const INTENT_GUIDANCE: Record<AnswerIntent, string> = {
  explain: `SHAPE: a clear, genuinely explanatory answer. The FIRST sentence
states what the thing is -- commit to it; no "generally refers to" hedging.
Then explain the core mechanism in a few sentences. Define any term of art the
first time you use it. A short concrete example is welcome when it earns its
place. Aim for a tight paragraph or two -- enough to actually understand,
never padding.`,

  teach: `SHAPE: a short lesson, not a definition. Start from the intuition --
why this concept exists and what problem it solves. Then how it works, built up
in order, connecting each part to the last. Use one concrete example. Where the
lecture's own framing or terminology appears in the units, teach through it.
End with a one-sentence takeaway, and where natural, one short question the
student could test themselves with. Use headings or a list only if they truly
help; this is teaching, not a report.`,

  eli5: `SHAPE: explain it to a smart child. Open with a single everyday analogy
and carry it through. No jargon -- if a technical word is unavoidable, say what
it means in the same breath. Keep it short and warm. Then, in one or two
sentences, connect the analogy back to the real concept and its real name so
the simplification never becomes a wrong belief.`,

  detail: `SHAPE: a substantially deeper treatment, in layers: the concept, the
mechanism (how it actually works, part by part), a worked example, then
trade-offs, limits or failure modes -- but ONLY where the units or sound
general reasoning support them. Structure with short headings or a list where
it helps scanning. Depth means more mechanism and more connections, never
restating the same idea in more words. Do not pad.`,

  example: `SHAPE: one concrete, worked example -- specific systems, numbers or
situations, not abstract placeholders. Walk through what happens and point at
the moment the concept is doing its work, so the example ILLUMINATES the idea
rather than restating its definition. If the units contain the lecturer's own
example, use that one first and say so. A second example only if it shows a
genuinely different facet.`,

  stepbystep: `SHAPE: structured, progressive teaching. Break the concept into
small numbered steps, one idea per step, each building on the previous. Keep
every step short. Do not dump everything at once; the sequence IS the teaching.
After the final step, one sentence tying the steps back into the whole.`,

  compare: `SHAPE: a comparison the student can hold onto. One sentence on what
each thing is, then the differences that actually matter, organised by the few
dimensions that distinguish them (a compact list or table-like structure is
fine). Say when you'd use one over the other if the units or sound reasoning
support it. Do not manufacture differences the material doesn't support.`,

  why: `SHAPE: answer the "why" directly -- purpose, motivation, or cause,
whichever the question is really asking. Name the problem that exists without
the thing, then how the thing addresses it. A brief example of the difference
it makes is welcome. Stay on the why; don't drift into a full re-explanation
of the what.`,

  followup: `SHAPE: this continues the conversation shown above. Answer THE
FOLLOW-UP and only it, in the context of what was already discussed -- do not
restart the topic or repeat the previous answer. If the student says they
didn't understand, take a genuinely different angle (new analogy, new example,
simpler framing), don't re-serve the same explanation louder. If they ask for
"another" of something, give a genuinely different one.`,
};
