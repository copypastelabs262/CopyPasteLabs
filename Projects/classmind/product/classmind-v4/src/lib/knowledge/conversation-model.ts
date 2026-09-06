// The conversation contract, pure and importable from anywhere: routes, the
// server store, the UI, and the offline test suite.
//
// Everything that DECIDES lives here -- which scopes exist and what shape each
// one has, how a title is derived, how stored messages become the model's
// conversational context, and what an assistant message persists so a resumed
// conversation renders exactly what the student saw. The I/O half
// (conversations.ts) stays thin on purpose.

import type { AskTurn } from "./answer.ts";

// ---------------------------------------------------------------------------
// Scope -- the Global Ask foundation
// ---------------------------------------------------------------------------
//
// A conversation is grounded in ONE academic context boundary. 'lecture' and
// 'course' are live today; 'global' is representable end-to-end (schema,
// model, types) but no route serves it yet -- the future Global Ask widens
// retrieval over the same canonical knowledge, it does not need a new model.

export type ConversationScope = "lecture" | "course" | "global";

export interface ConversationContext {
  scope: ConversationScope;
  courseId: string | null;
  lectureId: string | null;
}

// The one constructor of a valid context. Given what the caller actually has,
// returns the scope those facts support -- or an error, never a guess.
export function planConversationContext(input: {
  courseId?: string | null;
  lectureId?: string | null;
}): ConversationContext | { error: string } {
  const courseId = input.courseId?.trim() || null;
  const lectureId = input.lectureId?.trim() || null;
  if (lectureId && !courseId) {
    return { error: "A lecture-scoped conversation needs its course." };
  }
  if (lectureId && courseId) return { scope: "lecture", courseId, lectureId };
  if (courseId) return { scope: "course", courseId, lectureId: null };
  return { scope: "global", courseId: null, lectureId: null };
}

// Does a stored conversation belong to the context a request arrived in? A
// conversation id is a client-supplied parameter; the stored row is the truth,
// and a mismatch is a refusal, not a correction.
export function contextMatches(
  stored: ConversationContext,
  requested: { courseId?: string | null; lectureId?: string | null },
): boolean {
  const courseId = requested.courseId?.trim() || null;
  const lectureId = requested.lectureId?.trim() || null;
  if (stored.scope === "global") return courseId === null && lectureId === null;
  if (stored.courseId !== courseId) return false;
  // A lecture conversation opened from its course surface is still itself;
  // asking INTO it from a different lecture is not.
  if (lectureId && stored.lectureId !== lectureId) return false;
  if (stored.scope === "course" && lectureId) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Titles -- deterministic, never a model call
// ---------------------------------------------------------------------------

export const DEFAULT_TITLE = "New conversation";
const TITLE_MAX = 64;

// The first question, tidied into a label: leading ask-boilerplate dropped,
// trailing punctuation trimmed, first letter raised, cut at a word boundary.
// "teach me cache scaling." -> "Cache scaling". Cheap, stable, good enough --
// a student recognises their own question.
const BOILERPLATE =
  /^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:teach me(?: about)?|explain(?: to me)?|tell me(?: about)?|what is|what are|what's|help me (?:understand|with|learn)|show me|give me)\s+/i;

export function deriveConversationTitle(firstQuestion: string): string {
  let t = firstQuestion.trim().replace(/\s+/g, " ");
  if (!t) return DEFAULT_TITLE;
  const stripped = t.replace(BOILERPLATE, "").trim();
  // Only use the stripped form when something meaningful survives -- "Explain."
  // must not become an empty title.
  if (stripped.length >= 3) t = stripped;
  t = t.replace(/[.?!\s]+$/g, "");
  if (!t) return DEFAULT_TITLE;
  if (t.length > TITLE_MAX) {
    const cut = t.slice(0, TITLE_MAX);
    const lastSpace = cut.lastIndexOf(" ");
    t = `${(lastSpace > TITLE_MAX / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------------
// Messages -- the stored thread and the model's context
// ---------------------------------------------------------------------------

export type MessageRole = "student" | "classmind";

// What an assistant message persists BESIDES its prose, so resuming renders
// exactly what was shown: the route chip, the degraded notice, the citation
// sources with their evidence. Provenance of an answer -- never knowledge,
// never retrieved from.
export interface AnswerPayload {
  route: string;
  degraded: boolean;
  knowledgeUnitsAvailable: number;
  sources: unknown[];
}

export interface StoredMessage {
  id: string;
  role: MessageRole;
  content: string;
  payload: AnswerPayload | null;
  seq: number;
  createdAt: string;
}

// How much of the stored thread rides into the model as conversational
// context. answer.ts caps again (MAX_TURNS/MAX_TURN_CHARS) -- these two caps
// are deliberately the same order of magnitude: recent exchanges carry a
// follow-up; a transcript of the whole conversation would drown retrieval.
export const CONTEXT_MESSAGES = 12;

export function messagesToHistory(messages: StoredMessage[]): AskTurn[] {
  return messages
    .slice(-CONTEXT_MESSAGES)
    .filter((m) => m.content.trim() !== "")
    .map((m) => ({ role: m.role, text: m.content }));
}

// Defensive parse of a payload read back from jsonb: a malformed row renders
// as a plain answer rather than crashing the thread.
export function parseAnswerPayload(value: unknown): AnswerPayload | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return {
    route: typeof v.route === "string" ? v.route : "model",
    degraded: v.degraded === true,
    knowledgeUnitsAvailable:
      typeof v.knowledgeUnitsAvailable === "number" ? v.knowledgeUnitsAvailable : 0,
    sources: Array.isArray(v.sources) ? v.sources : [],
  };
}
