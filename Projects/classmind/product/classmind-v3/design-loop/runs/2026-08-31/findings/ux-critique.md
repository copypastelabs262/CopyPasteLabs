# UX / Product Critic — before-state findings (2026-08-31)

Judged from rendered screenshots in `../before/`. Ranked by severity.

## 1. Raw provider JSON rendered verbatim as the failure message — CRITICAL
- **Evidence:** home-faculty desktop/mobile — `Sarvam POST failed: 402 {"error":...request_id...}` as card body copy, twice; overflows the card on mobile.
- **Why:** leaks vendor/billing internals to a teacher who can act on none of it; reads as a broken product; breaks mobile layout.
- **Change:** map error codes to human copy (`insufficient_quota_error` → "Transcription is paused — your recording is safe…"), raw payload behind a disclosure with a short support ref.

## 2. Failed and stalled lectures are dead ends — HIGH
- **Evidence:** "Failed" card and "Awaiting upload" card offer no button, link, or affordance.
- **Why:** the section titled "Needs your attention" gives the teacher nothing to do; stalled lectures rot silently.
- **Change:** every non-terminal status card carries one primary action; whole card links to the lecture.

## 3. Student home gives a student who missed a lecture nowhere to go — HIGH
- **Evidence:** two full-viewport empty states occupy ~70% of the page; the only live object (course card) is at the bottom; Ask is undiscoverable from home.
- **Change:** compact empty states with forward actions; courses above the fold; an Ask entry point on home.

## 4. Floating overlay widget occludes content on mobile — HIGH
- **Evidence:** dark "N" disc clips a lecture title at 390px.
- **Resolution:** identified as the Next.js dev-tools indicator (dev-only). Hidden via `devIndicators: false` so captures match what users see.

## 5. Same lecture appears twice; attention section mis-frames system failure as teacher work — MEDIUM
- **Change:** de-duplicate attention items out of "Recent lectures"; split framing of processing problems vs review queue.

## 6. Internal jargon in headline/summary copy — MEDIUM
- **Evidence:** "Your work", "read back", unexplained "7" in course meta.
- **Change:** retitle student home; replace "read back" with "revisit"; label or drop the mystery number. (The "7" is user-entered term data — left as data, not a design fix.)

## 7. Landing speaks to students in the headline and faculty in the body — MEDIUM
- **Change:** role-framed explainer; show the product's promise visually.

## 8. Sign-in: redundant header link, no password recovery, unstyled "Create one" — MEDIUM
- **Change:** style "Create one" as a link; center the card. (Password recovery flow: real gap, needs product work beyond this loop — recorded as remaining limitation.)

**Verdict:** partially achieved for faculty, failed for students. Most important fix: every status card carries one plain-language sentence and one concrete action, starting with the 402 string.
