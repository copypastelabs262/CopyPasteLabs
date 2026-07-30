# AI-Memory — Index

The global knowledge base for CopyPasteLabs. Everything here is **reusable across projects**.
Project-specific detail belongs in `Projects/<name>/.knowledge/`, not here.

**Bootstrapped:** 2026-07-28
**Status:** Active

---

## Map

| Dir | Holds | Entry format |
|---|---|---|
| `01_Principles/` | Non-negotiable engineering rules | Prose |
| `02_Learnings/` | Reusable concepts, one file per learning | Learning Format |
| `03_Patterns/` | Architectures & workflows worth repeating | Pattern Format |
| `04_Prompts/` | Prompts that reliably work | Prompt Format |
| `05_Snippets/` | Copy-paste code, grouped by language | Snippet Format |
| `06_Mistakes/` | Failures we never repeat | Mistake Format |
| `07_Decisions/` | Intentional choices + rationale | Decision Format |
| `08_Templates/` | Scaffolds for new projects & docs | N/A |
| `09_Tools/` | Tooling evaluations & setup notes | Prose |
| `10_Glossary/` | Shared vocabulary | Term: definition |

All entry formats are defined in `08_Templates/FORMATS.md`.

---

## Inbox — deliberately not indexed

`AI-Memory/Inbox/` also exists, and is **intentionally excluded from this index.**

The Inbox is **staging, not knowledge.** It holds session captures — evidence of what
happened, plus *candidates*: proposed learnings, patterns, decisions and open questions that
have been recorded but not yet reviewed. Nothing in it is permanent, curated, or safe to cite.
Its contents are transient by design.

Indexing it would defeat the purpose of the split. This index is a map of what CopyPasteLabs
*knows*; the Inbox is a queue of what a session *claimed*. Listing both here would blur that
line, which is the one distinction the whole pipeline exists to preserve.

**`Knowledge-Promoter` is responsible for promoting Inbox entries into permanent AI-Memory** —
and for updating this index when it does. Sessions capture into the Inbox and never write to
the numbered folders above or to this file. That restriction is what makes everything listed
in this index trustworthy: it has all been reviewed.

The failure mode to watch for is a growing backlog of unpromoted entries. An Inbox that is
never drained is a landfill, and knowledge sitting in it is knowledge nobody can find.

See `CLAUDE.md` § "The knowledge pipeline" and `Skills/End-Session/specification.md`.

---

## Quality ladder

Every knowledge item carries a status in its frontmatter:

`Draft` → `Validated` → `Best Practice` → `Deprecated`

- **Draft** — observed once, not yet re-tested.
- **Validated** — worked on a second, independent project.
- **Best Practice** — the default choice; deviating requires a Decision entry.
- **Deprecated** — kept for history. Never delete; mark and explain the replacement.

---

## Catalogue

### 01_Principles
- `PRINCIPLES.md` — core engineering rules · Best Practice

### 02_Learnings
_(empty — first learning goes here)_

### 03_Patterns
- `knowledge-compounding-loop.md` — how BuilderOS turns sessions into assets · Draft

### 04_Prompts
_(empty)_

### 05_Snippets
_(empty)_

### 06_Mistakes
_(empty)_

### 07_Decisions
- `2026-07-28-adopt-builderos.md` — adopt file-based knowledge system · Validated

### 08_Templates
- `FORMATS.md` — canonical entry formats · Best Practice
- Project `.knowledge` scaffold lives at `../../Projects/_TEMPLATE/.knowledge/`

### 09_Tools
- `TOOLS.md` — tooling register

### 10_Glossary
- `GLOSSARY.md` — shared vocabulary

---

## Maintenance

- **Never duplicate.** Search before creating. Update the existing file instead.
- **Never grow for the sake of growing.** A merge that shortens the base is a win.
- Run `Memory audit` periodically — it reports duplicates, conflicts, and stale entries before changing anything.
- This INDEX is the map of **permanent** knowledge. If a file exists in `01_`–`10_` and is not
  listed here, the index is broken. `Inbox/` is the one deliberate exception — see above.
