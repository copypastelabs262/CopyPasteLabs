# CopyPasteLabs

Capstone project, built to become a startup. Three founders: Shyam, Shiv, and Darsh.

This repository holds **both the code and everything we know** — decisions, architecture,
progress, and reusable engineering knowledge. If it isn't in here, it didn't happen.

---

## Read this first if you're Shiv or Darsh

**You don't need to install anything to read this project.** Open it in a browser:

> https://github.com/copypastelabs262/CopyPasteLabs

Everything below is a file you can click on. GitHub always shows the latest version, so
there's nothing to sync and nothing to keep up to date.

### Where to look

| I want to know… | Open this |
|---|---|
| What are we building, and why? | `Projects/<project>/.knowledge/project.md` |
| How is it put together? | `Projects/<project>/.knowledge/architecture.md` |
| What's been done lately? | `Projects/<project>/.knowledge/progress.md` |
| Why did we choose X over Y? | `Projects/<project>/.knowledge/decisions.md` |
| What's next / what's planned? | `Projects/<project>/.knowledge/roadmap.md` |
| What happened in a work session? | `Projects/<project>/.knowledge/sessions/` |
| How do we agree to work together? | `TEAM.md` |
| Reusable lessons across projects | `AI-Memory/INDEX.md` |

**To catch up quickly:** read `progress.md`, then the newest file in `sessions/`. Those two
tell you where things stand and what happened most recently. Skim `decisions.md` if you're
about to question why something was built a certain way — the reasoning is already written
down.

### How to get your ideas back into the project

You can read this repo but you don't write to it — all writing happens on Shyam's machine
(see *How we work* below). That means your architecture ideas need a route back in, and
**WhatsApp is not that route** — a message scrolls away and the thinking is lost, which is
the exact problem this repository exists to prevent.

Use **GitHub Issues** instead:

1. Go to the repo link above and click the **Issues** tab.
2. Click **New issue**.
3. Write your proposal — the problem you see, what you'd do about it, and what it trades off.
4. Submit.

That's it. It's a web form, not a git command, and nothing can break. Your proposal is now
permanent, searchable, and linkable. Shyam implements it and closes the issue with a link to
the commit, so there's a clean line from *idea* to *shipped*.

Use an issue for anything worth remembering: a design proposal, a problem you spotted, a
question, a library suggestion. Use WhatsApp for "are we meeting at 6."

### If you want Claude's help thinking about the project

Browsing is enough for reading, but if you want to *ask questions* about the project — "how
does auth work here?", "what would break if we changed the data model?" — Claude needs a copy
on your own machine. One-time setup:

```bash
git clone https://github.com/copypastelabs262/CopyPasteLabs.git
```

Then before each session, inside that folder:

```bash
git pull
```

`git pull` = "get the latest." Run it every time you sit down, or you'll be reading an old
copy and designing against a version that no longer exists.

You still never push. If Claude offers to commit or push on your machine, say no.

---

## How we work

**One writer, two readers.** All changes to this repository are made from Shyam's machine.
Shiv and Darsh read, think, and design; proposals come back as GitHub Issues; Shyam
implements them here.

This is deliberate. It removes an entire category of problem — merge conflicts, two people
editing the same file, work silently overwritten — at the cost of making Shyam a bottleneck.
That trade is right for a three-person capstone. It will stop being right as the team or the
codebase grows; the reasoning and the exit conditions are in
`Projects/builderos/.knowledge/decisions.md`.

**Saving is automatic.** On Shyam's machine, every file edit is committed and pushed by a
hook in `scripts/autosave.sh`. So the version on GitHub is current within seconds, and Shiv
and Darsh never read stale work. Commits prefixed `Auto-save:` are unreviewed snapshots;
commits with real messages are intentional checkpoints.

---

## The knowledge base

This repo runs on **BuilderOS** — a rule that every session must leave behind better
knowledge, not just better code. Two tiers:

- **`AI-Memory/`** — lessons that will help *any* future project. Global and permanent.
- **`Projects/<name>/.knowledge/`** — everything specific to one project.

The sorting question is always: *would this help a future, unrelated project?* Yes → global.
No → project-local. The full charter is in `CLAUDE.md`; it's written for Claude but it's
readable by humans and worth skimming once.

---

## Layout

```
CopyPasteLabs/
├── README.md          ← you are here
├── CLAUDE.md          ← BuilderOS charter (how sessions must operate)
├── TEAM.md            ← how the three of us agree to work
├── scripts/           ← auto-save and session-start hooks
├── AI-Memory/         ← global, cross-project knowledge
└── Projects/
    ├── _TEMPLATE/     ← copy this to start a new project
    └── builderos/     ← the knowledge system itself, tracked as a project
```

---

## Known limitation: we share one account

All three of us use the same GitHub and Claude account, so every commit is authored by
`copypastelabs262` and there's no record of who did what.

For a capstone that's fine. For a startup it isn't — contribution history matters for equity
conversations, for IP questions, and for anything involving investors or an accelerator.
Separate accounts, added as collaborators, would fix it and cost nothing. Worth doing before
this gets serious rather than trying to reconstruct it afterwards.
