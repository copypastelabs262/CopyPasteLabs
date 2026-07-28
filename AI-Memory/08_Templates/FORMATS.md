---
status: Best Practice
created: 2026-07-28
updated: 2026-07-28
---

# Canonical Entry Formats

Every file in AI-Memory starts with YAML frontmatter:

```yaml
---
status: Draft | Validated | Best Practice | Deprecated
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

---

## Learning — `02_Learnings/<slug>.md`

```markdown
# <Title>

- **Date:**
- **Source:**            (where it came from — docs, a bug, a conversation)
- **Confidence:** Low | Medium | High

## Explanation
What the concept is and why it matters. Written so it makes sense with zero project context.

## Example
Concrete. Code or a scenario, not a restatement of the explanation.

## Projects Used
## Related Technologies
## Related Learnings
## Future Notes
Open questions, things to re-test, conditions under which this stops being true.
```

---

## Mistake — `06_Mistakes/<slug>.md`

```markdown
# <Title>

## Problem
What went wrong, observably.

## Cause
The actual root cause, not the first symptom.

## Solution
What fixed it.

## Prevention
The rule, check, or test that makes recurrence impossible. This is the point of the entry —
if you cannot write a prevention, keep digging on the cause.

## Related Project
```

---

## Decision — `07_Decisions/YYYY-MM-DD-<slug>.md`

```markdown
# <Title>

## Decision
One sentence. What we are doing.

## Reason
## Alternatives Considered
Each with why it lost. "We didn't think of it" is not an alternative.

## Trade-offs
What this costs us. Every real decision costs something; if none is listed, the analysis
is incomplete.

## Date
```

---

## Prompt — `04_Prompts/<slug>.md`

```markdown
# <Title>

## Purpose
## Prompt
Verbatim, in a code block, ready to copy.

## Works For
## Limitations
## Rating
1–5, based on observed results.

## Examples
```

---

## Pattern — `03_Patterns/<slug>.md`

```markdown
# <Title>

## Problem
The recurring situation this addresses.

## Solution
## Architecture
Components and how they connect. A diagram in text is fine.

## Benefits
## Limitations
When *not* to use this. A pattern with no stated limits has not been used enough.

## Reusable
Yes / With adaptation / Context-specific — and what must change to reuse it.
```

---

## Snippet — `05_Snippets/<lang>/<slug>.md`

```markdown
# <Title>

- **Language:**
- **Purpose:**

## Code
## Usage
## Dependencies
## Caveats
```
