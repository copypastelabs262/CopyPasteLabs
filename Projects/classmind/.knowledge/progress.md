# Progress — ClassMind

Reverse-chronological. Newest at the top. Each entry is what changed and what it unblocked —
not a commit log, which git already provides.

Entries are snapshots of what was true when written and are never rewritten. Where a later entry
resolves something an earlier one recorded as blocked, the earlier line gets a dated marker
pointing forward — it does not get edited away.

## 2026-09-01/02 — Gemini phase day one: two clean baselines, the first true end-to-end run, and the grammar decision

**Done.**

1. **The first clean, complete, reusable reconstruction baseline in project history.**
   Controlled paid run over the stored Cloud Computing transcript — after snapshotting the
   Sarvam-era reading to `.knowledge/baselines/` (a complete pass replaces unjudged items by
   design; operator chose snapshot-then-run). Ledger `77408ea3`: `gemini/gemini-3.5-flash-lite`,
   20/20 windows, 0 retries, 27,979 tokens, 118.7 s. All 35 quotes verified verbatim; Gemini
   independently re-derived the confirmed research-paper assignment. Fully inspected read-only in
   `.knowledge/reports/2026-09-02-gemini-run-77408ea3-inspection.md` — findings **R1** (teaching
   windows share boundary segments; teaching pass has no dedupe → two duplicate item pairs) and
   **R2** (raw responses discarded though `model_raw` exists), both assembly-level, neither
   model-level.
2. **The first true end-to-end product run** — operator as faculty, real noisy recording.
   Found and fixed our MIME bug (Windows reports `.aac` as `audio/vnd.dlna.adts`; the curated
   extension map now outranks the browser's report in v2+v3; Sarvam's own 400 handed us its
   allowlist verbatim). MP3 retry ran the whole pipeline: ASR job `20260901_22466f9c` →
   validation pass (0.421 supported-rate — honest near-threshold on unclear audio) → ledger
   `6ac53dca`, 7/7 windows, 5,993 tokens — **second clean baseline**; "Transformation
   Assignment" correctly pending review.
3. **Ask, used in anger, set the next frontier.** One billed call produced a vague answer;
   diagnosis: the lecture names three specific students, the extraction contract has no
   audience concept, so the stored item couldn't say and Ask can never see the transcript. Ask
   usage is also entirely unmetered. Five items recorded in `roadmap.md` § "Backlog from first
   live use" (Ask routing/no-API grounded answers · honest gap-naming · audience in the
   extraction contract · chat-first lecture page · meter Ask).
4. **Product direction decided: steal the grammar, not the product.** Classroom-app grammar
   (class rail, per-class Home/Ask/Lectures/Assignments, confirm-as-posting as hero) around
   ClassMind's differentiator — zero-entry, provenance-verified classroom memory; LMS and
   communication features explicitly rejected. Research in
   `.knowledge/design/teams-grammar/grammar.md`, verified against nine screenshots of the
   operator's real student account (which corrected the docs and *strengthened* the chat
   rejection — real collaboration already lives outside class teams).

**Cost of the whole day:** ~34K Gemini tokens + one ~7-minute ASR job, every metered number
read back from the ledger; three Ask calls estimated only (that gap is R6).

**In progress:** the **v4 overnight autonomous build** (grammar shell over the Observatory
skin; v3 freezes as pre-shell baseline; mechanically zero-spend — provider keys stripped,
network guard on). Standing zero-spend rule in force until Ask routing is solved.

**Next:** the overnight handoff review, then the two-day backend brief (36-minute ceiling,
Option D, background jobs) and R1/R2/R6.

## 2026-09-01 (closing) — The recovery chapter ends: the ledger answers the Groq question, and the experiment is closed

**Done.** One read-only `processing_runs` query (operator-approved; no writes, no paid
endpoints) resolved the open question left by the recovered 2026-08-31 record. **The ledger
row exists and the meter worked**: row `ff0721de`, 2026-08-31 07:36 UTC, `groq /
openai/gpt-oss-120b`, `llm-reconstruct/1.1.0`, over the same "WhatsApp.mp3" lecture as every
baseline attempt. Outcome **`partial`, `complete=false`** — 19 of 20 windows succeeded, the
one failure being the `teaching 881s` window's `400 json_validate_failed`, exactly the failure
the one-retry carve-out was written against later that hour. Cost, fully metered: 20 HTTP
attempts, 19 completions, 0 retries, 0 rate-limits at rpm=1/concurrency=2, **27,891 prompt +
18,844 completion = 46,735 tokens**, 1,147 s. 37 items proposed; `knowledge_total` stayed 24,
so **the Sarvam baseline is untouched**. The row is excluded from the reuse index by design.
The timeline corroborates end to end: client fix 12:36 IST → 19-minute run ending 13:06 IST →
carve-out by 13:30 IST. The two older rows are the documented 2026-08-30 Gemini free-tier
failures — consistent, no surprises.

**Decided (operator).** **The Groq provider experiment is closed**; `ff0721de` is its final
recorded outcome — no re-runs, no further historical investigation. Reasoning continues on the
**paid Gemini key as a separate next phase** (key obtained and topped up 2026-09-01; Sarvam
also topped up; a new lecture recording exists). The Inbox backlog (8 pending entries) is
**deliberate** until a proper skill is built around End-Session and Knowledge-Promoter.
Measured side-finding, captured as a candidate: `gpt-oss-120b` emitted ~5.7× the completion
tokens of `gemini-3.5-flash` for the same 19 windows — budget output tokens from the ledger,
not the window plan.

**Verified:** nothing to verify — this closure touched records only. Working tree clean and
pushed.

**Next:** the Gemini phase, from the operator's two-day brief: paid Gemini as reasoning
provider, tested on stored transcripts; finalize the processing engine (the 36-minute ceiling
and the standing backend blockers); then the live faculty walkthrough with the new lecture.
The Groq result is context, not a task.

## 2026-09-01 — Real recordings are accepted, and spending is asked about before anything exists

**Recorded retroactively the same evening** — this work ran 13:39–17:46 IST as Auto-saves only;
the record was reconstructed from git when the gap was noticed. Same class of failure as the
2026-08-24/26 gap, caught in hours instead of days.

**Done.** The path to uploading a real recording through v3 locally is clear, in two moves:

1. **Audio acceptance rewritten** (`storage.ts`, in **both v2 and v3**): the seven-MIME
   whitelist refused recordings Windows reports as `application/octet-stream` or typeless
   (`.m4a`, `.opus`, `.amr`). Now: `audio/*` type OR a recognised audio extension, with the
   content type canonicalised once and used for the row, the storage PUT and the provider —
   the browser's guess never goes on the wire. Raw PCM deliberately excluded (Sarvam needs an
   explicit `input_audio_codec` the transcribe path doesn't send). The lectures route refuses
   non-audio before any row or signed URL exists. `setup-storage.mts` now **converges** an
   existing bucket to current config instead of skipping it — a bucket provisioned under the
   old list would otherwise keep refusing formats the code accepts, and the refusal reads as a
   generic upload error.

2. **The money guard answers before anything is created** (v3 only): a read-only
   `GET /api/transcription/authorization` pre-flight; the upload UI renders "spending is off
   here" as instructions in the idle card instead of an error after a full upload (each late
   refusal used to orphan a `pending_upload` row). The transcribe route's refusal now carries
   `code: "live_transcription_disabled"` so the UI can tell policy from breakage — and
   correctly offers no retry. **`npm run dev:spend`** starts the server with
   `ALLOW_LIVE_SARVAM=1` for that one process only, banner printed, nothing written to any
   file; stop it and the next `npm run dev` is safe again.

**Verified:** tsc and eslint clean in both v2 and v3 (offline; run at capture). No paid call
made by the work or its capture.

**Blocked / open:** possible orphaned `pending_upload` rows in the live DB from earlier refused
attempts (cleanup undecided). Everything from 2026-08-30/31 unchanged — see below.

**Next (operator's stated plan for today):** set up the **paid Gemini key** as the reasoning
provider (arrived today, topped up; Sarvam also topped up ~90 credits, and a new lecture
recording exists); test it against already-stored transcripts; finalize the processing engine —
the 36-minute ceiling and the standing backend blockers, per the operator's two-day brief; then
a live end-to-end walkthrough with the operator acting as faculty uploading the new lecture.
The design loop is deliberately not part of the day.

## 2026-08-31 (daytime) — The extract client stops timing out; Groq schema failures get one retry; the OAuth allow-list learns about v3

**Recorded retroactively on 2026-09-01** from git and the code's own comments — this stream
(09:15–13:30 IST) left no record at the time.

**Done.**

1. **`verify-processing-run.mts` can no longer kill the run it observes.** `/extract` is
   driven through plain `node:http` — undici's non-configurable 300 s headers timeout is what
   ended the 2026-08-30 baseline attempt, and the client abort cancelled the server-side
   handler mid-run, so nothing was written. Heartbeat every 2 minutes; the run takes as long
   as it takes. Also fixed: the script's default base URL was **3300 — v2's port** — and would
   have driven a paid extraction through the wrong codebase; now 3400.

2. **A Groq baseline run happened, and taught us something about strict schemas.** Groq's
   strict `json_schema` mode validates the completion *after* generation: 1 of 20 windows came
   back `400 json_validate_failed` (top-level array where the schema root is an object) while
   its 19 neighbours validated. New `schema_validation` failure class: status 400 + that exact
   code + **exactly one retry**, tracked per class; classification now reads the full body (the
   code was slicing to 300 chars, past which the code sits). Tests cover both the
   classification and the one-retry bound.

3. **Local v3 sign-in was landing on the v1 production deployment** after Google consent —
   Supabase silently falls back to the Site URL when `redirectTo` isn't allow-listed.
   `localhost:3400/**` added; `DEPLOY.md` now records the shared-project rules: allow-list is
   additive across v1/v2/v3, the glob matches the whole URL including query string, and
   `localhost` ≠ `127.0.0.1`.

**Not recorded, honestly:** whether that baseline run completed, whether a `processing_runs`
row exists, and **what it cost** — the record-the-cost rule went unmet because the session left
no record at all. Must be answered from `processing_runs` before the next paid reasoning run.
*(Resolved 2026-09-01 evening: the row exists — `ff0721de`, partial, 19/20 windows, 46,735
tokens, ~19 min, fully metered. The operator closed the Groq experiment with it as the final
recorded outcome. See the 2026-09-01 closing entry above.)*

**Blocked:** unchanged from 2026-08-30 (night) — the 36-minute ceiling, the background-job
migration, Option D; "no clean baseline" is now *status unknown* pending the ledger check above.

**Next:** confirm the baseline's fate in `processing_runs`, then the standing queue.

## 2026-08-31 — The Design Master Loop exists, and V3 has its first designed identity

**Done.** All in `product/classmind-v3/` — `classmind-v2` is untouched and stays the preserved
baseline; v3 now runs on its own port (3400) under its own package name.

1. **A reusable design-improvement loop** lives at `classmind-v3/design-loop/`: a Playwright
   capture harness that drives the real dev server as the e2e accounts and screenshots every
   configured route × viewport, a verifier (tsc/eslint/build, results recorded per run), a
   `state.json` iteration ledger, and `runs/2026-08-31/` holding the complete evidence trail —
   before/after screenshots for four iterations, three preserved specialist critiques, and gate
   verdicts. **The money rule is enforced in code:** every capture context aborts, at the
   browser's network layer, any request to `/extract`, `/ask`, `/transcribe`, `/poll` or an AI
   provider host, and logs the attempt to the run manifest. Zero attempts were recorded across
   every run — rendering pages spent nothing, verified rather than assumed.

2. **The first run redesigned the signed-in home flow** (both roles), landing, sign-in, the
   shell, and the shared primitives into a committed dark identity ("The Observatory"): an
   L0–L5 glass material hierarchy with two backdrop-filters app-wide and capped glow budgets,
   Fraunces/Inter/JetBrains Mono as three deliberate voices, one focal surface per screen. The
   UX repairs are the substance: **the raw Sarvam 402 payload that rendered twice as body copy
   is gone** — failures are human sentences with the payload one disclosure away and a short
   support ref; lecture state is a five-segment pipeline track that says *where* a run broke;
   the attention list no longer duplicates into recents; empty states are compact and end in a
   forward action; the student home's Ask panel is a **link** into the course, never a live
   input, because asking bills tokens and the home page must not make spending a keystroke.

3. **The verdict was earned, not asserted.** A hard-grading gate judge failed iteration 2 with
   three named blockers (failed card ended without an action; a background seam cut through the
   landing — the atmosphere layer was `position: fixed` and painted only the first viewport;
   truncation regressions). Iteration 3 fixed them; the judge re-reviewed every breakpoint and
   ruled **PASS**. A pixel-level regression pass over 18 shots found no blockers and two live
   defects (a bare "7" rendering as metadata, an ambiguous disabled Ask button), both fixed in
   iteration 4 with tsc/eslint/build green over the final tree.

**Verified:** tsc clean, eslint clean, `next build` clean (26 routes), 63 screenshots across
five labelled evidence sets, v2 byte-identical throughout.

**Blocked / deferred, honestly:** no retry affordance on a failed lecture — re-transcription is
a paid ASR call and an operator decision, so the card ends in "Open lecture" until that product
question is answered. No password recovery on sign-in. Course and lecture screens inherit the
tokens but have not had their compositional pass. Everything blocked in the 2026-08-30 entries
(the 36-minute ceiling, the background-job migration, the clean Groq baseline) is unchanged —
this session deliberately spent nothing.

**Next:** run the loop on the student course view and lecture screen, and put the
re-transcribe affordance question to the operator.

## 2026-08-30 (night) — Reasoning becomes provider-independent, rate-limit-aware and metered

**Done.** The reasoning layer no longer belongs to Sarvam. Four things shipped, all in
`classmind-v2`, all uncommitted-then-committed tonight:

1. **The processing ledger** (`processing_runs`, migration `20260830160000`, **applied**). One
   table doing two jobs, because they are the same fact: a six-column cache key — transcript hash ·
   method · version · provider · model — decides whether a run may be *reused*, and the same row
   records what it *cost*. Layer 1 always had an idempotency guard; Layer 2, the paid one, had
   none, and at `temperature: 0` that bought byte-identical output at full price. Migration
   `20260830170000` (**applied**) adds the traffic columns: `calls` counts logical windows,
   `http_attempts` counts requests, and the difference between those two numbers is the whole
   point — one run recorded `calls: 20` for ~60 requests and zero completions.

2. **Sarvam locked to transcription only.** Enforced in the registry *and* in the adapter, so a
   direct import cannot route around it. `reasoningAvailable()` no longer reads `SARVAM_API_KEY`;
   that function was the actual coupling. The rule costs ~2 points of Hinglish quality and is
   written down so nobody rediscovers that as a surprise.

3. **A provider registry and one OpenAI-compatible adapter.** Gemini, Groq, SambaNova, Mistral and
   Ollama all speak the same wire format; adding a provider is a registry entry. An unset
   `REASONING_PROVIDER` now **throws** — no default, because the old default is what spent a
   transcription budget on reasoning.

4. **A shared rate-limit scheduler.** The first run turned 20 windows into ~60 requests in 34
   seconds because each window retried independently into a 429. The decision to slow down is now
   made **once per run**: every attempt queues, and a 429 penalises the shared queue so backed-up
   work resumes spaced instead of bursting. Next run: 27 attempts at ~8.2 req/min.

**Structured output is now an engine contract.** Seven of twenty windows came back as prose or
truncated arrays. Retrying is not the fix — at temperature 0 the same request fails identically —
so the engine now declares a JSON Schema, transcribed verbatim from the prompts' own "Output
shape" blocks, and each adapter translates it: strict `json_schema`, `json_object`, or prose-only.
Same contract, three dialects, which is what keeps output comparable across models.

**Provider migrated to Groq.** `gemini-3.5-flash` was refused after ~30 requests while
`gemini-3.5-flash-lite` succeeded seconds later on the same key — so Gemini quotas are per-model,
and the ~500 RPD figure from third-party sources is wrong for this project. **One lecture consumed
a day's Gemini capacity.** Groq's own docs give `openai/gpt-oss-120b` 1,000 RPD / 200,000 TPD,
strict schema support, and no training on customer data. A ClassMind-shaped probe — real prompt,
real schema, real window, real `locateQuote` — passed on all four criteria including **verbatim
Hinglish quoting**, which was the one risk no documentation could settle.

**Blocked — and this is the finding that outranks the rest.** Groq charges rate-limit budget on the
**reservation**, not usage: a call using 1,435 + 1,950 tokens was charged 5,435, exactly
`input + max_tokens`. Sustained safe rate is ~1.5 req/min, so **a 20-window run takes ~20 minutes**
— past undici's 5-minute client default (which killed the third attempt mid-run) and past
**Vercel's `maxDuration = 300`.** The current architecture cannot run on a deployment at Groq's
real token rate. That is an independent argument for Option D (9 calls) and for the background-job
migration already drafted and still unapplied.

**No clean baseline run exists.** Three attempts, three different failures, nothing written by any
of them. The Sarvam baseline is intact at 24 items / 28 evidence and no Sarvam reasoning call was
made all session.
*(2026-09-01: a fourth attempt ran on 2026-08-31 and came within one window — ledger row
`ff0721de`, partial, 19/20, 46,735 tokens, not reusable by design. The operator then closed the
Groq experiment with that as its final outcome; reasoning moves to the paid Gemini key. The
clean-baseline goal transfers to the Gemini phase. See the 2026-09-01 closing entry.)*

**Verified:** 311 offline checks pass (providers 100, extraction 76, transcript 33, reconstruction
55, knowledge-plan 47); tsc and eslint clean.

**Next:** fix the client timeout in `scripts/verify-processing-run.mts` (test tooling only), take
the clean baseline on Groq — budget ~109K of 200K daily tokens, about one attempt per day — then
build Option D with pass-level completeness.

## 2026-08-30 (evening) — The Sarvam balance was emptied by testing, and nothing was counting

**What happened.** The operator topped up the Sarvam account during the day's session, uploaded
nothing, and by **13:21 UTC** the account was empty. Lecture `03f38b9e` ("CC Lec1.mp3", course
`fb7c7416`, created 13:20 UTC in v2) records the moment:

    Sarvam POST failed: 402 {"error":{"message":"No credits available.",
    "code":"insufficient_quota_error","request_id":"20260830_db200386-..."}}

A second upload (`90356152`) hit the same 402 minutes later. Those two are the **victims**, not the
cause — by then the money was already gone.

**Where it went, from the evidence that survives.** No live ASR job succeeded after 2026-08-22:
`lectures` holds exactly one non-fixture `provider_job_id` in its whole history
(`20260822_1e44ad2c`). So the spend was **not** transcription. It was the **reasoning** path.
`classmind-v1/.scratch/dev.log` records three `POST /api/lectures/{id}/extract 200` at **63 s, 62 s
and 56 s**, plus a `GET /ask` at **11.1 s**. A 60-second extract is Layer-2 reconstruction issuing
`sarvam-105b` chat completions, one per window, four at a time. The e2e test accounts
(`faculty.test@`, `student.test@`) last signed in at **12:34 UTC**, so suites were still being
driven ~45 minutes before the balance ran out. The dev logs only cover the most recent server run,
so **three extracts is a floor, not a total.**

**The trap, stated plainly, because it is not obvious from reading the code.**
`TRANSCRIPTION_PROVIDER=fixture` makes a run look free and is not.
`src/lib/reasoning/index.ts` has **no fixture provider** — `getReasoningProvider()` returns Sarvam
unconditionally. Replay removes the ASR call and leaves every reconstruction call intact. Every
suite that reaches `/extract` or `/ask` — `test:quarantine` included, which is exactly the one run
today and the one whose header advertises `TRANSCRIPTION_PROVIDER=fixture` — bills real tokens.

**What is now in force.** Root `CLAUDE.md` gains a section, *"Spending the operator's money"*, and
both `classmind-v1/CLAUDE.md` and `classmind-v2/CLAUDE.md` open with the paid/free suite split.
A session must ask before any run that touches a paid endpoint, name the endpoint and the expected
call count, and re-ask for each run — approval is per run, not per session.

**Still missing, and this is the real defect.** Nothing in the product counts what it spends. There
is no token accounting in the schema (`knowledge_items.model_raw` is empty), no per-run cost line
in any suite's output, and no session log recording what a paid run cost. A `costEstimate` key
exists in lecture `provenance` for ASR and has no equivalent for reasoning. Until
`reconstructLecture` reports calls and tokens and a suite prints them, this recurs — the guard just
added is a rule, and a rule nobody can measure against is the same shape of defect as the advisory
language check that let the wrong-language transcript through.

## 2026-08-30 — A transcript guard that can see the failure it was written for; and a documentation gap that became a correctness gap

**Done:** Priority 1 shipped in v1 and verified. `src/lib/provenance/transcript-validation.ts`
replaces `language-check.ts` and answers a different question: not *"does this transcript match
the language the run was configured for?"* but *"is this plausibly any language this product
serves?"* It is **configuration-independent**, it **judges at any length**, and a rejected
transcript is **quarantined before extraction can read it**. Migration
`20260830100000_transcript_quarantine.sql` adds the `quarantined` status and a
`transcript_validation` verdict column, and was **applied to the live Supabase project by the
operator**. Verified: transcript guard 33/33, extraction 76/76, and quarantine end-to-end 29/29
against a running server with real auth and the live database — the last of those driving the real
route handlers, because the 2026-08-22 failure was not a guard that judged wrongly.

**The four defects in the old guard are worth recording for their shape, not their detail.** Each
is a way for a check to exist, look reasonable in review, and be incapable of firing:

- **It compared two fields that agree by construction.** The mismatch check asked whether the
  engine's reported language matched the configured one. On the run it was written for, Sarvam
  reported `en-IN` because `en-IN` was what it was sent. **A guard that depends on the setting it
  is meant to check cannot detect a failure in that setting.**
- **Its second signal does not exist in production.** `language_probability` is null on every live
  batch response. The confidence heuristic worked only on the captured fixtures, which happen to
  carry it, so it could never have fired against a real call — and its fixture success is what made
  it look tested.
- **Its third signal was switched off by a size threshold.** A 120-token floor meant the one check
  that reads the actual text refused to judge the exact 65-token clip that failed. The signal was
  not weak: 0.000 English function words against 0.427 for the genuine English clip in the same
  run. **A threshold that turns a check off on small samples creates a blind spot precisely where
  the cheapest failures live.** The replacement scores the rate with a Wilson interval and rejects
  only when the optimistic end is still below threshold — sample size now changes how much evidence
  is demanded, never whether the question is asked.
- **Its verdict was advisory and nothing consumed it.** The old file said so in its own header: it
  "only ever appends a limitation for a human to weigh. It never blocks a transcript." **A verdict
  no code path reads is not a guard**, and that is why 21 candidates were extracted from a lecture
  nobody gave.

**`scripts/e2e.mts` has been silently aborting since 2026-08-24.** It reads `ask.json.items`;
commit `f0fc84e` rewrote `/api/courses/[id]/ask` to return `sources`. On a run where the ask
succeeds, `ask.json.items.length` throws a `TypeError`, `main().catch` turns it into a one-line
failure, and **17 of the suite's 64 checks never execute** — including the whole section titled
*"24. No unverified information reaches students"*. It fails in exactly the case where the product
works, which is why it does not read like a product bug.

Nobody noticed for six days. **The documentation gap caused the correctness gap.** The 2026-08-24
and 2026-08-26 sessions left no session log and no entry here, so nothing said the routes had been
rewritten, nothing said the suite had not been re-run, and no reader — Shiv, Darsh, or a later
session — had any reason to look. Two lines of test code were wrong; the reason they stayed wrong
is that the record was dark. That is the concrete cost of skipping the write-up, and it is exactly
the cost `TEAM.md` §0 predicts.

**Also done:** the eight-day gap in the record is closed. Three reconstructed session logs
(2026-08-22 evening, 2026-08-24, 2026-08-26), each carrying a banner saying it was written
retroactively and flagging its inferences as inferences; four entries here; and one
`AI-Memory/Inbox/` capture. Nothing was written to permanent `AI-Memory/`.

**In progress:** A **ClassMind v2** app has been forked to
`Projects/classmind/product/classmind-v2/` for a UI/MVP sprint. It runs on port 3200 and is
independent of v1. **v1 is unchanged apart from the Priority 1 work above** — the fork exists so
that UI iteration cannot destabilise the pipeline the capstone's evidence comes from. The cost is
two codebases to keep in step, and the point at which they diverge irreconcilably has not been
decided.

The Priority 1 work is in the working tree and **not yet committed** as of this entry. Anyone
reading `origin/master` will find `f81956f` (2026-08-26) as the newest commit and none of the guard
in it.

**Blocked:**

- **Reconstruction caps at roughly 36 minutes on the request path.** Measured on 2026-08-26: 50
  minutes needs 42 calls and ~440 s, past the `maxDuration` ceiling. **A 50-minute lecture cannot
  be processed at all**, and most real lectures are longer than 36 minutes. Not fixable by tuning;
  reconstruction has to move off the request path into a background job.
- **Transcript/audio identity is unsolved.** The guard now catches a transcript that is in the
  wrong *language*; nothing proves a transcript belongs to the *audio it is stored against*.
  Lecture `5ced44b6-e156-4ddb-9146-14035d366620` still carries a foreign transcript, deliberately
  left as it was on 2026-08-22 because overwriting a stored raw response is an operator decision.
- **Duplicate-processing has never actually been verified.** Its only test asserts
  `again.json?.skipped === true`, and `f0fc84e` removed `skipped` from the extract route's response
  — correctly, since re-running now legitimately does work. The check has been asserting a key the
  route does not return ever since, so "re-running the same method does not duplicate" is an
  untested claim.
- Unchanged from before: the walkthrough is still unrun, the college partnership has not started,
  and the Privacy Policy and Terms state the consent gap rather than closing it — there is still no
  consent mechanism and no age verification.

**Next:** Fix the two test assertions and re-run `npm run test:e2e` end to end, before anything
else. Until that suite completes, the student-safety checks are unverified claims. Then decide,
in writing, between moving reconstruction to a background job and accepting the 36-minute ceiling —
that decision has been implicit since 2026-08-26 and belongs in `decisions.md`.

## 2026-08-26 — Reconstruction v1.1.0: assignment recall bought with the maximum lecture length

**Done (2026-08-26, recorded here on 2026-08-30):** Reconstruction v1.1.0. Until this change,
Layer 2's actionable pass only looked at windows around sentences Layer 1's cue lexicon had already
flagged — which made a roughly 1,000-line Hinglish word list the **hard recall ceiling on
assignments**. A lecturer phrasing an obligation in words the list did not contain produced no
window, so the model was never pointed at that part of the lecture and the assignment was
invisible, with no error and no empty state. The project's own history records this happening
twice: two batches of lexicon terms were added only *after* a real lecture came back empty, and
both times the symptom was indistinguishable from a lecture that genuinely had no assignment.

Both passes now sweep the whole lecture, and cue hits are passed into each window as evidence
*about* that window rather than as permission to look at it. The lexicon is a cheap, precise,
offline prior, and a prior belongs in the prompt, not in the control flow. Actionable windows
overlap by 60 s (180 s window, 120 s stride) because an obligation is assembled from statements up
to a minute apart; overlapping reconstructions are merged on where their evidence sits rather than
on what the model called the item. Version bumped to 1.1.0 so runs before and after stay
comparable.

**The cost was measured, not estimated, and it is large.** The sweep doubles the call count: 23 min
/ 20 calls / ~200 s fits; 36 min / 30 calls / ~300 s sits at the `maxDuration` limit; 50 min and
90 min both time out. **The ceiling drops from roughly 90 minutes to roughly 36.** Concurrency was
deliberately left at 4 rather than raised on a guess, because the provider rate limit has not been
measured and guessing it trades a known ceiling for silent 429 losses.

Detail in
[`sessions/2026-08-26-reconstruction-v1-1-0-cue-lexicon-as-hint.md`](sessions/2026-08-26-reconstruction-v1-1-0-cue-lexicon-as-hint.md).

**In progress:** Nothing.

**Blocked:** The 36-minute ceiling is now the binding constraint on real classroom use and is not
fixable by tuning. Everything blocked on 2026-08-24 remained blocked. The end-to-end suite had been
aborting since 2026-08-24 and this session did not run it, so that went unnoticed for two more
days.

**Next:** Move reconstruction off the request path, or accept the ceiling in writing.
*(Neither was done. On 2026-08-30 the transcript guard took priority as the more serious
correctness problem, and the ceiling is still open.)*

## 2026-08-24 — A knowledge layer that reconstructs what a lecture meant; and, unnoticed, a broken end-to-end suite

**Done (2026-08-24, recorded here on 2026-08-30):** The knowledge layer. Sentence-level extraction
cannot represent a real assignment: in the reference lecture one assignment spans four sentences
over 45 seconds, and the fourth is only interpretable given the third. A one-span
`extraction_candidates` row cannot hold that shape, so the product had been emitting two unrelated
assignments instead of one.

Three layers now sit on top of the candidates, and **candidates are not replaced** — they stay the
immutable Layer 1 record and the baseline every future extraction method is compared against, which
is the comparison the capstone exists to make. Layer 2 (`src/lib/reasoning/`) reconstructs items
from a bounded window around one candidate cluster: the model never sees the whole lecture, every
quote it returns is verified verbatim against that window, and an item with an unverifiable quote
is **discarded rather than repaired** — which makes "never invent" a property of the pipeline
instead of a line in a prompt. Layer 3 (`src/lib/knowledge/`) stores the result, derived but never
recomputed, so a student asking the same question twice gets the same answer.

Review moved from per-sentence to per-item, and only actionable kinds are gated behind a human;
topics and concepts publish automatically. The reasoning is asymmetric cost — a professor cannot
review thirty topics after every lecture, a mislabelled topic wastes a moment, and a wrong deadline
costs a grade. That is a real policy choice about who is accountable for what a student reads, and
it has no `decisions.md` entry.

Schema: `knowledge_items` + `knowledge_evidence`, many spans per item, which is the entire point of
the second table. Migration `20260823090000_knowledge_layer.sql` was already applied to the live
project. Detail in
[`sessions/2026-08-24-knowledge-layer-reconstruction.md`](sessions/2026-08-24-knowledge-layer-reconstruction.md).

**Verified at the time:** `next build` clean across all 24 routes, `eslint` clean. That was the
whole list.

**In progress:** Nothing.

**Blocked:** The wrong-language transcript defect, reproduced live on 2026-08-22, was untouched by
this session. Lecture `5ced44b6` still carried a foreign transcript. No consent mechanism.
*(2026-08-30: this session also broke `scripts/e2e.mts` and the duplicate-processing check, by
renaming two response keys without re-running the suite that reads them. Neither was visible on the
day; both are recorded in the 2026-08-30 entry above and in this session's log. Left here as the
forward pointer, not as a claim about what was known at the time.)*

**Next:** Run the end-to-end suite against the rewritten routes.
*(Not done here or on 2026-08-26; done on 2026-08-30, which is when the breakage was found.)*

## 2026-08-22 (evening) — Deployed, given a legal surface, and given its first live Sarvam call — which reproduced the failure it was supposed to have fixed

**Done (2026-08-22 evening, recorded here on 2026-08-30):** Four things, in one continuous evening.
Full detail in
[`sessions/2026-08-22-evening-deploy-identity-and-lecture-knowledge.md`](sessions/2026-08-22-evening-deploy-identity-and-lecture-knowledge.md).

*Deployed* to `https://copy-paste-labs.vercel.app`, and found the deployment that already existed
was broken while looking fine: a Production build marked Ready that served 404 on every path,
because Root Directory was unset, so Vercel found no `package.json` at the repository root,
detected no framework, and built nothing in two seconds. Region was **measured, not assumed** — the
Supabase project is in AWS `ap-south-1` and the functions were in `iad1`; five calls to
`/api/courses` gave a median of 1545 ms from `iad1` against 389 ms from `bom1`, so the functions
moved to `bom1`. 67 end-to-end and 33 language checks green **against the deployed app**, not
localhost.

*A Privacy Policy and Terms of Service* at `/privacy` and `/terms`, linked from a footer on every
page, required by Google's OAuth consent review and written from what the code actually does. Three
disclosures a template would have missed: this system is designed **not to delete** and has no
automatic expiry of anything; classroom recordings carry the voices of students who may be minors
and the app has no age verification and no consent mechanism, so it says "do not use with minors
yet"; and faculty upload recordings of other people, which the app cannot obtain consent for, so
the obligation is put on the uploader explicitly rather than left unowned. Neither document has
been reviewed by a lawyer and both say so.

*The lecture-identity fix verified on production*, 30/30 against production and 30/30 against
localhost, with the guard tested rather than assumed — a file named to match a fixture slug was
uploaded through the production bundle and refused, leaving nothing stored. Blast radius measured:
22 of 27 lectures carried a replayed transcript, 21 were the session's own test uploads, and
exactly one was a real user lecture, which had extracted 21 candidates from a thermodynamics
transcript. Zero of those were confirmed and zero students were enrolled — the confirmation gate
did its job while the layer beneath it was wrong.

*Teaching extraction.* A real 23-minute college lecture produced exactly one candidate, and no
tuning would have helped: every `CandidateKind` the schema allowed was a category of **action**, so
twenty-two minutes of teaching had nowhere to be stored even if something had detected it. The same
lecture now yields 32 items. The teaching pass matches sentence *shapes* rather than subject words,
and is composed with the actionable pass rather than merged into it, because the two have opposite
error costs — an obligation should be missed rather than invented; a topic is cheap to
over-produce and expensive to miss.

**The evening's most important result is a disproof.** Making the first live Sarvam call reproduced
the romanized-Arabic misdetection on an English lecture **with `language_code` sent explicitly as
`en-IN`** — which disproves the fix recorded on 2026-08-21, since stating the language does not
prevent it. All three guards stayed silent, each for a different reason, and those three reasons
are what the 2026-08-30 rebuild was designed against.

**In progress:** Nothing.

**Blocked:** The wrong-language defect, now reproduced live and with every existing guard shown
useless against it. The one real lecture carrying a foreign transcript, deliberately left alone.
No consent mechanism behind the two documents that describe its absence. Preview deployments have
no Supabase configuration and fail at request time, noted in `DEPLOY.md` rather than silently
widened. The walkthrough is still unrun and the college partnership has not started.

**Next:** The wrong-language guard, which by the end of the evening had a measured diagnosis and no
fix. And this entry, which was not written for eight days.
*(The guard was rebuilt on 2026-08-30. The record was restored the same day.)*

## 2026-08-22 — ClassMind V1 exists and its end-to-end workflow is verified; running it found two real defects

**Done:** The Product Platform is built and, for the first time, actually driven. A faculty
member can create a course, add course context, upload a lecture, watch it process, read a
timestamped transcript, review extracted candidates against their evidence, confirm / edit /
reject them — and a student can then open the course, read only what was confirmed, ask a
question, and jump to the transcript timestamp the answer came from. Four verification suites,
all green: extraction 75 checks, provenance 16, end-to-end 67, languages 33. Detail in
[`sessions/2026-08-22-classmind-v1-build-and-verification.md`](sessions/2026-08-22-classmind-v1-build-and-verification.md).

**The session's real content is what running it exposed, because none of it was visible from
code that compiled.**

*First:* the extraction engine read an 18-minute **university course-outline lecture** as two
generic guidance items — missing the whole module-by-module syllabus and the prescribed textbook,
which are the only two things in that lecture a student needs. The lexicon had been built from a
Class-12 coaching lecture and knew "homework", "DPP" and "notes on Telegram"; it had no rule for
a lecturer walking through a syllabus. Two rules later, the same lecture yields 21 candidates.
Method version 1.0.0 → 1.1.0.

*Second, and worse:* **the provenance guard written for the Arabic failure cannot see the Arabic
failure.** Sarvam returned fluent romanized Arabic for an English lecture and reported
`language_code: "en-IN"` — the code the run was configured with. The check compares those two
fields, so the branch is unreachable on the one run it exists for. Only the engine's 0.617
confidence flagged it, clearing the 0.8 threshold by 0.183; at 0.85 that transcript would have
carried no warning at all. `language-check.ts` now reads the transcript text instead — English
function-word density is 42.5% in the genuine English lecture and 3.9% in the Arabic one.

**Both defects share a shape worth naming:** the code was written against the *description* of a
problem rather than against the input that caused it. Neither was findable by reading, by
typechecking, or by building. Both took under an hour to find once something actually ran.

**Decision:** [2026-08-22 — Build the Product Platform V1 before the walkthrough runs, and encode
the domain model in it](decisions.md). This crosses the frozen walkthrough protocol's stopping
rule **completely** — `extraction_candidates.kind` enumerates the domain model in a check
constraint, before the walkthrough that was supposed to validate it. Recorded with its cost
stated rather than argued away.

**In progress:** Nothing.

**Blocked:** **No live Sarvam call has ever been made from the product.** Everything verified
today ran through a fixture provider replaying three responses captured in Lab v0 RUN 1, all of
them found material rather than a class anyone taught. Constitution VII's one-command
regeneration is unmet for the product, and the Azure Blob SAS convention in
`uploadToPresignedUrl()` is still an untested assumption. There is no romanized-Hinglish ASR
fixture — the case the lexicon covers most heavily and has the least evidence for. The `translit`
Arabic bug is **still unfixed in Lab v0**; only the product guards against it. The walkthrough is
still unrun, the college partnership has not started, and there is no consent/data-protection
position.
*(2026-08-22 evening: the first live Sarvam calls were made, clearing the "no live Sarvam call"
blocker — and the first one reproduced the Arabic misdetection. "Only the product guards against
it" overstated what the product did: its guard was advisory and length-gated, and it stayed silent
on the 65-token clip that failed. A Privacy Policy and Terms now exist, which state the consent gap
rather than closing it; the app still has no consent mechanism. 2026-08-30: a romanized-Hinglish
ASR fixture now exists — an excerpt of the real 23-minute cloud-computing lecture, at
`fixtures/transcription/cloud-computing-hinglish.json` — and the language guard has been rebuilt so
that it blocks rather than advises. Everything else in this paragraph is still true. Left in place
as the record of what was true then.)*

**Next:** **One real lecture, recorded by an actual lecturer, through a live Sarvam call.** Not
more features. The product's whole claim is that a student can trust what they read, and every
number behind that claim currently comes from three found recordings and a replay.
*(Done 2026-08-22 evening: two 40-second clips cut from two different lectures went through live
Sarvam against production, and a real 23-minute college lecture was processed end to end. Left in
place as the record of what was true then.)*

## 2026-08-21 — Milestone 2's build finished on 2026-08-19; the documents caught up today

**Done (2026-08-19, recorded here on 2026-08-21):** Milestone 2 component 3 — the
`TranscriptionProvider` boundary, the Sarvam Batch adapter, the transcribe and poll routes, and
the provenance module. Committed as `b3db63b`. A run can now go from stored audio to a stored raw
transcript with provenance written in the same `UPDATE` as the transcript, because Constitution
IV forbids retrofitting it. Provisioning the backend also surfaced two real bugs, both fixed in
the same commit: `setup-storage.mts` checked `error.status === 404` but the SDK reports a missing
bucket as `status` 400 with `statusCode` `"404"` — a *string*, in a different field — so the
existence probe read as fatal and the bucket could never be created; and the bucket's 500 MiB
file limit was rejected outright because the Supabase Free plan caps the global limit at 50 MB.
Full detail in [`sessions/2026-08-19-milestone-2-component-3.md`](sessions/2026-08-19-milestone-2-component-3.md).

**Done (2026-08-21):** The 2026-08-19 session left no record at all — no session log, no entry
here, no `roadmap.md` line — and **its commit was never pushed**, so for two days `origin/master`
stood at `98a7b7a` and Shiv and Darsh could not see any of component 3. Both are now fixed:
`b3db63b` is pushed, and the missing session log has been written retroactively and marked as
such.

The push failure has a structural cause worth naming, because it will recur: `scripts/autosave.sh`
is wired to `PostToolUse` on `Write|Edit`, so it never fires for a commit made through the shell —
which is exactly the deliberate, well-messaged commit `CLAUDE.md` asks for at the end of a
session. **The auto-push safety net covers the incidental path and not the intentional one.**
Recorded as a candidate for the BuilderOS platform, not fixed here.

**Sarvam's terms on secondary use of submitted audio have been read, and the vendor choice
stands.** This clears a blocker that had been listed as "Next" since 2026-07-29. Two honest
caveats: the reading happened before the API key was obtained but was never written down, so this
entry records it on Shyam's confirmation rather than from a contemporaneous note; and no extract
or clause reference was kept. **If a specific term ever matters — retention, deletion, training
use — it must be re-read and quoted, not recalled.** The unchecked box in `lab/v0-ingestion/README.md`
and `roadmap.md` had become a false blocker, which is the same class of error the 2026-08-11 audit
found and corrected.

**In progress:** Nothing.

**Blocked:** Unchanged except for Sarvam's terms, now cleared. The walkthrough is unrun, the
college partnership has not started, and there is no consent/data-protection position. **No live
Sarvam call has been made yet**, so Milestone 2 is built but unverified, Constitution VII's
one-command regeneration is unmet, and the Azure Blob SAS upload convention in
`uploadToPresignedUrl()` remains an untested assumption inferred from `storage_container_type`.

**Next:** **Book the walkthrough day.** Not Milestone 2's remaining work. `decisions.md`
(2026-08-11) named its own stop condition — *"If the next session again ends with Lab progress and
no walkthrough date, that is this decision going wrong, and the answer is to stop building and
book the day"* — and the 2026-08-19 session met it exactly. `roadmap.md` Stage A needs zero code
and explicitly states that Lab v0's progress does not advance it. Transcript normalization and
display are the remainder of Milestone 2 and are deliberately *not* next.

## 2026-08-11 — Documentation reconciled with the code; Lab v0's justification corrected

**Done:** An audit of every ClassMind document against the code that now exists, and a
seven-file reconciliation. The substantive finding was a **false claim**, not a stale one:
`README.md` said "Lab v0 exists only because steps 2 and 8 of [the walkthrough] require a
transcript." The frozen protocol says step 2 is "transcribe with whatever ASR is nearest to
hand… 20 min." **The walkthrough never required Lab v0.** Engineering work was being justified by
a mandate a frozen document does not contain — the worst class of error here, because the two
co-founders reading only the repo had no way to catch it.

Replaced with the honest version, now canonical in `decisions.md` (2026-08-11): Lab v0 is an
**independently chosen** Experiment Platform for repeatable, measurable, reproducible
transcription. It validates no concept, discharges no part of the walkthrough, and **the
walkthrough remains the domain-model validation gate.**

A second finding was a misattribution. `lab/README.md` banned "No database, no HTTP API" citing
**Constitution VII** — but Article VII governs *evaluation-run records*, prescribes "one flat
table and a directory of JSONL files," and never mentions APIs. A sentence prescribing one table
had been read as a prohibition on tables. The constraint is withdrawn as a misreading; **the
Constitution needed no change and got none.** "No auth, no embeddings" survives and still binds.

Four decisions made on 2026-08-07 that had lived only in commit messages and source comments are
now recorded in `decisions.md`: the stack, the database/HTTP-API reversal, Sarvam's async Batch
API, and Course Context staying out of Lab v0. Two older entries gained dated scope notes rather
than edits — the 2026-07-29 multi-tenancy decision (binds the Product Platform; `runs` is not in
violation) and the 2026-07-30 platform split (its "Experiment Platform comes *after* the
walkthrough" clarification is no longer what we are doing, and that change is now visible).

Frozen and untouched, deliberately: `walkthrough-protocol.md`, `constitution.md`,
`capture-contract.md`, `domain-model.md`, `architecture.md`. No source code was modified.

**In progress:** Nothing.

**Blocked:** Unchanged from 2026-08-07 — see below. Nothing in this pass cleared or created a
blocker.

**Next:** Milestone 2 component 3 — the `TranscriptionProvider` interface, the Sarvam adapter,
and the submit/poll routes. Separately and still unscheduled: **book the walkthrough day.** Its
continued slippage is the named cost of the 2026-08-11 decision, and it needs a date, not a
resolution.

## 2026-08-07 — Lab v0 built to Milestone 2, component 2

**Done:** ClassMind split into three directories — `.knowledge/` (permanent), `lab/`
(disposable), `product/` (empty until the Stage C gate) — making the 2026-07-30 platform
decision physical. Then Lab v0 scaffolded and built to two thirds of Milestone 2.

*Milestone 1:* Next.js app with typed env access, an anon-key browser Supabase client and a
`server-only`-guarded service-role client. `npm run build` passes with no real credentials and
`/` is confirmed dynamic, so the build never depends on reaching Supabase. Found and fixed a real
bug: the scaffolded `.gitignore` was silently swallowing `.env.example`, confirmed with
`git check-ignore -v` before and after.

*Milestone 2, component 1:* the `runs` table migration and `scripts/setup-storage.mts`. RLS
enabled with zero policies — deny-by-default, since only the service-role client touches the
table. The migration carries a guardrail comment: no foreign key to any course or session
concept, and none to be added speculatively, because which table a future FK should target is
what the walkthrough exists to settle.

*Milestone 2, component 2:* `POST /api/runs` — validates against shared MIME and size limits,
generates the run id server-side so the storage path is known before the row is written, and
mints a Supabase signed upload URL. **Audio bytes never touch this server.** Incorporated the
async job lifecycle: Sarvam's Batch API is asynchronous, so a run models a job rather than a
request, and `provider_job_id` is what makes an in-flight transcription resumable across a
refresh or restart.

**Blocked:** Two manual steps, both needing account access, both blocking a live end-to-end test
but not further building — no Supabase project or `.env.local`, so the migration has never been
applied and the bucket has never been provisioned; and no Sarvam API key, which is itself gated
on the terms below.
*(Resolved 2026-08-19: the Supabase project, `.env.local` and a Sarvam API key all exist; the
migration is applied and the bucket provisioned. Left in place as the record of what was true
then.)*

**Next:** Milestone 2 component 3 — `TranscriptionProvider` interface, Sarvam adapter,
submit/poll routes.

**Watch:** Sarvam's terms on secondary use of submitted audio have been listed as "Next" since
2026-07-29 and are still unread. Ten minutes, a legal precondition to the first upload, and
capable of invalidating the vendor choice outright — which would waste the adapter that is next
in the queue.
*(Resolved 2026-08-21: read, and the vendor choice stands — though the reading was never written
down at the time. See the 2026-08-21 entry for the caveats that come with recording it late.)*

## 2026-07-30 — Experiment/Product platform split encoded

**Done:** Recorded the decision to build ClassMind as two distinct systems — a disposable
**Experiment Platform** that generates evidence, and a **Product Platform** built only after the
concepts are validated. Encoded it across five documents from each one's own angle, without
duplicating rationale: `decisions.md` holds the full reasoning (source of truth); `roadmap.md`
was re-sequenced into the gated pipeline Experiment → Evidence → Validated Concepts → Product;
`capture-contract.md` and `constitution.md` each gained a short scope note; `project.md` and
`architecture.md` got orientation and a guardrail banner. Also refreshed `project.md`'s stale
current-state and key-files (they still said "blocked on founder sign-off").

The one sharpening added beyond the brief: **disposable in code, not in evidence.** The
Experiment Platform's software is throwaway, but the numbers and their provenance are the
capstone contribution and are not — so the Constitution splits by platform (production-data
articles bind the product; research-validity articles IV/VII/VIII/IX bind the experiment too)
rather than exempting the experiment wholesale. Also flagged, and recorded in the decision: the
*first* walkthrough needs no Experiment Platform at all — it is manual.

`walkthrough-protocol.md` was deliberately **not** touched — it is frozen and pre-registered,
and the split does not materially change it.

**In progress:** Nothing.

**Blocked:** Git remains uncommitted/unpushed in this environment (push hits a proxy 403). The
knowledge base is 5+ commits ahead of `origin/master`, and `capture-contract.md` and
`walkthrough-protocol.md` have never been committed at all — Shiv and Darsh cannot see them yet.
*(Resolved 2026-08-07: both files are committed and the working tree is clean and in sync with
`origin/master`. Left in place as the record of what was true then.)*

**Next:** Run the manual walkthrough (Stage A). It needs no software.
*(Still true and still unrun as of 2026-08-11. Lab v0 was built instead, by a decision recorded
in `decisions.md` 2026-08-11 — the walkthrough remains the gate, not a discharged step.)*

## 2026-07-29 (later) — Domain model defined

**Done:** Wrote `domain-model.md`, the ubiquitous language for the product. It is organised
around one distinction that the earlier documents did not make: **what was said** (the Record
— permanent, append-only) versus **what is currently true** (the Ledger — derived by reading
Attestations in order).

Four concepts were abolished. *Academic Event* collapsed four unrelated kinds of thing into
one bucket, so most fields were empty most of the time and the product's central "must versus
should" distinction became a column that could be left blank — replaced by **Commitment**,
**Notice**, **Guidance**. *Deadline* was demoted from an entity to a property of a Commitment;
modelling it as a peer of Assignment is what made cross-lecture tracking look unsolvable.
*Knowledge* was replaced by **Course Ledger** — it could not be pointed at, owned, or changed.
*Exam topic* became **Scope** on the Exam Commitment, so topics accumulate through the term
instead of scattering.

Twelve concepts nobody had listed were added, of which three are load-bearing: **Consent
Grant** (Article I is unenforceable without it), **Authority** (answers who may attest, which
is a fact about the world rather than an access-control setting), and **Observer** (three
Observers disagreeing about one Utterance *is* the research contribution).

The verb changed from *approve* to **attest**, on the reasoning that a lecturer is not
inspecting an AI's homework — they are confirming their own words. "Did you say this?" is a
two-second memory check; "is this extraction correct?" is data entry, which is the thing that
kills adoption.

Verified article by article against `constitution.md`. No contradiction found. One genuine
tension surfaced and was resolved in writing: Article I's erasure right versus Article II's
append-only rule — "never edited in place" and "never deletable" are different rules, and
erasure must be a designed cascading operation built before the first real Recording.

**In progress:** Nothing.

**Blocked:** Git is still stuck on a stale `.git/index.lock` that this environment cannot
delete. Nothing since 2026-07-28 is committed, and the auto-save hook is blocked too — which
under the single-writer model means both read-only co-founders are looking at a repository
with no ClassMind in it at all.
*(Resolved 2026-08-07: the lock cleared and everything is committed. Left in place as the record
of what was true then.)*

**Next:** Three cheap experiments the domain model depends on and cannot answer by reasoning.
Annotate three real Sessions and count what fraction of Observations refer to an already-known
Commitment — under 5% and the Observation/Commitment split is ceremony at capstone scale, over
20% and it is mandatory. Print twenty Observations on paper and time three lecturers attesting
them. Read Sarvam's terms on secondary use of submitted audio before the first upload.

## 2026-07-29 — Project defined; architecture signed off

**Done:** Created the project from `_TEMPLATE` and archived all five pre-build research
documents verbatim under `.knowledge/research/`, with an index naming the full synopsis as
canonical and recording four known limitations of that research (unverified novelty claims,
targets set before measurement, no privacy analysis, directional market sizing).

Wrote `project.md`, `requirements.md`, `roadmap.md` from the canonical synopsis rather than
from all five — the shortened drafts are read-only history and nothing is derived from them.

Reviewed the synopsis as a build plan rather than as a document, and found six places where
it would cost us time or correctness. All six were put to the founders and confirmed:

1. Build the LLM extractor first; pattern matching and NER become comparison baselines rather
   than sequential tiers. The synopsis order spends months on the component its own research
   predicts will perform worst, and nothing works end to end until month five.
2. Hosted LLM API behind a swappable module, with fully on-premise operation promoted to a
   named post-capstone milestone rather than a vague future option.
3. One database — PostgreSQL with pgvector — instead of PostgreSQL plus a separately
   maintained FAISS index.
4. Live in-lecture transcription cut from capstone scope.
5. Multi-tenant schema from the first migration.
6. Every faculty correction stored as labelled data from day one.

Wrote `architecture.md` around a single load-bearing boundary: **proposed events versus
approved events**. Nothing reaches a student without a human approving it, which means an
extraction bug can never surface as a wrong deadline, and the extractor can be replaced
freely without touching the product surface.

**In progress:** Nothing. Awaiting Phase 0.

**Blocked:**
- **No college partnership.** The 15–20 real lectures needed for evaluation require
  institutional permission. This has the longest lead time of anything in the project and has
  not started. It is the item most likely to sink the capstone.
- **No consent or data-protection position.** Classroom audio captures identifiable students,
  not only the lecturer. India's DPDP Act 2023 applies. Required before the first real
  recording — and the hosted-LLM decision means transcripts leave our infrastructure, which
  must be disclosed.

**Next:** Phase 0 (see `roadmap.md`) — open the college conversation, draft the consent
position, and record 2–3 deliberately code-switched mock lectures so development is not
blocked while the real-data conversation runs. Then a thin vertical slice: one lecture,
end to end, crude but complete, by week 4.

**Watch:** transcription quality on real Hinglish is an untested assumption underneath the
entire project. Measure it in Phase 1, not Phase 4.
