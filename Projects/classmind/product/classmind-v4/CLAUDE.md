# STOP — this codebase spends real money

## LOCKED RULE: Sarvam is transcription only

Sarvam turns **new audio** into a transcript. That is its entire job.

Once a transcript is stored, **no processing step may call Sarvam again for that lecture** unless
the operator explicitly re-transcribes or re-uploads it. Forbidden on Sarvam: extraction,
assignment detection, reconstruction, consolidation, reference resolution, student Q&A, answer
styling, and any experiment over a stored transcript.

Those go through the reasoning-provider abstraction. `src/lib/reasoning/sarvam.ts` remains as a
**disabled adapter** for future evaluation. No silent fallback to it. No paid Sarvam reasoning by
default. A missing reasoning provider is an error, not a reason to reach for Sarvam.

## What still costs money

| Path | Endpoint | Billed |
|---|---|---|
| Transcription (ASR) | Sarvam Batch `saaras` | per hour of audio — **new recordings only** |
| Reasoning | whatever `REASONING_PROVIDER` names | per token, per reconstruction window |

`TRANSCRIPTION_PROVIDER=fixture` replaces the ASR call **and nothing else**. A single
`POST /api/lectures/{id}/extract` still bills the reasoning provider for every window.

**Costs money** (ask Shyam first, every single run):
`test:quarantine` · `test:e2e` · `test:knowledge` · `test:identity` · `test:languages` ·
`test:replay-gate` · any curl or browser click reaching `/extract`, `/ask` or `/transcribe`.

**Free** (run freely): `test:extraction` · `test:transcript` · `test:reconstruction` ·
`test:knowledge-plan` · `test:ask` — pure functions over stored fixtures.

Ask is METERED (2026-09-03): every question logs one `[ask-meter]` line and inserts one
`ask_runs` row (migration `20260903100000`), $0 routes included. Simple lookups are routed
model-free by `src/lib/knowledge/ask-routing.ts`; a question that reaches `/ask` may still
bill the reasoning provider, so the ask-first rule above is unchanged.

## The processing ledger

`processing_runs` (migration `20260830160000`) is both the idempotency guard and the cost meter.
A re-run over an unchanged transcript with an unchanged reasoner is **reused, not re-paid**.
`?force=1` overrides it and is recorded as a deliberate experiment.

Until that migration is applied, reuse is OFF — the extract response says so in
`processing.ledger: "unavailable"`. Do not read a missing ledger as "no prior run".

Full rule and the incident behind it: root `CLAUDE.md` § "Spending the operator's money".

@AGENTS.md
