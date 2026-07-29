# Skills

Reusable **infrastructure capabilities** for the CopyPasteLabs operating system.

A skill in this directory is not a project feature. It is an organizational capability
intended to be used across every project, for years, by whoever is working — human or model.
Project-specific automation does not belong here; it belongs in that project.

---

## Layout

Every skill follows the same shape:

```
Skills/<Skill-Name>/
├── specification.md   ← what the skill must do, and why. The contract.
├── prompt.md          ← the implementation. Derived from the spec, never the reverse.
├── changelog.md       ← version history, with the reason for each change.
└── examples/          ← worked artifacts showing correct output (optional but preferred)
```

**The specification is the source of truth.** `prompt.md` is an implementation of it. When
they disagree, the specification is right and the prompt is a bug. Change the spec first,
bump its version, then update the prompt to match.

---

## Registry

| Skill | Status | Purpose |
|---|---|---|
| `End-Session/` | Specified — not implemented | Capture the state and evidence of a work session into `AI-Memory/Inbox/`. |
| `Knowledge-Promoter/` | Not specified | Review Inbox entries and decide what earns a place in permanent `AI-Memory/`. |

---

## The capture/curation split

These two skills exist as a pair, and the split between them is deliberate.

```
  work session
       │
       ▼
  ┌─────────────┐   writes    ┌──────────────────┐   reads    ┌────────────────────┐
  │ End-Session │ ──────────► │ AI-Memory/Inbox/ │ ─────────► │ Knowledge-Promoter │
  │  (capture)  │             │    (staging)     │            │    (curation)      │
  └─────────────┘             └──────────────────┘            └─────────┬──────────┘
                                                                        │ writes
                                                                        ▼
                                                            ┌────────────────────────┐
                                                            │ AI-Memory/01_..10_     │
                                                            │  (permanent knowledge) │
                                                            └────────────────────────┘
```

**Capture must be cheap, fast, and safe to run every single time.** If closing a session
requires judgment calls, it will get skipped on the day it matters most. So End-Session
records what happened and proposes nothing as final.

**Curation must be deliberate and reversible.** Deciding that something is a Principle, or
that a Learning has been Validated, is a judgment that shapes the knowledge base for years.
It deserves a separate, slower pass with a human in the loop.

Collapsing these into one step would force every session to end with an argument about what
matters. Separating them means the record is always written, and the arguments happen later,
against evidence, when there's more information.

---

## Adding a new skill

1. Write `specification.md` first. If the responsibilities cannot be stated clearly, the
   capability is not understood well enough to build.
2. Get it reviewed. A spec is cheap to change; a skill in use across a dozen projects is not.
3. Only then write `prompt.md`.
4. Add a row to the registry above.
