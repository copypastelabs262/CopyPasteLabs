---
project: classmind
session_id: 2026-09-01T2200Z-v4-overnight-shell-build
schema_version: 1
generated_by: End-Session/1.0.0 (hand-authored)
generated_at: 2026-09-01T22:00:00Z
---

# 2026-09-02 (overnight) — the v4 class shell, one autonomous run

> Chapter capture. The operator-facing narrative is
> `product/classmind-v4/V4-OVERNIGHT-REPORT.md`; the design contract is
> `product/classmind-v4/V4-ARCHITECTURE.md`; the progress entry summarizes both.

## Starting state

Operator commissioned an autonomous overnight build: v4 as v3's successor implementing
the classroom grammar (`.knowledge/design/teams-grammar/grammar.md`), Observatory skin
kept, Apple-HIG craft bar, mechanically zero-spend, judged from rendered screenshots.

## What was done

v3 byte-copied to v4 (port 3500, keys stripped); architecture doc committed before code;
the class shell (rail + context header + Home | Ask | Lectures | Assignments) built on
unchanged routes with one shared course fetch; Home as a real-data stream with needs-you
band; Ask as a chat-first surface with viewport-fixed composer and visible degraded mode;
Assignments as the confirm-as-posting workspace on the existing review contract; Lectures
re-homing the slimmed v3 surfaces. Three capture/critique/fix passes (48 shots) plus an
interactive degraded-mode Ask smoke; tsc/eslint/build clean; three review-found defects
fixed in-run. Checkpoint commits 1–3 pushed.

## Decisions made (candidates below)

Routes not moved — new destinations nested under the existing namespace to preserve the
citation contract; degraded mode made visible; no due-date UI without due-date data.

## Problems hit

Lecture-detail captures linger on the loading skeleton (data APIs 200 — suspected capture
artifact on the media-carrying page; flagged, not chased). The QA course's thin data means
rich-data rendering is first exercised by the operator's morning click-through.

## Unresolved questions

Whether v4 formally becomes the active line — operator's morning call (report §H).

## Ending state

v4 coherent, verified, pushed; v3 untouched; dev server left running keyless on 3500;
zero provider-capable attempts across every manifest.

## Next session should start with

The operator's review per report §H.
