# 2026-09-01/02 — Gemini phase, day one: two clean baselines, the first true end-to-end, and the product findings that set the next direction

**Inbox entry:** [`AI-Memory/Inbox/classmind/2026-09-01T2028Z-gemini-phase-day-one/`](../../../AI-Memory/Inbox/classmind/2026-09-01T2028Z-gemini-phase-day-one/)
**Chapter boundary:** everything after the recovery-closure capture (`fe68006`) up to the start of the v4 overnight run (02:00 IST 2026-09-02).

## Starting state

Recovery chapter closed; paid Gemini key configured (`gemini-3.5-flash-lite`); Sarvam topped
up; a new lecture recording existed; no clean reconstruction baseline had ever completed.

## What was done

1. **The first controlled paid Gemini run** — after snapshotting the Sarvam-era knowledge
   reading to `.knowledge/baselines/` (operator chose snapshot-then-run when told a complete
   pass replaces unjudged items). Ledger `77408ea3`: 20/20 windows, 0 retries, 27,979 tokens,
   118.7 s, outcome `succeeded`/`complete=true` — **the project's first clean, complete,
   reusable baseline.** All 35 quotes verified; 24 teaching auto + 1 assignment pending; the
   confirmed item survived; Gemini independently re-derived the research-paper assignment.
   One pre-spend failure cost nothing: the verifier crashes under plain `node` (`server-only`);
   the sanctioned launcher is `--conditions=react-server` (the `verify:run` npm script).
2. **A full read-only inspection** of that run —
   `.knowledge/reports/2026-09-02-gemini-run-77408ea3-inspection.md`: exact reconstructed
   requests for all 20 windows, per-window outcomes from captured counters, full stored
   output, and the verdict: defects are assembly-level — **R1** teaching windows share
   boundary segments and the teaching pass has no dedupe (two duplicate item pairs);
   **R2** raw responses are discarded though `model_raw` exists. Raw wire traffic:
   UNAVAILABLE, stated rather than papered over.
3. **The first true end-to-end run in product history.** Operator as faculty uploaded a real
   recording ("Robotics and Automation trial", noisy audio). First attempt failed **on our
   bug**: Windows reports `.aac` as `audio/vnd.dlna.adts`, and canonicalisation trusted any
   reported `audio/*` — Sarvam's allowlist (handed to us verbatim in its 400) refused the
   label, not the audio. Fixed in v2+v3: **the curated extension map now outranks the
   browser's report**; `.3gp` remapped (audio/3gpp provably absent from the allowlist).
   MP3 retry: Sarvam job `20260901_22466f9c` → validation `pass` (supported-rate 0.421,
   near-threshold, matching the "unclear audio" note) → Gemini `6ac53dca`: 7/7 windows,
   5,993 tokens, 38.8 s, clean+complete — **second clean baseline**. 4 items stored incl.
   "Transformation Assignment" correctly pending review.
4. **Ask, used in anger, exposed the next product frontier.** "Who was this assignment
   for?" produced a vague filler answer — one billed Gemini call. Diagnosis from data: the
   transcript names Shyam/Shiv/Darsh; the stored item carries no audience; Ask sees only
   stored items, so no answer engine could have said the names. Plus: Ask calls are
   entirely unmetered (usage returned and discarded), and retrieval alone could have
   answered as well for free. → five roadmap items recorded ("Backlog from first live
   use"): Ask routing (grounded/no-API for basic questions), honest gap-naming in answers,
   audience missing from the extraction contract, chat-first lecture page, meter Ask.
5. **Product direction set: "steal the grammar, not the product."** Operator proposed a
   Teams-like experience; assessment argued against cloning Teams (commodity features,
   Microsoft's moat) and for adopting the classroom-app grammar around ClassMind's
   differentiator — zero-entry, provenance-verified classroom memory; confirm-as-posting
   as the hero moment. Operator endorsed. Research captured in
   `.knowledge/design/teams-grammar/grammar.md` from Microsoft's public docs, then
   verified against nine screenshots of the operator's real student account — which
   corrected the docs (two-level per-class nav; a global cross-class Assignments
   aggregate worth adopting) and strengthened the chat rejection (real collaboration
   happens in a self-organized group chat outside class teams; class streams are run
   muted/broadcast).
6. **Operator directives now standing:** hard zero-spend rule until Ask routing is solved
   (dev:spend server stopped; the spend pre-flight refusing an unauthorized Process
   Lecture click was confirmed working as designed); v4 overnight autonomous build
   commissioned (grammar shell over Observatory skin; v3 freezes as pre-shell baseline).

## Decisions made (captured as candidates)

- Product identity: adopt the classroom-app grammar; reject LMS/communication features;
  ClassMind is the memory layer beside Teams, not a replacement.
- Snapshot-then-replace for the Sarvam Layer-3 reading.
- Zero-spend as standing default; per-run authorization continues.

## Problems hit

The AAC label refusal (fixed, both trees); the Ask answer-quality failure (diagnosed,
roadmapped); the verifier launcher crash (flag identified; script comment still to fix).

## Unresolved questions

- Orphaned lecture rows from refused/failed attempts (now three) — cleanup undecided.
- Ask conversation persistence: none exists; chat-first UI must not fake it.

## Ending state

Two clean ledger baselines (23-min and 7-min lectures); both apps tsc/eslint clean;
roadmap and grammar research committed; ~34K Gemini tokens + one short ASR job spent all
day, every metered number recorded. v4 overnight run beginning.

## Next session should start with

The v4 overnight run's handoff report (owner's morning review), then the two-day backend
brief (36-minute ceiling, Option D, background jobs) and the R1/R2/R6 fixes.
