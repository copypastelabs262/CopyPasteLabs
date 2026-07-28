# Requirements — BuilderOS

- **Updated:** 2026-07-28

## Functional
| ID | Requirement | Priority | Status |
|---|---|---|---|
| F1 | Global knowledge base with 10 fixed categories + index | Must | Done |
| F2 | Per-project `.knowledge` scaffold, copyable in one command | Must | Done |
| F3 | Charter that applies automatically at the repo root | Must | Done |
| F4 | Manual command vocabulary (Learn / Promote / Audit / etc.) | Must | Done |
| F5 | Canonical entry format per knowledge category | Must | Done |
| F6 | Quality ladder on every entry | Should | Done |
| F7 | Format validation / lint | Could | Not started |

## Non-functional
- **Portability:** the base must remain fully usable with nothing but a text editor and
  `grep`. No format may require a specific tool to read.
- **Write friction:** capturing a learning should take under a minute. Capture dies at the
  first point of friction, so format richness is capped by this.
- **Scale:** usable without search tooling up to ~150 files.

## Constraints
- Plain Markdown, stored in the repository. No external service.
- No build step, no runtime, no dependencies.

## Assumptions
- Sessions will actually run their end-of-session update. *Unverified — this is the single
  largest risk to the system.*
- Knowledge worth keeping is a small fraction of what gets discussed. If it turns out not to
  be, the base will grow faster than it sharpens.

## Explicitly out of scope
- The content of the knowledge base itself.
- Multi-user concurrency and merge-conflict handling.
- Any web UI or search service.
