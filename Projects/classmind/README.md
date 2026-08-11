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

Building the Experiment Platform. Lab v0 is at Milestone 2 of 3; the Product Platform has not
started.

The **gating step is still the frozen
[`walkthrough-protocol.md`](.knowledge/walkthrough-protocol.md)** — a two-person manual annotation
experiment that needs no software at all. Its step 2 calls for transcription "with whatever ASR is
nearest to hand," twenty minutes, engine and version recorded. **The walkthrough is not waiting on
Lab v0 and never was.**

Lab v0 is a separate, deliberate choice: infrastructure for making transcription repeatable,
measurable and reproducible against real classroom recordings, so that transcript quality becomes
a number we can defend rather than an assumption. See the 2026-08-11 entry in
[`decisions.md`](.knowledge/decisions.md).

**Building it validates nothing about the domain model.** Only the walkthrough does that, and the
gate it guards is unchanged: nothing that names Commitment, Notice or Guidance gets built until
its results document exists.
