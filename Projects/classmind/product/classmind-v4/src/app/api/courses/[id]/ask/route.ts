import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { readKnowledge } from "@/lib/knowledge/read";
import { serviceClient } from "@/lib/supabase/service";
import { answerFromKnowledge, type AskTurn } from "@/lib/knowledge/answer";
import { recordAskRun } from "@/lib/knowledge/ask-meter";
import {
  contextMatches,
  messagesToHistory,
  planConversationContext,
} from "@/lib/knowledge/conversation-model";
import {
  appendExchange,
  createConversation,
  getConversation,
  type ConversationRow,
} from "@/lib/knowledge/conversations";

// LAYER 4 -- a student asks a question of the course's memory.
//
// This used to return a ranked list of confirmed rows and call it an answer.
// It now retrieves the relevant stored knowledge units and has a model compose
// a grounded answer from them, citing the units it used -- unless the routing
// layer can answer from the stored fields directly, in which case no model is
// called at all. Either way the ask is METERED: one line in the server log and
// one row in ask_runs, so this paid path can never again spend invisibly.
//
// The model never sees a transcript. It sees only knowledge that has already
// been reconstructed and, where it matters, confirmed by the lecturer -- so the
// worst failure available to it is a clumsy sentence about a true item, not an
// invented deadline. The evidence for every cited unit comes back alongside the
// prose so a student can jump to the second it was spoken.
//
// TWO VERBS, ONE HANDLER. GET (?q=...) is the original single-turn shape and
// every existing script's contract. POST adds the conversation: either
// `history` (the ephemeral, client-held shape -- kept working) or
// `conversationId`/`persist` (the stored shape, 2026-09-06). Same auth, same
// gates, same meter; the conversation changes what the model is SHOWN as
// context, never what may be read -- retrieval still runs per question over
// the same gated knowledge.
//
// THE STORED CONVERSATION IS THE SOURCE OF CONTINUITY. When a conversationId
// arrives, the server loads the recent stored exchange as history and IGNORES
// any client history: the thread on disk is the truth, and a client cannot
// inject a conversation that never happened into a stored one.

interface AskInput {
  q: string;
  lectureId?: string;
  history?: AskTurn[];
  // Continue this stored conversation (must be the caller's own, in this
  // course). Mutually authoritative with lectureId: the stored scope wins.
  conversationId?: string;
  // Start persisting: create a conversation from this ask's context and store
  // the exchange. Ignored when conversationId is present.
  persist?: boolean;
}

async function handleAsk(courseId: string, input: AskInput) {
  const user = await requireUser();
  const { isOwner } = await requireCourseAccess(courseId, user.id);
  const svc = serviceClient();

  const q = input.q.trim();
  if (!q) return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  // A question is a question, not a document. The cap bounds the prompt AND
  // the stored student message; the meter separately caps its own copy at 500.
  if (q.length > 4_000) {
    return NextResponse.json(
      { error: "That question is too long. Ask it in a shorter form." },
      { status: 400 },
    );
  }

  // ---- The stored conversation, when one is named --------------------------
  //
  // Ownership and context are both checked against the STORED row: the id is a
  // client-supplied parameter. Absent, someone else's, and wrong-course all
  // get the same 404, so a guesser learns nothing. When the conversation
  // tables are not there yet (migration unapplied) the ask still answers --
  // ephemeral, with the state reported -- because persistence going missing
  // must never take Ask down.
  let conversation: ConversationRow | null = null;
  let storedHistory: AskTurn[] | null = null;
  let conversationNote: string | null = null;
  const conversationId = input.conversationId?.trim() || undefined;
  const wantsPersistence = Boolean(conversationId || input.persist);

  if (conversationId) {
    const got = await getConversation(svc, user.id, conversationId);
    if (got.state === "not_found") {
      return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
    }
    if (got.state === "unavailable") {
      conversationNote = got.note;
    } else {
      if (got.conversation.courseId !== courseId) {
        return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
      }
      conversation = got.conversation;
      storedHistory = messagesToHistory(got.messages);
    }
  }

  // Optional lecture scope. "What did I miss today?" is a question about ONE
  // lecture, and answering it from the whole course pulls in material the
  // student did not ask about and dilutes retrieval. Course scope stays the
  // default so "what is due this term" still works.
  //
  // A stored conversation's OWN scope is authoritative: continuing it always
  // retrieves within the boundary it was created in, whatever the request
  // says. That is the lecture-scoped/global separation made structural.
  //
  // The lecture is checked to belong to this course before it is used. Without
  // that, the id is a parameter a student controls, and passing another
  // course's lecture id would read knowledge they are not enrolled in.
  const lectureId = conversation
    ? (conversation.lectureId ?? undefined)
    : input.lectureId?.trim() || undefined;
  if (!conversation && lectureId) {
    const { data: owned } = await svc
      .from("lectures")
      .select("id")
      .eq("id", lectureId)
      .eq("course_id", courseId)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json(
        { error: "That lecture is not part of this course." },
        { status: 404 },
      );
    }
  }

  // The replay gate is INHERITED here, not restated.
  //
  // `readKnowledge` withholds knowledge from any lecture whose transcript
  // cannot be shown to have come from its own recording, so a replayed
  // lecture is absent from `units` before retrieval runs and cannot be cited
  // however the question is worded -- including a question built from words
  // that appear only in the replayed transcript, which is the case
  // scripts/test-replay-gate.mts asserts. Filtering the SOURCES afterwards
  // would be the wrong shape: the model would already have read the unit.
  const units = await readKnowledge({ courseId, lectureId, forStudent: !isOwner });
  // Stored history is the truth when a conversation is in play; client history
  // is only the ephemeral fallback shape. Both are conversational CONTEXT --
  // retrieval above is the academic grounding, and neither replaces the other.
  const result = await answerFromKnowledge(units, q, {
    history: storedHistory ?? input.history,
  });

  // Metered before it is returned, $0 routes included -- "which questions
  // cost nothing" is half of what the meter is for. Awaited (one insert),
  // but never allowed to fail the answer: recordAskRun reports state
  // instead of throwing.
  const meter = await recordAskRun({
    courseId,
    lectureId: lectureId ?? null,
    userId: user.id,
    question: q,
    route: result.route,
    provider: result.usage?.provider ?? null,
    model: result.usage?.model ?? null,
    requestId: result.usage?.requestId ?? null,
    promptTokens: result.usage?.promptTokens ?? null,
    completionTokens: result.usage?.completionTokens ?? null,
    unitsAvailable: units.length,
    unitsCited: result.usedUnits.length,
    durationMs: result.durationMs,
    error: result.failure,
  });

  // Only the units actually used, each with its evidence, so every claim in
  // the prose is checkable. Built once: the wire response and the persisted
  // assistant message carry the SAME sources, so a resumed conversation
  // renders exactly what was shown today.
  const sources = result.usedUnits.map((u, i) => ({
    ref: i + 1,
    id: u.id,
    lectureId: u.lectureId,
    lectureTitle: u.lectureTitle,
    category: u.category,
    kind: u.kind,
    title: u.title,
    summary: u.summary,
    steps: u.steps,
    unspecified: u.unspecified,
    status: u.status,
    evidence: u.evidence,
  }));

  // ---- Persist the exchange ------------------------------------------------
  //
  // AFTER the answer and AFTER the meter: persistence failing must lose only
  // persistence, never an answered (possibly paid) question. Creation happens
  // here too, so a page visit never creates a conversation -- only an actual
  // first question does.
  let exchangeState: "ok" | "unavailable" | null = null;
  if (wantsPersistence && !conversationNote) {
    if (!conversation) {
      const context = planConversationContext({ courseId, lectureId });
      if ("error" in context) {
        conversationNote = context.error;
      } else {
        const created = await createConversation(svc, user.id, context);
        if (created.conversation) conversation = created.conversation;
        else conversationNote = created.note;
      }
    }
    if (conversation) {
      const appended = await appendExchange(svc, user.id, conversation, q, {
        content: result.answer,
        payload: {
          route: result.route,
          degraded: result.degraded,
          knowledgeUnitsAvailable: units.length,
          sources,
        },
      });
      exchangeState = appended.state;
      if (appended.note) conversationNote = appended.note;
      conversation = { ...conversation, title: appended.title };
    }
  }

  return NextResponse.json({
    question: result.question,
    answered: result.answered,
    answer: result.answer,
    sources,
    degraded: result.degraded,
    route: result.route,
    // Cost on the wire, so the operator can see what a question spent
    // without opening a log. Null when no model was called.
    usage: result.usage
      ? { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens }
      : null,
    meter: meter.state,
    knowledgeUnitsAvailable: units.length,
    scope: lectureId ? "lecture" : "course",
    // The stored-conversation outcome: null when the caller never asked for
    // persistence; otherwise the conversation identity (for the client to
    // continue with) and an honest state -- "unavailable" carries the note
    // instead of pretending the thread exists.
    conversation: wantsPersistence
      ? {
          id: conversation?.id ?? null,
          title: conversation?.title ?? null,
          scope: conversation?.scope ?? null,
          lectureId: conversation?.lectureId ?? null,
          state: conversation && exchangeState === "ok" ? "ok" : "unavailable",
          note: conversationNote,
        }
      : null,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const params_ = new URL(request.url).searchParams;
    return await handleAsk(id, {
      q: params_.get("q") ?? "",
      lectureId: params_.get("lectureId") ?? undefined,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let body: {
      question?: unknown;
      lectureId?: unknown;
      history?: unknown;
      conversationId?: unknown;
      persist?: unknown;
    } = {};
    try { body = await request.json(); } catch { /* handled by the blank-q check */ }
    // History is validated structurally here and capped hard in answer.ts --
    // it is client-supplied conversation CONTEXT, never trusted instructions.
    const history = Array.isArray(body.history)
      ? (body.history.filter(
          (t): t is AskTurn =>
            !!t && (t.role === "student" || t.role === "classmind") && typeof t.text === "string",
        ))
      : undefined;
    return await handleAsk(id, {
      q: typeof body.question === "string" ? body.question : "",
      lectureId: typeof body.lectureId === "string" ? body.lectureId : undefined,
      history,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      persist: body.persist === true,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
