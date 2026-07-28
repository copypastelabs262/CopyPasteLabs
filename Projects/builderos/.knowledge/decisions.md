# Decisions — BuilderOS

Project-scoped choices. Newest at the top.

If a decision here would apply to a future unrelated project, it belongs in
`AI-Memory/07_Decisions/` instead — say "Promote this" to move it.

---

## 2026-07-28 — BuilderOS reaches v0.1 baseline; freeze features, prioritize the capstone

**Decision:** BuilderOS (charter, `AI-Memory/` structure, hooks, `.knowledge` scaffold) is
declared a stable v0.1 baseline and reclassified from primary project to supporting
infrastructure. No further BuilderOS features are added speculatively. It is only touched
when real capstone development reveals a genuine gap, and even then, only if the gap blocks
progress — otherwise the improvement is logged to this project's `roadmap.md` and deferred.
Capturing decisions, learnings, patterns, prompts, and mistakes continues unchanged; only
*building BuilderOS itself* is paused.

**Reason:** The 2026-07-28 (later) progress entry already named the risk directly: "the
collaboration machinery is currently ahead of the thing it exists to support." Every session
so far has built process (single-writer model, hooks, `.gitignore` hardening, `TEAM.md`) and
none has produced product. A capstone is graded on the product shipped, not on the
sophistication of the tooling used to build it — continued investment here has negative
marginal value until real work exposes what's actually missing.

**Alternatives Considered:**
- *Keep iterating on BuilderOS until it feels "done"* — there is no such point; tooling can
  always be improved, so this is an open-ended time sink with no natural stopping condition.
  Rejected.
- *Freeze BuilderOS entirely, including gap-driven fixes* — too rigid. A hook that's
  genuinely broken (e.g., silently failing pushes) blocks the read-only co-founders from
  seeing current state, which is a real cost, not a hypothetical one. Rejected in favor of
  allowing blocking-gap fixes.

**Trade-offs:**
- Known rough edges (the not-yet-verified auto-push hook, `<Project Name>` placeholders in
  `.knowledge` templates) stay as-is unless they block product work — they are accepted debt,
  not forgotten debt, and are tracked in `roadmap.md`.
- Discipline is required to tell "genuine gap" apart from "interesting idea." Default to the
  roadmap, not the editor, when in doubt.

---

## 2026-07-28 — Single-writer repository model

**Decision:** Only Shyam's machine writes to the repository. Shiv and Darsh have read access
and submit proposals as GitHub Issues, which are implemented from the writing machine.

**Reason:** Three founders sharing one Claude account cannot see each other's chat sessions,
so the repository is the only shared state. With three writers that shared state needs
merge-conflict handling, branch discipline, and pull-before-push habits from a team with
basic git skill — a lot of process for a three-person capstone. With one writer, every one of
those problems disappears rather than being managed.

**Alternatives Considered:**
- *Three writers on `main` with pull-before-push* — standard, but the failure mode is silent:
  a rejected push looks like nothing happened, and divergence is discovered hours later.
  Rejected on skill fit, not on principle.
- *Branches and pull requests* — correct at scale and the right eventual answer, but it front-
  loads git complexity onto a team that would spend more time on process than on the product.
  Deferred, not rejected.
- *Sync chat history between the three of us* — not possible, and the wrong target anyway.
  Chat is a transcript, not state. Session logs in `.knowledge/sessions/` are the durable
  substitute and already part of the design.

**Trade-offs:**
- Shyam is a bottleneck. Nothing ships while he is unavailable, and two founders' throughput
  is capped by one person's implementation speed. This is the real cost and it is not small.
- Shiv and Darsh lose the feedback loop of building their own ideas, which is slower for
  learning and weaker for a capstone where all three are meant to be engineers.
- The model is a convention, not an enforced rule — see the shared-account entry below.
- Revisit conditions are recorded in `TEAM.md` §0 so the model gets replaced deliberately
  rather than drifted out of.

---

## 2026-07-28 — Keep automatic commit-and-push, but make it fail loudly

**Decision:** Retain the per-edit auto-commit-and-push hook, rewritten as
`scripts/autosave.sh`. Add a secret guard, portable paths, branch detection, file-based
commit messages, and loud failures. Removal was considered first and rejected.

**Reason:** The recommendation reversed when the single-writer model was established. Under
three writers, auto-push races and its failures are silent — genuinely dangerous. Under one
writer there is nobody to race, and the remaining risks are each independently fixable. The
risk it *protects* against became the important one: if the only writer forgets to push, both
readers silently work from a stale repository, which is the original problem restored.

**Alternatives Considered:**
- *Remove it; commit manually* — cleaner history and full control, but reintroduces the exact
  failure the model is built to avoid, and depends on remembering to push every time.
- *Auto-commit locally, push only at session end* — tidier history, but leaves a window where
  readers are behind. The window is precisely when a co-founder might start designing.

**Trade-offs:**
- History fills with `Auto-save:` commits that explain nothing. Mitigated by requiring one
  intentional, well-messaged commit before a session ends, but the noise is real.
- `git add -A` stages everything. `.gitignore` and the secret guard are the only defences,
  and both are pattern-matching, which means they can be fooled by an unusual filename.
- A blocked commit stops the safety net entirely until the offending file is dealt with —
  fail-closed by design, but it will be confusing the first time it happens.

---

## 2026-07-28 — Track BuilderOS as a project

**Decision:** Give the knowledge system its own `Projects/builderos/.knowledge/` directory.

**Reason:** Meta-work on the system produces architecture, roadmap items, decisions, and
session logs like any other project, and the charter defined no home for them. Without this,
work on BuilderOS itself would be the one kind of work the system cannot record — which
would be a conspicuous hole in a system whose whole premise is that nothing gets lost.

**Alternatives Considered:**
- *Add `AI-Memory/sessions/`* — mixes project-shaped state into the global base, blurring
  the one boundary the architecture depends on. Rejected.
- *Don't log meta-work at all* — the bootstrap rationale would live only in chat, which is
  precisely the failure mode being designed against. Rejected.

**Trade-offs:** A reader may briefly expect `Projects/builderos/` to contain code. The
`project.md` scope section handles that, but it is mild conceptual overhead.

---

## 2026-07-28 — Duplicate the routing rule into the skill

**Decision:** The `builderos` skill restates the routing rule and formats rather than only
referencing `CLAUDE.md`.

**Reason:** The skill must work when the session root is elsewhere and the charter has not
auto-loaded. A pointer to an unreadable file is not a fallback.

**Alternatives Considered:**
- *Skill references CLAUDE.md only* — smaller and non-duplicative, but fails in exactly the
  case the skill exists to cover. Rejected.

**Trade-offs:** This violates the "one source of truth" principle deliberately. The two
copies can drift, and a change to the routing rule now requires editing two files. Accepted
because the rule is short and stable; if it starts changing often, collapse it back to one
source and accept the coupling to the root.
