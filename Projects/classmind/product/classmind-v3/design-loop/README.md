# Design Master Loop

A reusable improvement loop that operates on the **running** ClassMind V3 app:

> inspect → render → critique → decide → implement → render again → compare → verify → improve/revert → repeat

Design decisions here are made against **rendered screenshots of the real product**, never
against source code alone, and every iteration leaves evidence on disk.

## Where things live

```
design-loop/
├── config.json      targets (route × role), viewports, capture accounts, base URL
├── capture.mts      renders the real app, screenshots every target × viewport
├── verify.mts       tsc + eslint (+ next build with --build), writes results per run
├── state.json       the loop's memory: selected target, iteration history, verdicts
├── runs/<runId>/    evidence — one folder per label (before, iter-1, …), committed
└── .auth/           saved sign-in sessions (gitignored — contains live tokens)
```

## Running the loop

1. **Start the app** (the loop drives a live server):

   ```
   npm run dev          # port 3400
   ```

2. **Capture the current state:**

   ```
   npm run design:capture -- --run 2026-08-31 --label before
   npm run design:capture -- --run 2026-08-31 --label before --scheme dark
   ```

   Useful flags: `--target <name>` (repeatable, names from config.json),
   `--scheme light|dark`, `--base-url http://localhost:3400`.

3. **Critique** the screenshots from the specialist perspectives recorded in
   `state.json` (UX, visual direction, glass/art direction, technical). Findings and the
   decision (PASS / IMPROVE / REVERT / BLOCKED) are appended to `state.json` per iteration.

4. **Implement** the approved changes in `src/`.

5. **Re-capture** with the next label (`--label iter-1`) and **compare** against the
   previous label's shots.

6. **Verify:**

   ```
   npm run design:verify -- --run 2026-08-31 --label iter-1          # tsc + eslint
   npm run design:verify -- --run 2026-08-31 --label final --build   # + production build
   ```

7. Repeat until the quality gates pass or the safety guard (3–5 major iterations per run)
   is reached. On guard exhaustion: keep the best verified state, record remaining issues
   in `state.json`, stop honestly.

## Adding or changing targets

Edit `targets` in `config.json`. A target is `{ name, path, role }`;
`role` is `anon`, `student`, or `faculty` (accounts also in config). Optional
`clickFirst: "<css selector>"` navigates by clicking the first match after load —
use it to follow real data ("the first course this account sees") instead of
hardcoding ids.

## The money guard

Rendering must never spend money (root `CLAUDE.md` § "Spending the operator's money").
`capture.mts` aborts, at the browser network layer, every request to
`/api/lectures/*/extract|transcribe|poll`, `/api/courses/*/ask`, and all external
AI-provider hosts. Blocked attempts are recorded in the run's `manifest--*.json` —
a screen that tries to spend money on render is a finding, not a bill.

## Resuming a run

`state.json` carries the full iteration history and the last verdict. To resume, read it,
re-capture with a new label, and continue from the recorded iteration number. Evidence in
`runs/` is append-only — nothing is overwritten unless the same run + label is re-captured.
