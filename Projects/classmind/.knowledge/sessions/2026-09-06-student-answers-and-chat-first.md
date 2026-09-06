# 2026-09-06 — Answers that teach, the chat-first lecture page, and the publishing boundary

The "make ClassMind genuinely useful to a student" milestone. Autonomous run per the
operator's brief; Gemini prototype spend authorized within reason, Sarvam untouched.

## The Gemini answer problem — root cause (Phase A)

Not retrieval, not context volume, not model parameters. The old `answer.ts` SYSTEM
prompt was a LOOKUP prompt: rule 1 forbade every word beyond the stored units ("Never
fill a gap with general knowledge... never pad") and rule 5 hard-capped every answer at
"two or three sentences" regardless of intent. Measured (eval pass "before"): every
model answer 250–430 chars, completion 51–77 tokens — "teach me", "in detail" and
"what is" all produced the same three generic lines, and 8 of 10 answers opened with
gap-hedging. There was also no intent classification, no conversation context anywhere
in the chain (single-turn GET), and units rendered without the lecturer's own words.

## The answer architecture (Phase B)

- **`answer-intent.ts`** — pure intent classifier for model-routed questions:
  eli5 / stepbystep / example / detail / compare / teach / why / followup / explain
  (specific markers win; follow-up only with history + anaphora or brevity). Each
  intent carries a SHAPE guidance block appended to the system prompt. Offline truth
  table in `test:answer`.
- **The teaching prompt** — ClassMind as the student's study partner. The grounding
  contract now separates LECTURE FACTS (units only, cited [n], inventing one stays
  forbidden) from EXPLANATION (the model's own teaching — intuition, analogies,
  examples — never attributed to the lecturer). Citation discipline: a cited sentence
  carries only unit-supported facts; illustrative specifics and analogies are
  citation-free zones; mixed sentences split. ASR artifacts are taught around, not
  pointed at. Named gaps stay the honest failure. Light markdown allowed.
- **Conversation** — `AskTurn[]` history rides on a new POST on the ask route (GET
  unchanged for compat), hard-capped server-side (8 turns / 1.5K chars each).
  Follow-up retrieval augments the query with recent turns when the bare question
  retrieves <2 units, so "give me another example" finds the unit under discussion.
  Client-held (the UI sends the visible exchange — nothing on the server stores a
  conversation; the intro still says so). Structured to evolve into persistence later.
- **Rendering** — `MarkdownAnswer.tsx`, a deliberately small no-dependency renderer
  (headings/lists/bold/code, React elements only, no dangerouslySetInnerHTML, plain
  text degrades exactly as before) feeding the existing `.prose-reading` styles;
  [n] citations keep working inside any block.
- Direct $0 routes untouched (verified in-suite and live); `answerFromKnowledge` gained
  an injectable provider so all of this is offline-testable; meter unchanged, one
  ask_runs row per turn.

## Evaluation (Phases C–E): before → after, with critics

12-question set (scripts/eval-ask-quality.mts — PAID, run deliberately, three passes
total): what-is/explain/teach/eli5/detail/example/why/compare/followup + two direct
lookups + one absent topic. Two critic agents reviewed independently: learning quality
(scored per answer) and grounding (claim-by-claim against the stored units).

- **before**: 10 model calls, 6,202 tokens; every answer ~300 chars, no intent
  adaptation, follow-up had no idea what it followed.
- **after-v1**: 12,392 tokens; depth tracked intent (explain 453 chars → teach 1,754 →
  detail 2,223), teach became problem→mechanism→example→takeaway→self-check, follow-up
  switched analogies instead of repeating. Critics found: one grounding VIOLATION
  (invented 500GB/256GB numbers wearing a [3] citation in the example), compare
  manufacturing a dimension from a note-gap + duplicating another, "catch scaling"
  ASR artifact leaked at the student, one analogy contradicting itself.
- **after-v2** (one iteration: citation-discipline rules + 4 guidance fixes): 13,576
  tokens. All four findings fixed and verified in the answers: definitions commit in
  sentence one, examples run clearly-fictional scenarios with citations only on
  unit-supported clauses and zero invented numbers, compare gives two real dimensions
  with the gap stated AS a gap (uncited), follow-up holds one consistent analogy.
  The absent-topic answer refuses cleanly and lists only real stored topics.
- Also fixed from critique: the direct audience-gap wording spoke system vocabulary
  ("the contract") at students — now plain words.

**Milestone eval spend: 32,170 Gemini tokens (~₹0.5). Latency ~1.3–3.1s per model
answer.** Trade accepted deliberately: roughly double the tokens per model answer for
answers that actually teach — per the operator, quality over pennies at prototype
stage.

## Chat-first lecture page (Phases F–G)

`AskWorkspace` generalized into the one conversation surface (course tab and lecture
page): lecture scope + `nav.onSeek` so citations seek the on-page player, POST with
history, aria-live, scope-aware sizing. `LectureClient` reordered: owner review →
**conversation as THE surface** (composer sticky at the bottom, lifting above the
pinned player by its measured height) → "What was taught" behind one Browse
disclosure (summary count always visible, pending-review note kept) → Full lecture
(player + transcript) → delete. The double-header problem fixed at the root: the
lecture page no longer re-fetches or re-renders the course identity the class shell
already shows (eyebrow is just "Lectures", course dropped from the meta line, the
course-fetch effect deleted).

Design Master Loop: new `lecture-chat-student` capture target (Robotics lecture, real
data); three iterations at desktop/tablet/mobile via the money-guarded capture rig
(the guard blocks /ask so a static capture can never bill). Fixed from screenshots:
hollow empty-state void (scope-aware min-height, centered only on the course tab),
suggestion chips clipped at the fold. Observatory held: dark-first, calm, one focal
surface, no new glow — and the **backdrop-filter budget is back to exactly two**
app-wide (removed the over-budget blurs on AudioPlayer and the pinned player bar;
solid raised surfaces + shadow-lift instead). Known screenshot artifact, not a bug:
full-page captures paint the sticky composer mid-page.

## Autosave publishing boundary + credentials (Phase H)

`scripts/autosave.sh` now **commits locally and never pushes** (AUTOSAVE_PUSH=1
restores old behaviour per-session; nothing sets it). Publishing is deliberate: review
the diff, then `git push` — End-Session's Phase 9 push remains the session-end
publisher. Charter updated ("Checkpoint automatically; publish deliberately"), hook
statusMessage now says "Checkpointing locally...". **Verified live**: after the change,
five edits produced five local Auto-save commits with origin untouched (`ahead 5`).
`verify-auth-roles.mts`'s hardcoded password replaced with a per-run generated one
(21/21 live checks still green). Known remaining committed credential, unchanged and
already recorded as the pre-launch blocker in DEPLOY.md: the shared test-account
password in ~15 fixture scripts + design-loop config.

## Auth human verification (Phase I)

Machine-verifiable auth work was already done. The one human-only step stands:
**operator adds `http://localhost:3500/**` to Supabase Auth → URL Configuration, then
clicks through Google signup once as Student and once as Faculty.** Probed the
authorize endpoint read-only: whether the allow-list accepts the 3500 redirect is
decided on Supabase's post-consent bounce and cannot be observed without completing
consent. No auth code changed this milestone.

## Verification (Phases J–K)

**483 offline checks green** across 8 suites (auth 25, answer 62 incl. the new intent
truth table, ask 70, reconstruction 63, knowledge-plan 47, extraction 76, transcript
33, providers 107); tsc, eslint, `next build` clean. Security sweep: `.auth/` session
states gitignored, no secret-shaped files in the last 30 pushed commits, unpushed
boundary commits reviewed file-by-file before the deliberate push. Eval JSONs are
committed as evidence (answers over test-course data; no secrets).

## Spend and state

Gemini this milestone: **32,170 tokens ≈ ₹0.5** (three deliberate eval passes; all
metered in ask_runs). Sarvam: **0 calls**. Day total across both milestones:
~74K Gemini tokens ≈ ₹1.

## Next (top 3)

1. Operator: the Supabase allow-list entry + the two Google click-throughs.
2. Persistent conversations (server-stored, resumable) — the lecture-page model is
   proven; this is the natural next step, then the global Ask.
3. My Classes reframe; then the background-job extraction milestone (36-min ceiling).
