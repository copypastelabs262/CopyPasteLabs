# STOP — this codebase spends real money

Sarvam is billed on **two** paths, and the second is the one that gets forgotten:

- **Transcription (ASR)** — Sarvam Batch, billed per hour of audio.
- **Reasoning** — `api.sarvam.ai/v1/chat/completions` (`sarvam-105b`), billed per token, once per
  reconstruction window.

`TRANSCRIPTION_PROVIDER=fixture` replaces the ASR call **and nothing else**.
`src/lib/reasoning/index.ts` has no fixture provider, so one `POST /api/lectures/{id}/extract`
still bills tokens for every window — fixture mode or not.

**Costs money** (ask Shyam first, every single run):
`test:quarantine` · `test:e2e` · `test:knowledge` · `test:identity` · `test:languages` ·
any `curl`/browser click reaching `/extract`, `/ask` or `/transcribe`.

**Free** (run freely): `test:extraction` · `test:transcript` · `test:reconstruction` ·
`test:knowledge-plan` — pure functions over stored fixtures.

Ask before running anything on the paid list, and say which endpoint, how many calls you expect,
and why a fixture cannot answer the question. Approval is **per run**, not per session.
Full rule and the incident behind it: root `CLAUDE.md` § "Spending the operator's money".

@AGENTS.md
