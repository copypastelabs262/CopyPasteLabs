# 2026-08-31 — The Design Master Loop, and ClassMind V3's first designed identity

**Inbox entry:** [`AI-Memory/Inbox/classmind/2026-08-30T2157Z-design-master-loop-observatory/`](../../../AI-Memory/Inbox/classmind/2026-08-30T2157Z-design-master-loop-observatory/)
**All work in `product/classmind-v3/`. `product/classmind-v2/` untouched, verified by git.**

## Starting state

`classmind-v3` existed as a byte-copy of v2 (its `package.json` still said `classmind-v2`,
port 3300). The UI was the v2 calm-light editorial system, and the faculty home's most
prominent object was a raw Sarvam 402 JSON payload rendered twice as body copy. The operator
asked for an autonomous, reusable design-improvement loop that judges the **running product**
from rendered pixels, improves one high-impact flow, and proves it with before/after evidence
— all inside v3, with v2 preserved.

## What was done

**1. The Design Master Loop now exists** at `product/classmind-v3/design-loop/`:

- `capture.mts` — Playwright drives the real dev server, signs in as the e2e test accounts,
  and screenshots every configured target × viewport (desktop/tablet/mobile, light/dark).
  **The money rule is enforced in code**: every browser context aborts, at the network layer,
  any request to `/extract`, `/ask`, `/transcribe`, `/poll` or an external AI-provider host,
  and records the attempt in the run manifest. Zero blocked attempts across every run.
- `verify.mts` — tsc + eslint (+ `next build` with `--build`), results written per run.
- `state.json` — target, iteration history, gate verdicts, deferred list. Resumable.
- `runs/2026-08-31/` — the full evidence trail: `before/`, `iter-1..4/`, `findings/`
  (three specialist critiques + the design decision), verify results, manifests.
- `README.md` — how to run it again.

**2. Four loop iterations produced "The Observatory"** — V3's first designed identity:
a committed dark-first system (the light/dark duality is retired), an L0–L5 glass material
hierarchy with exactly two backdrop-filters app-wide and hard glow budgets, three type voices
(Fraunces display / Inter UI / JetBrains Mono for machine facts), and one focal moment per
screen. Redesigned: both signed-in homes, landing, sign-in, shell, and the shared primitives.
Course/lecture screens inherit the tokens and were verified as regression surfaces only.

The UX repairs matter more than the paint: provider failures now render as human sentences
with the raw payload one disclosure away (`friendlyLectureError` + `TechnicalDisclosure`),
lecture state is a five-segment pipeline track that pinpoints *where* a failure happened,
the attention list no longer duplicates into recents, empty states are compact and carry a
forward action, the failed-lecture card ends in a verb, and the student home's focal Ask
panel is **a link into the course, never a live input** — asking bills tokens, and the home
page must not make spending a keystroke.

**3. The multi-agent structure was real.** Three independent specialist critiques of the
before-state (UX critic, creative/visual director, glass/art-direction) ran in parallel on
the rendered screenshots; their reports are preserved verbatim under `runs/2026-08-31/findings/`.
After implementation, a render-regression specialist (18 shots, pixel-level, measured
contrast ratios) and a hard-grading gate judge reviewed before vs after. The judge failed
iteration 2 with three named blockers; iteration 3 fixed them; the judge re-reviewed and
ruled **PASS**. Its one new finding and the regression pass's two live findings were fixed
in iteration 4.

## Decisions made (captured as candidates, not written into decisions.md)

- **Dark-first committed identity for V3**; light returns, if ever, as a designed reading
  preference. Cost: users who prefer light UIs lose the choice for now.
- **V3 moves to port 3400** and its own package name, so v2 (3300) and v3 can run together.
- A leftover v3 dev server holding port 3300 (PID 25488) was killed to make that true.

## Problems hit

- The `before` dark captures were partly contaminated by the entry animation freezing
  mid-flight in headless capture; fixed with `animations: "disabled"` so evidence is
  deterministic.
- The atmosphere layer was `position: fixed`, which paints only the first viewport in any
  full-page rendering — the gate judge caught it as a seam cutting through landing step 04.
  Now absolute over the whole document.
- Test-student had no enrollment, so the student home rendered nothing but empty states;
  enrolled `student.test@` into CC101 through the local `/api/enroll` route (a free
  Supabase write) so the screen could be designed against real data.

## Unresolved questions

- Should the failed-lecture card eventually carry a real "re-transcribe" action? It is a
  paid ASR call and per the locked rule an operator decision — the card currently ends in
  "Open lecture" instead. Needs a product answer, not CSS.
- Where is the line between "dark editorial" and the stated glass ambition? The gate judge
  called the current surfaces matte-leaning; one committed backdrop-blur moment would close
  it, at compositing cost. Deferred deliberately.

## Ending state

tsc, eslint and `next build` all pass over the final tree; 63 screenshots across five
labelled evidence sets; gate verdict PASS; v2 byte-untouched. The dev server for v3 runs on
port 3400. The loop is re-runnable from `design-loop/README.md` in three commands.

## Next session should start with

Run the loop against the **student course view + lecture screen** (the deepest student
surfaces, still on inherited tokens only), and settle the re-transcribe affordance question
with the operator before touching the failed-card verb again.
