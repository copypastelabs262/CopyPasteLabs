import { NextResponse } from "next/server";
import { requireUser, requireRole, errorResponse } from "@/lib/auth";
import { loadAcademicContext } from "@/lib/knowledge/academic-context";
import { serviceClient } from "@/lib/supabase/service";
import { answerFromKnowledge, type AskTurn } from "@/lib/knowledge/answer";
import { recordAskRun } from "@/lib/knowledge/ask-meter";
import { messagesToHistory } from "@/lib/knowledge/conversation-model";
import {
  appendExchange,
  createConversation,
  getConversation,
  type ConversationRow,
} from "@/lib/knowledge/conversations";

// STUDENT ASK -- the GLOBAL scope. "I am talking to ClassMind about my entire
// academic life."
//
// The retrieval boundary is the authenticated user's own memberships,
// enumerated server-side by the academic-context assembler -- no course id is
// accepted here at all, so no client-supplied identifier can widen or narrow
// what this surface may read. Same gated knowledge reader as every other
// scope, fanned across the user's subjects; same teaching architecture; same
// meter (course_id null = global, migration 20260906180000); same persistent
// conversations, at scope 'global' and nothing else.
//
// A continued conversation must BE a global conversation: a lecture or
// subject thread presented here is refused with the same 404 as a foreign
// one. Scope is an authoritative boundary, and history never overrides it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () =>
  NextResponse.json({ error: "That conversation was not found." }, { status: 404 });

interface GlobalAskInput {
  q: string;
  history?: AskTurn[];
  conversationId?: string;
  persist?: boolean;
}

async function handleGlobalAsk(input: GlobalAskInput) {
  const user = await requireUser();
  // Role-shaped surface: an account that never chose a role is refused with
  // the way forward named, exactly like the overview.
  requireRole(user);
  const svc = serviceClient();

  const q = input.q.trim();
  if (!q) return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  if (q.length > 4_000) {
    return NextResponse.json(
      { error: "That question is too long. Ask it in a shorter form." },
      { status: 400 },
    );
  }

  let conversation: ConversationRow | null = null;
  let storedHistory: AskTurn[] | null = null;
  let conversationNote: string | null = null;
  const conversationId = input.conversationId?.trim() || undefined;
  const wantsPersistence = Boolean(conversationId || input.persist);

  if (conversationId) {
    if (!UUID.test(conversationId)) return NOT_FOUND();
    const got = await getConversation(svc, user.id, conversationId);
    if (got.state === "not_found") return NOT_FOUND();
    if (got.state === "unavailable") {
      conversationNote = got.note;
    } else {
      // Only a GLOBAL thread continues here. A lecture or subject thread is
      // the same 404 as a foreign one -- scope never silently widens.
      if (got.conversation.scope !== "global" || got.conversation.courseId !== null) {
        return NOT_FOUND();
      }
      conversation = got.conversation;
      storedHistory = messagesToHistory(got.messages);
    }
  }

  // The whole accessible academic world, enumerated from the session user and
  // nothing else.
  const academic = await loadAcademicContext(svc, { scope: "global", userId: user.id });
  const units = academic.units;

  const result = await answerFromKnowledge(units, q, {
    history: storedHistory ?? input.history,
    context: { scope: "global", courseNames: academic.courseNames },
  });

  const meter = await recordAskRun({
    courseId: null,
    lectureId: null,
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

  // Cross-subject provenance: every source names its subject alongside its
  // lecture, in the same field the UI already renders -- and carries its own
  // courseId so its citations link into the right course.
  const sources = result.usedUnits.map((u, i) => ({
    ref: i + 1,
    id: u.id,
    courseId: u.courseId,
    lectureId: u.lectureId,
    lectureTitle: `${academic.courseNames.get(u.courseId) ?? "Another subject"} — ${u.lectureTitle}`,
    category: u.category,
    kind: u.kind,
    title: u.title,
    summary: u.summary,
    steps: u.steps,
    unspecified: u.unspecified,
    status: u.status,
    evidence: u.evidence,
  }));

  let exchangeState: "ok" | "unavailable" | null = null;
  if (wantsPersistence && !conversationNote) {
    if (!conversation) {
      const created = await createConversation(svc, user.id, {
        scope: "global",
        courseId: null,
        lectureId: null,
      });
      if (created.conversation) conversation = created.conversation;
      else conversationNote = created.note;
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
    usage: result.usage
      ? { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens }
      : null,
    meter: meter.state,
    knowledgeUnitsAvailable: units.length,
    scope: "global",
    conversation: wantsPersistence
      ? {
          id: conversation?.id ?? null,
          title: conversation?.title ?? null,
          scope: conversation?.scope ?? null,
          lectureId: null,
          state: conversation && exchangeState === "ok" ? "ok" : "unavailable",
          note: conversationNote,
        }
      : null,
  });
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return await handleGlobalAsk({ q: params.get("q") ?? "" });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    let body: {
      question?: unknown;
      history?: unknown;
      conversationId?: unknown;
      persist?: unknown;
    } = {};
    try { body = await request.json(); } catch { /* handled by the blank-q check */ }
    const history = Array.isArray(body.history)
      ? body.history.filter(
          (t): t is AskTurn =>
            !!t && (t.role === "student" || t.role === "classmind") && typeof t.text === "string",
        )
      : undefined;
    return await handleGlobalAsk({
      q: typeof body.question === "string" ? body.question : "",
      history,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      persist: body.persist === true,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
