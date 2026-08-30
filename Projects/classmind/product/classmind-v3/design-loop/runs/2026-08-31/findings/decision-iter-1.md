# Design Master decision — iteration 1 (2026-08-31)

All three specialists converged; conflicts resolved as follows.

## Decisions
1. **Committed dark-first identity ("The Observatory").** The visual director argued for
   retiring light/dark duality; the glass specialist proposed one material system with two
   lighting conditions. Ruling: single committed identity now — the duality had produced two
   mediocre themes, and the entire target vocabulary only reads on a dark ground. The token
   architecture (role-named custom properties) keeps a future "paper mode" cheap. Cost
   accepted: users who prefer light UIs lose the choice for now.
2. **Two accents, one budget.** Cool indigo for interactive/CTA; lamplight amber reserved
   for the trace motif (timestamps, playhead, attention edges) and mapped onto the existing
   `warn` token so the system stays four-hue.
3. **Scope of iteration 1:** token layer + shell + primitives (Card, EmptyState, StatusPill,
   Button, Dialog, PageHeader) + TeacherHome + StudentHome + landing + signin + shared
   failure-language module (`friendlyLectureError` + `TechnicalDisclosure`) + PipelineTrack.
   Course/lecture screens inherit tokens only; compositional redesign deferred.
4. **The Ask focal panel on the student home is a door, not a form.** Asking bills reasoning
   tokens per question; a live input on the home page would make spending a keystroke.
   The panel links into the course, where asking is a deliberate act.
5. **Money guard stays code-enforced** in the capture harness (network-layer abort of
   /extract, /ask, /transcribe, /poll and provider hosts). Zero blocked attempts so far.

## Deferred (recorded, not lost)
- Retry action on failed lectures (needs a re-transcribe affordance and an operator-cost
  decision — touching /transcribe is a paid path; not a CSS matter).
- Password recovery flow on sign-in (product gap, not a restyle).
- Role-framed landing explainer variants (single sequence kept for now).
- Course/lecture screen composition pass.
