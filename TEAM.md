# CopyPasteLabs — Team Agreement

This document is the collaboration agreement for CopyPasteLabs. It exists so that speed
never comes at the cost of trust in the codebase — everyone works the same way, so nobody
has to guess what state the repo or the knowledge base is in.

This is a living document. If a rule stops making sense, change it here — don't just ignore it.

---

## 0. Who Writes — read this before anything else

**One writer, two readers.**

- **Shyam's machine is the only one that writes to this repository.** All commits and pushes
  originate there.
- **Shiv and Darsh read only.** They pull or browse the repo for context, think about
  architecture and design, and send proposals back as **GitHub Issues**. They never commit
  and never push.
- Proposals get implemented from Shyam's machine, and the issue is closed with a reference to
  the change.

**Why:** with a single writer there are no merge conflicts, no simultaneous edits to the same
file, and no way for one person's work to silently overwrite another's. Those are the
expensive failures, and this removes all of them at once.

**What it costs:** Shyam is a bottleneck. Nothing ships while he's unavailable, and two
founders' throughput is capped by one person's typing. That's an acceptable trade for a
three-person capstone and a bad one for a growing team.

**Revisit this when** any of these becomes true — they are the signals that the trade has
flipped:

- Someone is regularly blocked waiting on Shyam to implement their idea.
- Two projects are being worked on at once.
- A fourth person joins.
- The repo has enough real code that reviewing a change matters more than avoiding conflicts.

At that point, move to branches and pull requests. Don't drift into multi-writer by accident
— make it a decision and record it in `Projects/builderos/.knowledge/decisions.md`.

**Ideas belong in Issues, not chat.** A design discussed on WhatsApp and never written down
is lost, which is precisely what this repository exists to prevent. If it's worth building,
it's worth an issue.

---

## 1. Daily Workflow

- **Pull before you start.** Always `git pull` at the start of a session, before making any
  changes. Never assume your local copy is current.
- **Keep commits focused.** One commit should represent one logical change. Avoid bundling
  unrelated fixes, refactors, and features into a single commit.
- **Push only working code.** Never push code that doesn't build, fails its tests, or leaves
  the app in a broken state. If you must pause mid-change, commit locally but don't push until
  it's stable — or push to a branch, not `main`.
- **Update documentation when architecture changes.** If a change affects how a project is
  structured, how it should be run, or a decision future work depends on, update the relevant
  `.knowledge/architecture.md` or `decisions.md` in the same session as the code change — not
  "later."

---

## 2. Git Rules

- **Never commit secrets.** No API keys, tokens, passwords, `.env` files, or credentials —
  ever, even temporarily, even in a "private" repo. If one slips in, rotate it immediately and
  scrub it from history; assume anything pushed is permanently exposed.
- **Never force-push to `main`.** Force-pushing rewrites history that others may already have
  pulled. If history needs to be rewritten, do it on a branch and coordinate before touching
  `main`.
- **Use descriptive commit messages.** A commit message should explain *why* the change was
  made, not just restate the diff. `"fix login bug"` is not acceptable; `"fix session token
  not refreshing after 24h expiry"` is.
- **Resolve merge conflicts before pushing.** Never push a commit that leaves conflict markers
  in the codebase. If a conflict is non-trivial, talk to whoever owns the conflicting change
  before resolving it unilaterally.

---

## 3. Claude Code Rules

- **Update project knowledge after major milestones.** When a feature ships, an architecture
  shifts, or a phase of a project completes, make sure `.knowledge/progress.md` and
  `.knowledge/roadmap.md` reflect the new state before moving on.
- **Record important architectural decisions.** Any decision with real trade-offs — a library
  choice, a data model, a build-vs-buy call — gets a `decisions.md` entry with the reasoning,
  not just the outcome. Future sessions (human or AI) should never have to reverse-engineer
  *why* something was done.
- **Save reusable learnings to BuilderOS when appropriate.** If something learned on one
  project would help an unrelated future project, promote it to `AI-Memory/` rather than
  letting it live only in that project's `.knowledge/`. If unsure whether it generalizes,
  leave it local until a second project proves it does.
- **Keep project-specific knowledge inside `.knowledge`.** Anything scoped to a single
  project — its requirements, its local decisions, its session history — stays in that
  project's `.knowledge/` directory. Don't let project detail leak into `AI-Memory/`, and
  don't let global principles get duplicated back down into a project.

---

## 4. Team Responsibilities

CopyPasteLabs is run by three founders. Regardless of who owns which domain day-to-day,
everyone is expected to:

- **Know the state of the repo.** Read recent commits and `.knowledge/progress.md` before
  starting work on something someone else touched.
- **Communicate before diverging.** If you're about to make a decision that changes shared
  architecture, direction, or scope, say so before you build it — not after.
- **Document as you go.** Documentation is not cleanup work done later; it's part of finishing
  a task. A feature isn't "done" until the knowledge base reflects it.
- **Protect the knowledge base.** Treat `AI-Memory/` and every project's `.knowledge/` as
  shared infrastructure — as important as the code itself. Don't let it go stale, and don't
  let it duplicate.

| Founder | Primary domain | Repo access | Notes |
|---|---|---|---|
| Shyam | _TBD_ | **Write** — the only writer | Implements from this machine; closes issues |
| Shiv | _TBD_ | Read | Proposes via GitHub Issues |
| Darsh | _TBD_ | Read | Proposes via GitHub Issues |

_Fill in primary domains as roles solidify._

---

## 5. Known Gap: Shared Account

All three of us use the same GitHub and Claude account. Two consequences worth naming:

- **No attribution.** Every commit is authored by `copypastelabs262`. The repository cannot
  show who contributed what. Fine for a capstone; a real problem for a startup, where
  contribution history feeds equity conversations, IP questions, and anything involving
  investors or an accelerator. Reconstructing it later is far harder than recording it now.
- **No enforcement of the single-writer rule.** With separate accounts, GitHub itself would
  block an accidental push from Shiv or Darsh by giving them Read permission. Sharing one
  account means single-writer is a convention we keep by agreement, not a rule the system
  enforces. Conventions are only as strong as the memory of the last person to break one.

**Fix when convenient:** each founder creates their own GitHub account; Shyam adds Shiv and
Darsh as collaborators with **Read** access. Costs nothing, takes ten minutes, and both
problems disappear. Anthropic's Team plan is the equivalent path for Claude accounts, which
would also stop three people sharing one usage limit.

---

*This agreement applies equally to human contributors and to Claude Code sessions working in
this repository — the goal is one consistent standard, not two.*
