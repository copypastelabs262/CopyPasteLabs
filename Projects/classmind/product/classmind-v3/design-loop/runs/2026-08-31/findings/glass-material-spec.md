# Glassmorphism / Art Direction Specialist — material system spec (2026-08-31)

## Assessment of before-state
No material system: dark mode is one near-black value with hairlines so faint panels
dissolve into the canvas; light mode is default flat white. No atmosphere, no light source,
no depth. The layout bones are solid, so this is almost entirely a surface/light problem —
and because the background is a static known gradient, most "glass" can be simulated with
zero backdrop-filter cost.

## Material hierarchy (as implemented in `src/app/globals.css`)
Core principle: only TWO element classes in the whole app may use `backdrop-filter` —
the sticky header (L1) and floating overlays (L4). Everything else fakes translucency with
layered gradients over the known L0 backdrop.

- **L0 `.cm-atmosphere`** — fixed ground plane: base gradient `#0D1322 → #0A0E18 → #080A10`, glow A (indigo, alpha .13, upper-left), glow B (cyan, alpha .06, lower-right), 2.8% SVG turbulence grain. Never `background-attachment: fixed`.
- **L1 header** — `rgba(13,18,30,0.72)` + `blur(14px) saturate(150%)`; the one always-on blur.
- **L2 `.glass-2`** — panel: silver gradient fill (.07 → .028), border `rgba(148,163,184,0.13)`, top-edge catchlight inset, layered shadow. No blur.
- **L3 `.glass-3`** — interactive: brighter fill (.10 → .045), border .17; hover brightens border, adds capped accent underglow, lifts 1px (lift removed under reduced motion).
- **L4 `.glass-overlay`** — floating: `rgba(17,23,37,0.84)` + `blur(20px)`; scrims behind it are opacity-only.
- **L5 `.glass-hero`** — max ONE per screen: internal top aura (alpha .10), gradient border, hue channel via `--hero-rgb` (accent = intelligence, amber = needs a human, danger = broken). State changes hue, never intensity.

## Light rules
- Max 2 ambient sources per screen, both at L0.
- May glow: primary CTA, live status dots, the single L5 surface. Glow alpha cap: 0.16.
- Depth separates via three channels — fill, border alpha, shadow length — never via blurring what is behind.
- Status colors are pigment (tinted chips with matching borders), not light.

## Typography-on-glass floors
- Display/headings ~15:1, body ≥12:1, secondary ≥7:1, meta ≥4.8:1 (≥12px only).
- No informational text below 0.60 alpha of #CBD5E1; accent TEXT is #8FB0FF minimum (raw #5E8DFF is a surface/glow color).

## Failure modes and guardrails
1. **Everything blurs** → exactly two blur tokens exist; components may not declare raw `backdrop-filter`.
2. **Neon soup** → per-screen light budget; glow alpha ≤ 0.16 via capped tokens.
3. **Uniform translucent cards** → adjacent levels must differ on all three depth channels; every screen uses ≥3 levels; L5 capped at one instance.
