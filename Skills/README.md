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

| Skill | Status | Invoke | Purpose |
|---|---|---|---|
| `End-Session/` | Implemented — spec 1.0.0, prompt 1.0.0 | `/end-session` | Capture the state and evidence of a work session into `AI-Memory/Inbox/`. |
| `Knowledge-Promoter/` | Not specified | — | Review Inbox entries and decide what earns a place in permanent `AI-Memory/`. |

### How `/end-session` is wired

Claude Desktop exposes slash commands as **skills**, registered per-account rather than
per-repository. There is no `.claude/commands/` mechanism here, and the on-disk skill cache is
read-only — a skill can only be registered through the app, never by committing a file.

So `/end-session` is a **thin loader** held in the account. It does three things: confirms the
open folder is CopyPasteLabs, reads `Skills/End-Session/prompt.md`, and executes it verbatim.

The implementation is **not** duplicated into the loader. `prompt.md` in this repository stays
the single source of truth — edit it and the next `/end-session` picks the change up
immediately, with nothing to re-register. Paths resolve through `$CLAUDE_PROJECT_DIR`, matching
the convention in `scripts/autosave.sh` and `scripts/session-start.sh`.

One consequence worth knowing: because registration is account-scoped, `/end-session` is
visible in every Cowork session, including ones with a different folder open. The loader's
first step exists for exactly that case — it refuses to run and says why, rather than writing
into the wrong repository.

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
