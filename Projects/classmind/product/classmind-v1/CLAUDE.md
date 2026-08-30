# STOP — this codebase spends real money

## LOCKED RULE: Sarvam is transcription only

Sarvam turns **new audio** into a transcript. That is its entire job.

Once a transcript is stored, **no processing step may call Sarvam again for that lecture** unless
the operator explicitly re-transcribes or re-uploads it. Forbidden on Sarvam: extraction,
assignment detection, reconstruction, consolidation, reference resolution, student Q&A, answer
styling, and any experiment over a stored transcript.

`src/lib/reasoning/sarvam.ts` is a **disabled adapter** kept for future evaluation. No silent
fallback to it. No paid Sarvam reasoning by default.

## NOTE: v1 is the frozen reference pipeline

The processing-engine work — provider abstraction, the `processing_runs` ledger, Layer-2
idempotency — is being done in **`../classmind-v2`**. v1 has none of it, which means **v1 has no
reuse guard: every `POST /extract` here bills in full, every time.** Prefer v2 for all processing
work; touch v1 only to keep the capstone's evidence reproducible.

## What costs money here

| Path | Endpoint | Billed |
|---|---|---|
| Transcription (ASR) | Sarvam Batch `saaras` | per hour of audio — **new recordings only** |
| Reasoning | `sarvam-105b` chat completions | per token, per reconstruction window |

`TRANSCRIPTION_PROVIDER=fixture` replaces the ASR call **and nothing else**. A single
`POST /api/lectures/{id}/extract` still bills for every window, fixture mode or not.

**Costs money** (ask Shyam first, every single run):
`test:quarantine` · `test:e2e` · `test:knowledge` · `test:identity` · `test:languages` ·
any curl or browser click reaching `/extract`, `/ask` or `/transcribe`.

**Free** (run freely): `test:extraction` · `test:transcript` — pure functions over stored fixtures.

Full rule and the incident behind it: root `CLAUDE.md` § "Spending the operator's money".

@AGENTS.md
