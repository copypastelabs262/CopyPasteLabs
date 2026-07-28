---
status: Best Practice
created: 2026-07-28
updated: 2026-07-28
---

# Engineering Principles

Rules that hold across every CopyPasteLabs project. Violating one requires a written
Decision entry in `07_Decisions/` explaining why.

## 1. Simple beats clever
The next person to read this code is you, tired, in six months. Optimise for that reader.
Clever code that needs a comment to explain *what* it does should be rewritten. Comments
explain *why*, never *what*.

## 2. Solve the problem you have
No abstraction until the third occurrence. Two similar things are a coincidence; three are
a pattern. Premature abstraction costs more than duplication because wrong abstractions are
harder to remove than repeated code.

## 3. Make it work, make it right, make it fast — in that order
Never optimise without a measurement. "This might be slow" is not a measurement.

## 4. One source of truth
Every fact — a config value, a type definition, a business rule — lives in exactly one
place. Duplicated truth drifts. This applies to documentation as much as to code.

## 5. Boundaries are the architecture
The valuable design decision is where the seams go, not which framework fills them.
Get module boundaries right and framework choice becomes reversible.

## 6. Failures should be loud and local
Crash near the cause with a message that names the cause. Silent fallbacks and swallowed
exceptions convert a five-minute bug into a five-hour one.

## 7. If it isn't written down, it didn't happen
A decision that lives only in a chat log is not a decision, it is a rumour. Knowledge
that survives only in someone's head is a single point of failure.

## 8. Reversibility over correctness
Prefer the choice that is cheap to undo. Being right is good; being able to be wrong
cheaply is better, and available far more often.

## 9. Delete more than you add
The best commit removes code. Dead code, unused deps, and stale docs all carry a
maintenance tax that compounds silently.

## 10. Knowledge compounds or it decays
Every project must leave the next one easier. If a session produced no reusable learning,
either the work was trivial or we failed to look for it.
