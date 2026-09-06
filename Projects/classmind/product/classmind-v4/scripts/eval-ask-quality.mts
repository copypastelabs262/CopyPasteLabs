// STUDENT-ANSWER QUALITY EVALUATION. **PAID** — every model-routed question
// below bills the reasoning provider (direct/$0 routes stay free). Run
// deliberately, one pass at a time:
//
//   node --env-file=.env.local scripts/eval-ask-quality.mts <label> [outDir]
//
// <label> names the pass ("before", "after-v1", ...). The full transcript of
// answers + per-question usage/latency is written to
// <outDir|.eval>/ask-eval-<label>.json so passes can be diffed. The dev server
// must be running on 3500.
//
// The question set is the operator's twelve student scenarios (2026-09-06):
// simple/what-is, explain, teach, ELI5, detail, example, why, compare,
// follow-up, two direct $0 lookups, and one genuinely-absent topic. Questions
// marked `history` send the prior exchange as conversation context when the
// API supports it (passes before that support simply omit it — that is part
// of what the before/after comparison shows).

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.EVAL_BASE_URL ?? "http://localhost:3500";
const COURSE = "5ab749fb-d4fd-42fc-85ba-b9de82fe1dcf"; // Cloud Computing (Test2)
const label = process.argv[2];
const outDir = process.argv[3] ?? ".eval";
if (!label) { console.error("usage: eval-ask-quality.mts <label> [outDir]"); process.exit(1); }

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);
const { data: s, error: se } = await anon.auth.signInWithPassword({
  email: "student.test@classmind.local",
  password: "ClassMindTest!2026",
});
if (se || !s.session) { console.error("student sign-in failed:", se?.message); process.exit(1); }
const token = s.session.access_token;

interface Turn { role: "student" | "classmind"; text: string }
interface Q { id: string; q: string; historyOf?: string; expectRoute?: string }

const QUESTIONS: Q[] = [
  { id: "what-is",   q: "What is cache scaling?" },
  { id: "explain",   q: "Explain cache scaling." },
  { id: "teach",     q: "Teach me cache scaling." },
  { id: "eli5",      q: "Explain cache scaling like I'm 5." },
  { id: "detail",    q: "Explain cache scaling in detail." },
  { id: "example",   q: "Give me an example of cache scaling.", historyOf: "explain" },
  { id: "why",       q: "Why is cache scaling useful?" },
  { id: "compare",   q: "Compare relative and absolute resource allocation." },
  { id: "followup",  q: "I didn't understand that. Explain it differently.", historyOf: "explain" },
  { id: "assignment", q: "What assignment did we get?", expectRoute: "direct" },
  { id: "audience",  q: "Who is the assignment for?", expectRoute: "direct" },
  { id: "absent",    q: "What did the lecturer say about quantum entanglement?" },
];

const results: Record<string, unknown>[] = [];
const answers = new Map<string, string>();
let paidPrompt = 0, paidCompletion = 0, modelCalls = 0;

for (const item of QUESTIONS) {
  const history: Turn[] = [];
  if (item.historyOf && answers.has(item.historyOf)) {
    const prior = QUESTIONS.find((x) => x.id === item.historyOf)!;
    history.push({ role: "student", text: prior.q });
    history.push({ role: "classmind", text: answers.get(item.historyOf)! });
  }
  const started = Date.now();
  // POST when history is carried (newer API); GET otherwise so the same
  // script runs against the pre-change route.
  const res = history.length
    ? await fetch(`${BASE}/api/courses/${COURSE}/ask`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ question: item.q, history }),
      })
    : await fetch(`${BASE}/api/courses/${COURSE}/ask?q=${encodeURIComponent(item.q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
  const wall = Date.now() - started;
  const body = (await res.json()) as Record<string, any>;
  const answer = String(body.answer ?? body.error ?? "");
  answers.set(item.id, answer);
  const usage = body.usage ?? null;
  if (usage?.promptTokens) { paidPrompt += usage.promptTokens; paidCompletion += usage.completionTokens ?? 0; }
  if (body.route === "model") modelCalls += 1;
  results.push({
    id: item.id, question: item.q, status: res.status, route: body.route,
    expectRoute: item.expectRoute ?? null,
    routeOk: item.expectRoute ? body.route === item.expectRoute : null,
    provider: usage?.provider ?? null, model: usage?.model ?? null,
    promptTokens: usage?.promptTokens ?? null, completionTokens: usage?.completionTokens ?? null,
    latencyMs: wall, degraded: body.degraded ?? null,
    historySent: history.length > 0,
    answerChars: answer.length,
    answer,
  });
  console.log(`[${item.id}] ${res.status} route=${body.route} tokens=${usage?.promptTokens ?? 0}+${usage?.completionTokens ?? 0} ${wall}ms ${answer.length} chars`);
}

mkdirSync(outDir, { recursive: true });
const out = {
  label, at: new Date().toISOString(), base: BASE, course: COURSE,
  totals: { modelCalls, paidPrompt, paidCompletion, paidTotal: paidPrompt + paidCompletion },
  results,
};
const path = `${outDir}/ask-eval-${label}.json`;
writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`\nPASS "${label}": ${modelCalls} model calls, ${paidPrompt}+${paidCompletion} = ${paidPrompt + paidCompletion} paid tokens`);
console.log("written:", path);
