# ClassMind V3

The ClassMind product. A faculty member uploads a lecture; it is transcribed, academic
information is extracted as **candidates**, and nothing reaches a student until a human confirms
it. Students then read confirmed knowledge, ask questions, and open the evidence at the exact
timestamp it was spoken.

This is the Product Platform. `../../lab/v0-ingestion` is the research environment and is
separate — nothing here reads its tables.

## Run it

```
npm install
npm run setup:db     # creates the `lectures` storage bucket; idempotent
npm run dev          # http://localhost:3100
```

`.env.local` needs the keys listed in `.env.example`. To replay a captured Sarvam response
instead of paying for a real call, name it per lecture — `replayFixture: "<slug>"` on
`POST /api/courses/:id/lectures`. There is no `TRANSCRIPTION_PROVIDER` any more, and a filename
never selects a transcript. Replay is refused on any deployment. A live call from a developer
machine needs `ALLOW_LIVE_SARVAM=1`, so nothing spends money by accident.

## Verify it

```
npm run test:extraction   # 75 checks, offline
npm run test:provenance   # 16 checks, offline, against the real captured responses
npm run test:e2e          # 67 checks, needs the dev server running
npm run test:languages    # 33 checks, needs the dev server running
```

`test:e2e` drives the whole product over HTTP exactly as a browser does — upload, transcribe,
extract, review, then re-enter as a student and ask a question. Its most important checks are
negative: a student's lecture payload carries zero candidates, a student cannot rule on one, and
the anon key cannot read any product table directly.

Both server-backed suites accept `E2E_BASE_URL` to run against a deployment.

## Deploy it

See [`DEPLOY.md`](DEPLOY.md). The one setting that matters is Vercel's **Root Directory**, which
must be `Projects/classmind/product/classmind-v1`.

## How it is put together

Next.js 16 App Router, React 19, Tailwind v4, Supabase (Postgres + Storage + Auth).

Three deliberate design choices carry most of the weight:

- **RLS is on with zero policies on every table.** The anon key can read nothing; all access goes
  through server routes holding the service-role key. "No unverified information reaches
  students" is therefore structural, not a rule anyone has to remember.
- **Candidates are immutable and verdicts are append-only.** An edit never overwrites the
  machine's proposal, and a rejection is retained. Confirmed knowledge is derived by joining the
  two, so it cannot drift from what was actually confirmed.
- **Transcription and extraction sit behind replaceable interfaces.** Every stored candidate
  names the method and version that produced it, so pattern matching, NER and an LLM can be
  compared on byte-identical input later.

Raw audio and the raw ASR response are never edited or deleted. The readable transcript is
derived from the raw response at read time, so fixing the normalizer needs a reload, not a
re-run.

## Current limitations

No live Sarvam call has ever been made from this app. There is no romanized-Hinglish ASR fixture,
which is the case the extraction lexicon covers most heavily. Question answering retrieves
confirmed items rather than generating prose — it cannot hallucinate, and it will miss a
paraphrase sharing no words with the item. Extraction accuracy is unmeasured; `confidence` orders
the review queue and means nothing else.

Longer version, with the reasoning: `../../../../HANDOFF.md` § 11.
