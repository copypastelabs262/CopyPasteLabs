# Decisions — BuilderOS

Project-scoped choices. Newest at the top.

If a decision here would apply to a future unrelated project, it belongs in
`AI-Memory/07_Decisions/` instead — say "Promote this" to move it.

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
