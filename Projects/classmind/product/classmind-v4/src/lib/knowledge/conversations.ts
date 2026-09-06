import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingSchemaError } from "../provenance/audio-identity.ts";
import {
  DEFAULT_TITLE,
  deriveConversationTitle,
  parseAnswerPayload,
  type AnswerPayload,
  type ConversationContext,
  type StoredMessage,
} from "./conversation-model.ts";

// THE CONVERSATION STORE -- the I/O half of conversation-model.ts.
//
// Thin on purpose: every decision (scope shapes, titles, context caps, payload
// parsing) lives in the pure model where it is tested offline. This file only
// moves rows, and it moves them under two invariants:
//
//   OWNERSHIP IS IN EVERY QUERY. Each read and write filters owner_id to the
//   session user. There is no code path that touches another user's rows, so
//   "a student cannot read another student's conversation" is structural --
//   the query that could do it does not exist. (RLS is on with zero policies
//   besides, exactly like every product table: only the service role reaches
//   these tables at all.)
//
//   AN UNAPPLIED MIGRATION DEGRADES, NEVER BREAKS. Until 20260906150000 is
//   applied, every function reports { state: "unavailable" } through the same
//   missing-schema predicate the rest of the product uses, the ask route
//   answers exactly as before, and the UI falls back to the ephemeral
//   conversation. Persistence is lost; nothing else is.
//
// The client is injected (callers pass serviceClient()) for the same reason
// ensureProfile's is: the verify script exercises these exact functions
// against the real database without resolving "@/" aliases under plain node.

export interface ConversationRow {
  id: string;
  scope: ConversationContext["scope"];
  courseId: string | null;
  lectureId: string | null;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export type StoreState = "ok" | "unavailable";

const UNAVAILABLE =
  "Conversations are not stored yet -- migration 20260906150000 has not been applied. " +
  "This conversation lives only on this page.";

// Errors go to the SERVER log; the wire gets a safe sentence. A raw Postgres
// message on the wire once shipped "invalid input syntax for type uuid: ..."
// to the browser -- diagnostic detail is the operator's, not the caller's.
function degradeNote(error: { message?: string | null } | null | undefined): string {
  if (error && isMissingSchemaError(error)) return UNAVAILABLE;
  console.error("[conversations] store error:", error?.message ?? "unknown");
  return "Conversations are unavailable right now. This exchange was not saved.";
}

// A resumed thread is read newest-first under this bound, then re-sorted
// ascending -- if a thread ever exceeds it, the OLDEST messages fall off the
// render, never the recent ones a student came back for.
const MESSAGE_READ_LIMIT = 400;

function rowToConversation(r: Record<string, unknown>): ConversationRow {
  return {
    id: r.id as string,
    scope: r.scope as ConversationRow["scope"],
    courseId: (r.course_id as string | null) ?? null,
    lectureId: (r.lecture_id as string | null) ?? null,
    title: (r.title as string) || DEFAULT_TITLE,
    createdAt: r.created_at as string,
    lastMessageAt: r.last_message_at as string,
  };
}

function rowToMessage(r: Record<string, unknown>): StoredMessage {
  return {
    id: r.id as string,
    role: r.role as StoredMessage["role"],
    content: (r.content as string) ?? "",
    payload: parseAnswerPayload(r.payload),
    seq: Number(r.seq),
    createdAt: r.created_at as string,
  };
}

export async function listConversations(
  svc: SupabaseClient,
  ownerId: string,
  where: { courseId?: string; lectureId?: string; limit?: number },
): Promise<{ state: StoreState; note: string | null; conversations: ConversationRow[] }> {
  let q = svc
    .from("conversations")
    .select("id, scope, course_id, lecture_id, title, created_at, last_message_at")
    .eq("owner_id", ownerId)
    .order("last_message_at", { ascending: false })
    .limit(where.limit ?? 20);
  if (where.lectureId) {
    // Course AND lecture: the URL's course is the surface the caller was
    // authorised for, and a lecture id from another course must find nothing
    // here rather than list threads the surface cannot continue.
    q = q.eq("lecture_id", where.lectureId);
    if (where.courseId) q = q.eq("course_id", where.courseId);
  } else if (where.courseId) {
    q = q.eq("course_id", where.courseId).eq("scope", "course");
  }
  const { data, error } = await q;
  if (error) return { state: "unavailable", note: degradeNote(error), conversations: [] };
  return { state: "ok", note: null, conversations: (data ?? []).map(rowToConversation) };
}

// The cross-course read behind "pick up where you left off" on the student
// home. Same ownership filter; no scope filter, because the point is
// everything recent.
export async function listRecentConversations(
  svc: SupabaseClient,
  ownerId: string,
  limit: number,
): Promise<{ state: StoreState; conversations: ConversationRow[] }> {
  const { data, error } = await svc
    .from("conversations")
    .select("id, scope, course_id, lecture_id, title, created_at, last_message_at")
    .eq("owner_id", ownerId)
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (error) return { state: "unavailable", conversations: [] };
  return { state: "ok", conversations: (data ?? []).map(rowToConversation) };
}

export async function getConversation(
  svc: SupabaseClient,
  ownerId: string,
  conversationId: string,
): Promise<
  | { state: "ok"; conversation: ConversationRow; messages: StoredMessage[] }
  | { state: "unavailable"; note: string }
  | { state: "not_found" }
> {
  const { data, error } = await svc
    .from("conversations")
    .select("id, scope, course_id, lecture_id, title, created_at, last_message_at")
    .eq("id", conversationId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) return { state: "unavailable", note: degradeNote(error) };
  // Absent and not-yours are the SAME answer on purpose: a 404 that
  // distinguishes them confirms to a guesser that the id exists.
  if (!data) return { state: "not_found" };

  const { data: rows, error: msgError } = await svc
    .from("conversation_messages")
    .select("id, role, content, payload, seq, created_at")
    .eq("conversation_id", conversationId)
    .eq("owner_id", ownerId)
    .order("seq", { ascending: false })
    .limit(MESSAGE_READ_LIMIT);
  if (msgError) return { state: "unavailable", note: degradeNote(msgError) };
  return {
    state: "ok",
    conversation: rowToConversation(data),
    messages: (rows ?? []).map(rowToMessage).reverse(),
  };
}

export async function createConversation(
  svc: SupabaseClient,
  ownerId: string,
  context: ConversationContext,
): Promise<{ state: StoreState; note: string | null; conversation: ConversationRow | null }> {
  const { data, error } = await svc
    .from("conversations")
    .insert({
      owner_id: ownerId,
      scope: context.scope,
      course_id: context.courseId,
      lecture_id: context.lectureId,
    })
    .select("id, scope, course_id, lecture_id, title, created_at, last_message_at")
    .single();
  if (error || !data) {
    return { state: "unavailable", note: degradeNote(error), conversation: null };
  }
  return { state: "ok", note: null, conversation: rowToConversation(data) };
}

// One exchange, appended atomically enough for this product: the student
// message, the assistant message, then the conversation's activity stamp and
// (on the first exchange) its derived title. A failure anywhere reports
// unavailable -- the caller still returns the answer; only persistence is
// lost, and the note says so.
export async function appendExchange(
  svc: SupabaseClient,
  ownerId: string,
  conversation: ConversationRow,
  question: string,
  answer: { content: string; payload: AnswerPayload },
): Promise<{ state: StoreState; note: string | null; title: string }> {
  // The title this conversation will carry after the exchange -- derived from
  // the first question, then stable. Returned so the caller can answer with
  // the real title without a re-read.
  const title =
    conversation.title === DEFAULT_TITLE ? deriveConversationTitle(question) : conversation.title;
  const { error: studentError } = await svc.from("conversation_messages").insert({
    conversation_id: conversation.id,
    owner_id: ownerId,
    role: "student",
    content: question,
  });
  if (studentError) return { state: "unavailable", note: degradeNote(studentError), title };

  const { error: answerError } = await svc.from("conversation_messages").insert({
    conversation_id: conversation.id,
    owner_id: ownerId,
    role: "classmind",
    content: answer.content,
    payload: answer.payload,
  });
  if (answerError) return { state: "unavailable", note: degradeNote(answerError), title };

  const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() };
  if (title !== conversation.title) patch.title = title;
  const { error: touchError } = await svc
    .from("conversations")
    .update(patch)
    .eq("id", conversation.id)
    .eq("owner_id", ownerId);
  if (touchError) return { state: "unavailable", note: degradeNote(touchError), title };
  return { state: "ok", note: null, title };
}

export async function deleteConversation(
  svc: SupabaseClient,
  ownerId: string,
  conversationId: string,
): Promise<{ state: "ok" | "not_found" | "unavailable"; note: string | null }> {
  // Read-then-delete so "deleted" and "was never yours" stay distinguishable
  // to the owner while looking identical to anyone else.
  const { data, error } = await svc
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) return { state: "unavailable", note: UNAVAILABLE };
    return { state: "unavailable", note: error.message };
  }
  if (!data) return { state: "not_found", note: null };
  const { error: delError } = await svc
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("owner_id", ownerId);
  if (delError) return { state: "unavailable", note: delError.message };
  return { state: "ok", note: null };
}
