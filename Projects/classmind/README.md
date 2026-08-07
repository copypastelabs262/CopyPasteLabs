# ClassMind

Extracts assignments, deadlines and exam scope from code-switched Hindi–English lecture
speech, has the lecturer confirm each item, and publishes confirmed items to students with a
click-back to the exact second it was said.

Start with [`.knowledge/project.md`](.knowledge/project.md).

## The three directories

| Directory | Holds | Lifetime |
|---|---|---|
| [`.knowledge/`](.knowledge/) | Everything we have decided, defined or proven | **Permanent.** Accumulates; never rewritten wholesale |
| [`lab/`](lab/) | The Experiment Platform — throwaway code that produces evidence | **Disposable.** Rewritten freely, version by version |
| [`product/`](product/) | The Product Platform — what colleges eventually use | **Not started.** Empty by design until the gate passes |

The split is the 2026-07-30 platform-separation decision made physical — see
[`decisions.md`](.knowledge/decisions.md). Two systems, never one evolving into the other.

## The one rule

**Knowledge has exactly one home, and it is `.knowledge/`.**

Lab code produces findings. Findings do not stay in `lab/`. A finding that changes what we
believe goes into `.knowledge/decisions.md`, `progress.md` or a results document, and the lab
version's README *links* to it rather than restating it. A lab README records what that
version did and why it ended; it is not a second copy of the project's thinking.

Deleting any directory under `lab/` must never destroy knowledge. If it would, the knowledge
was written in the wrong place.

## Where the project actually is

Pre-code, entering implementation. The gating step is the frozen
[`walkthrough-protocol.md`](.knowledge/walkthrough-protocol.md) — a two-person manual
annotation experiment that needs no software at all. Lab v0 exists only because steps 2 and 8
of that protocol require a transcript.
