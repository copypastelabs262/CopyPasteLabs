# Creative / Visual Director — before-state findings and direction (2026-08-31)

## Assessment
An unstyled admin scaffold: a centered 960px column of identical white rectangles under a
system-font heading, indistinguishable from a starter template. Nothing visualizes the
product's one magical claim — answers traced to the second they were spoken. The dark theme
is a dimmed photocopy of the light theme with a near-illegible landing headline. The most
prominent object on the faculty home is a raw JSON error dump, rendered twice.

## Findings (condensed)
- **F1 (critical):** raw 402 payload is the faculty home's focal point; also duplicated.
- **F2 (critical):** zero composition — every screen is one centered column of equal-weight cards; the urgent thing has the same visual temperature as an empty course row.
- **F3 (critical):** dark theme is an unfinished inversion; landing headline fails contrast. *(Partly a capture artifact — entry animation mid-flight — but the identity criticism stands.)*
- **F4 (high):** landing never shows the product; half the viewport empty.
- **F5 (high):** student home is 70% empty-state void.
- **F6 (high):** typography has no voice — one system family carries everything; timestamps/codes beg for mono.
- **F7 (medium):** the pipeline — the product's core drama — is reduced to a corner pill.

## Direction — "The Observatory"
A quiet, deep, instrument-lit academic workspace: cold cinematic depths, warm lamplight on
whatever needs a human.

- Commit to a **dark-first single identity**; retire the light/dark duality (light can return later as a reading preference inside long transcripts).
- Ground plane: deep blue-charcoal (#0B0E14 → #101522) with 2 large slow radial glow fields; atmosphere lives in the background layer, never on components.
- Materials: three elevation steps of translucent panel, 1px inner-lit borders, ~2% SVG grain.
- Signature accent: **lamplight amber** for the trace motif (timestamps, playheads, attention edges); cool accent stays for interactive; semantic colors reserved for pipeline states.
- Type: **Fraunces** (display) + **Inter** (UI) + **JetBrains Mono** (machine facts); mono micro-caps eyebrows over serif headlines as the recurring signature.
- Composition: asymmetric 12-col grid; one dominant object per screen; card size = importance.
- Faculty focal moment: the **Attention Beacon** (edge-lit hero card with pipeline track and humanized failure).
- Student focal moment: the **Ask panel** (luminous door to the product's point — a link, not a live input).
- Landing focal moment: the **Trace** (answer card → amber timestamp chip → waveform with lit playhead).

## Anti-goals
1. Do not decorate the existing skeleton — if the grid doesn't change, nothing changed.
2. Do not let cinematics eat operational truth — failures must get MORE legible.
3. Do not fill empty first-run screens with fake life.
