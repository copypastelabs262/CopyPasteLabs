---
status: Draft
created: 2026-08-30
updated: 2026-08-30
---

# 2026-08-22 (evening) — Deployed, made legal, made the first live call, and taught the extractor what teaching looks like

**Present:** Shyam (writing machine), Claude (engineering partner)

> **This log was written on 2026-08-30, eight days after the session it describes.** The
> 2026-08-22 evening session ended without one, and so did the two sessions after it. It is
> reconstructed from four commits — `7318689`, `e9b71e5`, `63d3fb4`, `4cacb72` — their messages,
> and the code they introduced. Those messages are unusually detailed and carry numbers, so the
> reconstruction of *what happened* is good. It is still second-hand: anything discussed and not
> committed that evening is lost, and this log cannot know what it does not contain. Everything
> in "Decisions made" is **inferred from code**, because no `../decisions.md` entry was written
> that evening.

## Starting state

The 14:56 entry in [`../progress.md`](../progress.md) had just been written. ClassMind V1 existed
and its end-to-end workflow had been driven for the first time — four suites green (extraction 75,
provenance 16, end-to-end 67, languages 33) — and running it had exposed two real defects, both
fixed the same afternoon.

Three things were true, and they are what the evening acted on:

- The product ran **only on localhost**. It had never been deployed anywhere.
- **No live Sarvam call had ever been made from the product.** Everything verified that day ran
  through a fixture provider replaying three responses captured in Lab v0 RUN 1. `progress.md`
  named this as the blocker and named the next step: *"One real lecture, recorded by an actual
  lecturer, through a live Sarvam call. Not more features."*
- There was **no consent or data-protection position** at all, carried as a blocker since
  2026-07-29.

## Work done

### 1. Deployed to Vercel — and found the existing deployment was already broken (`7318689`, 16:58)

The Git integration that already existed had produced a Production deployment **marked Ready that
served 404 on every path**. Root Directory was unset, so Vercel found no `package.json` at the
repository root, detected no framework, built nothing in two seconds and deployed an empty site.
Root Directory and the framework preset were fixed through the API, so Git pushes deploy and not
just manual runs.

A second thing was written down because it will be hit again: `vercel --prod` from inside the app
directory fails on this project, and correctly so. The CLI uploads the current directory as the
deployment root and Vercel then applies Root Directory *inside* that upload, so it looks for the
path nested under itself. Deploy by pushing to `master`, or run the CLI from the repository root.

**Region was measured, not assumed.** The Supabase project resolves to AWS `ap-south-1` (Mumbai);
Vercel had functions in `iad1` (Washington DC). Five calls to `/api/courses`, a two-query
endpoint:

| Region | Median | Range |
|---|---|---|
| `iad1` | 1545 ms | 1140–2328 |
| `bom1` | 389 ms | 151–1299 (high end is a cold start) |

Four times faster. Moved to `bom1`. The transcribe route moves a whole audio object between
Supabase and the provider, so this was not a micro-optimisation.

Three things that had only ever been reasoned about were confirmed in the real environment:
provenance written by a production function carries a real 40-character SHA from
`VERCEL_GIT_COMMIT_SHA` rather than the degraded "commitHash could not be resolved" branch; the
fixture provider ran inside a real serverless function, which is the only proof that
`outputFileTracingIncludes` actually put the JSON in the bundle; and the 28 MB upload path
completed inside the 60 s function ceiling.

Environment variables are **Production-only**, so preview deployments have no Supabase config and
will fail at request time until the targets are widened. That was written into `DEPLOY.md` rather
than silently widened. Supabase's own variables were confirmed with `vercel env pull`, because
Vercel marks them sensitive and they can never be read back through the API.

Verified against the deployed app rather than localhost: 67 end-to-end checks and 33 language
checks, both green.

### 2. Privacy Policy and Terms of Service (`e9b71e5`, 17:46)

Google's OAuth consent screen requires both as public links on the app's own domain, and reviews
them. Both are at `/privacy` and `/terms` and linked from a footer on every page, because an
anonymous visitor must be able to reach them — which is exactly what the review checks.

Written from what the code actually does rather than from a template. Three disclosures a
template would have missed:

- **Retention.** This system is designed *not* to delete. Raw audio and the raw ASR response are
  preserved permanently and rejected extractions are retained, both deliberately — the evidence
  trail is the product and it breaks if the source is thrown away. There is no automatic expiry
  of anything.
- **Children.** Classroom recordings carry the voices of students who may be under 18. The DPDP
  Act 2023 requires verifiable parental consent for children's data; the app implements no age
  verification and no consent mechanism. Stated as a "do not use with minors yet".
- **Consent.** Faculty upload recordings of other people. The app cannot obtain or verify that
  consent, so the terms put the obligation on the uploader explicitly rather than leaving it
  unowned.

The terms also say the thing students most need to hear: a confirmed item is one faculty member's
judgment about one sentence, not an official notice, and the institution's own channels win where
they disagree.

Neither document has been reviewed by a lawyer, and both say so at the top. They close the
"no consent/data-protection position" blocker **only in the sense of being honest about it**.
They do not make the app fit for real student data.

### 3. Lecture identity verified on production, and the first live Sarvam call (`63d3fb4`, 18:36)

The fix itself landed under `729b180` ("Auto-save: verify-lecture-identity.mts, route.ts,
build.ts +1 more"); `63d3fb4` is the follow-up commit that carries the reasoning and the results.

`scripts/verify-lecture-identity.mts`, two 40-second clips cut from two different lectures, run
against `https://copy-paste-labs.vercel.app` with **real Sarvam**: 30 checks, 0 failures. Same
suite against localhost: 30/30. Two different audio files, two different runs, two different
transcription results.

The guard was tested rather than assumed. The production bundle was started with `VERCEL=1` and
`TRANSCRIPTION_PROVIDER=fixture`, and a file named to match a fixture slug was uploaded — the
exact path that caused the original failure. Result: HTTP 500 with *"Replay would attach a
transcript from a different recording to this lecture, so it is refused"*, the lecture left at
`pending_upload`, `provider_job_id` null, `raw_transcription_response` null. No foreign transcript
stored.

**Blast radius, measured.** 22 of 27 lectures carried a replayed transcript. 21 were that
session's own test uploads. Exactly one was a real user lecture — "Cloud computing"
(`5ced44b6-e156-4ddb-9146-14035d366620`) — which had extracted 21 candidates from a
thermodynamics transcript. Zero of those candidates were confirmed and zero students were enrolled
in that course: the confirmation gate did the job it exists for while the layer beneath it was
wrong. A bad transcript produced a bad review queue, not a false answer to a student. That is not
a defence of the bug, but it is the difference between an embarrassment and a retraction. The row
was deliberately **left as it is**, because re-transcribing overwrites a stored raw response and
whether to do that is the operator's call, not a side effect of a bug fix.

**Making the first live call reproduced the Arabic failure and disproved the fix recorded for
it.** Clip B is an English DSP lecture. Sarvam returned romanized **Arabic** for it on a live
call, with `language_code` sent explicitly as `"en-IN"`. Stating the language does not prevent the
misdetection. All three guards stayed silent:

| Guard | Why it was silent |
|---|---|
| language mismatch | the engine reported `en-IN`, matching what was sent |
| low confidence | live batch responses carry **no** `language_probability` at all — it is null. The heuristic only ever worked on the captured fixtures, which have it |
| transcript text | 65 tokens, below the 120-token floor, so it refused to judge |

The text check would have caught it easily on merit: English function-word ratio 0.015 against
0.427 for the genuine English clip in the same run. **The floor, not the signal, is what failed.**

Reported rather than fixed — the instruction that evening was to fix the identity pipeline only
and build nothing else. It was fixed on 2026-08-30.

### 4. Lecture knowledge: extract what was *taught*, not only what was assigned (`4cacb72`, 19:55)

A real 23-minute college lecture on cloud computing produced **exactly one candidate**: the
deployment assignment in its final minute. The matcher was not at fault and no tuning would have
helped. Every value `CandidateKind` allowed — `assignment`, `deadline`, `exam_scope`,
`announcement`, `guidance` — is a category of **action**, so there was no shape in the schema in
which "the lecturer defined a unified manager" could be stored even if something had detected it.
Twenty-two minutes of teaching had nowhere to go. The same lecture now yields 32 items: 26
teaching, 5 actionable, 1 reference.

`src/lib/extraction/teaching.ts` matches the six sentence *shapes* a lecturer uses to signal
teaching — agenda, topic boundary, enumeration, naming, contrast, Hinglish recap — each with a
capture group for the subject. A cloud-computing word list would have scored well here and zero on
a chemistry lecture; "the next topic we have is" and "there are two types of" are the same in
both. It is **composed with** `rules` rather than merged into it, because the two have opposite
error costs: an obligation should be missed rather than invented, while a teaching topic is cheap
to over-produce and expensive to miss. `rules` stays registered unchanged as the actionable-only
baseline.

The actionable half was also weak, and that was a grammar gap: the assignment was set across five
sentences and only the one containing "karna hai" was caught. The lexicon had been built entirely
from the infinitive-plus-auxiliary construction and was deaf to the imperative — a lecturer saying
"questions likho, search karo, find out karo" sets work without ever using it. Imperative mood,
the addressed-deliverable case ("Assignment for you", which had scored 0.44 against a 0.45 floor
because a short-sentence penalty applied to a complete three-word sentence), and marks were added.

Recorded in the commit and worth keeping: the first version of the imperative lexicon included the
infinitives *karna / likhna / banana*, and that immediately resurrected the exact false positive
the suppression rules exist to kill — "derive karna hai" became homework. **The verb form is the
signal.** Infinitives are now excluded by name.

Three other things landed in the same commit:

- **`/api/lectures/[id]/taught`** — answered from *stored* knowledge and never by re-reading the
  transcript. A product that re-derives its answer from 22,000 characters on every question has no
  stored knowledge, only a summariser. The answer is a structure, not prose. Faculty see
  unreviewed items badged `unconfirmed`; students see only what a human confirmed.
- **Confirm was not broken underneath.** It was reported as "0 pending · 1 ruled but the card is
  still there". The verdict was written, the item became course knowledge, and a refresh preserved
  it — the queue simply rendered `[...pending, ...ruled]`, so nothing ever left it. A queue whose
  items never leave is not a queue, and **from outside, "it worked" and "it did nothing" looked
  identical.** Ruled items now move to a collapsed section and pending is grouped by category.
  Teaching and references get a bulk confirm; actionable deliberately does not, because a deadline
  must be read one at a time.
- **Delete.** Removes the audio, the row and every candidate and verdict beneath it. Confirmation
  requires typing the lecture title, because a dialog dismissed by reflex is not a confirmation
  and deleting the wrong lecture is precisely the failure a reflexive click produces. Storage
  first, row second: object removal is idempotent, so a retry after a half-failure succeeds, while
  the reverse order would strand audio nothing points at.

Verified on the real lecture rather than a fixture: stored rows checked against a fresh in-memory
extraction (same count, every produced item stored, nothing in the database the extractor did not
produce, evidence text and confidence identical, all 32 char spans slicing back exactly, every
timestamp inside a real segment). Browser-driven over CDP: 24 checks on the lecture page and 10 on
deletion. lint 0, typecheck 0, build clean, extraction suite 76, provenance suite 16. Migration
`20260822180000_lecture_knowledge.sql` was already applied.

## Decisions made

**No entries were added to [`../decisions.md`](../decisions.md) that evening.** Verified on
2026-08-30: the newest entry in that file is still the 2026-08-22 afternoon one.

Three judgements are visible in the code and are recorded here as **inferred from the commits**,
not as decisions on file:

1. **Deploy in the region the database is in, on measured latency.** The move to `bom1` rests on
   five timed calls, not on a rule of thumb.
2. **Keep the foreign transcript.** Lecture `5ced44b6` was left carrying a thermodynamics
   transcript rather than re-transcribed, on the reasoning that overwriting a stored raw response
   is an operator decision. This is still true on 2026-08-30 and is still open.
3. **Teaching and actionable extraction stay separate passes** because their error costs are
   opposite. This is the load-bearing one — it is the reason a future tuning change to one cannot
   silently move the other's threshold — and it deserves a `decisions.md` entry it does not have.

## Learnings captured

**None.** No `AI-Memory/Inbox/` entry was written for this session, or for the two after it. The
last ClassMind Inbox entry is still `2026-08-22T0930Z-classmind-v1-build-and-verification`, which
covers the *afternoon*. Captured belatedly on 2026-08-30 in
`AI-Memory/Inbox/classmind/2026-08-30T1108Z-transcript-guard-and-mvp-sprint/`.

## Mistakes hit

- **The session ended with no log and no `progress.md` entry** — the same failure the 2026-08-19
  session made, recorded on 2026-08-21, and named in that entry as structural rather than careless.
  It recurred within three days, and then twice more.
- **A live provider defect was found and left unrecorded outside a commit message.** The Arabic
  misdetection reproduced on a live call, disproving a fix recorded on 2026-08-21, and that fact
  lived only inside `63d3fb4` for eight days. Nothing in the documents said it was outstanding in
  the meantime.

## Ending state

Deployed at `https://copy-paste-labs.vercel.app`, on `bom1`, with a Privacy Policy and Terms
reachable from every page. The first live Sarvam calls have been made. Lecture identity is fixed
and verified in production. The extractor can now see teaching, not only actions.

Carried forward, unfixed: the wrong-language transcript problem, now *reproduced live* and with
all three guards demonstrated useless against it; lecture `5ced44b6` still carrying a foreign
transcript; and no consent mechanism behind the policy documents that describe one being absent.

## Next session should start with

Writing this log and the `progress.md` entry, neither of which happened. Then the wrong-language
guard, which by the end of this evening had a *measured* diagnosis and no fix.

*(Neither happened. The 2026-08-24 and 2026-08-26 sessions also left no record, and the guard was
not rebuilt until 2026-08-30.)*
