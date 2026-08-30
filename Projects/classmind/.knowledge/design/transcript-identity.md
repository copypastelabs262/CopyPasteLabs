# Transcript identity — proving a transcript belongs to THIS recording

**Status:** design, not implemented. No file under `src/` was changed writing this.
**Date:** 2026-08-30
**Scope:** Tier 1 and Tier 2 only. Tier 3 (audio fingerprinting) is explicitly out of scope
and is named in "Honest limits" as the hole this design does not close.
**Migration:** `product/classmind-v2/supabase/migrations/20260830150000_audio_identity.sql`
— **WRITTEN BUT NOT APPLIED.**

---

## 0. Two guarantees, one of which exists

| | Question | Where it lives |
|---|---|---|
| (a) | Is this transcript linguistically valid? | `src/lib/provenance/transcript-validation.ts` — solved |
| (b) | Does this transcript belong to **this** uploaded recording? | nothing — unsolved |

On 2026-08-22, lecture `5ced44b6-e156-4ddb-9146-14035d366620`, uploaded as
`Cloud computing.mp3`, was stored byte-correct and served the transcript of an engineering
**thermodynamics** course outline. Guard (a) cannot see this. The thermodynamics transcript is
fluent, confident English; it scores well above every threshold in `transcript-validation.ts`.
It is not a language failure. It is an identity failure, and the product has no concept of one.

### Verified against the live database, 2026-08-30 (read-only)

50 lecture rows. Confirming and correcting the assumptions this design was handed:

- **`5ced44b6` confirmed.** `original_filename` `Cloud computing.mp3`,
  `checksum_sha256` `e4ebbb6b77…`, `provider_job_id` `fixture:course-outline-en:1787402755651`,
  transcript begins *"Hello everyone. I am happy to invite you to this series of lectures on
  first level engineering thermodynamics course."* Status **`ready`** — published, not
  quarantined. `transcript_validation` is null.
- **`checksum_sha256` is populated far less than assumed.** 42 of 50 rows are **NULL**. Only
  the browser path (`LectureUpload.tsx`) sends it; every scripted and seeded upload omits it.
  It exists, it is unverified, and most of the time it is absent as well.
- **Sarvam's `audio_hash` is reliably present on real batch responses.** All 5 genuine
  production jobs carry one. 13 of 50 rows have none — every one of them a fixture replay, a
  seed, or a `pending_upload`. So the field is dependable for the live provider and must still
  be treated as optional in the type system.
- **The invariant already has a real violation in production.** Provider audio identity
  `2cb46c01b28a8d4664ef51db8536e02d` is claimed by two distinct uploaded recordings
  (`0000…0000` and `e4ebbb6b77…`). A naive `UNIQUE` constraint therefore **cannot be applied**
  — 16 rows share that identity. See §5.
- **The same audio also carries two different provider identities.** `checksum e4ebbb6b77…`
  appears twice: as `5ced44b6` ("Cloud computing.mp3" → identity `2cb46c01b2…`, the replayed
  thermodynamics transcript) and as `dfd7312d` ("WhatsApp.mp3" → identity `5926d36026…`, a real
  Sarvam job, a real transcript). **The genuine transcript of that recording exists in the
  database, five rows away from the foreign one.**
- **`provenance.engine` = `fixture-replay` on 39 of 50 rows**, `sarvam` on 5, absent on 6.

---

## 1. The chain, hop by hop

```
[H0] teacher picks a file
      ↓
[H1] browser hashes it, POSTs the claim → lecture row created
      ↓
[H2] browser PUTs bytes → Supabase Storage at <lectureId>/original.<ext>
      ↓
[H3] transcribe route downloads the object → streams bytes to the provider
      ↓
[H4] provider returns a job id → written to the lecture row
      ↓
[H5] poll route fetches the result for that job id
      ↓
[H6] result written onto the lecture row
      ↓
[H7] extraction, knowledge, the student view
```

| Hop | Failure mode | Detectable today? |
|---|---|---|
| H0 | The teacher uploads the wrong recording | No, and no system can. Out of scope. |
| H1 | Client hashes file A, uploads file B | **No.** The hash is never checked. |
| H1 | Client sends no hash at all | **No.** Accepted silently; true of 42/50 rows. |
| H2 | Upload truncated or corrupted mid-PUT | **No.** A short object is still an object. |
| H2 | A second upload overwrites the object under a row that already has a transcript | **No.** Path is derived from the lecture id, so it is the same path. |
| H2 | Signed URL for lecture A used to write lecture B | Yes — already structural. The path is baked into the signature. |
| H3 | The row points at the wrong `storage_path` | **No.** |
| H3 | The bytes reaching the provider differ from the bytes in storage | **No.** Nothing hashes what was sent. |
| H3 | **The fixture provider is selected and picks a transcript by filename** | Partly. `index.ts` refuses when `process.env.VERCEL` is set — but only there, and only for that one signal. |
| H4 | Two concurrent submits; the second overwrites the first's job id and orphans a live job | **No.** The status check is a read-then-write with a gap. |
| H4 | Job id collides | `provider_job_id` is `unique`, so a genuine collision errors. Worthless against replay: fixture ids embed `Date.now()` and never collide. |
| H5 | Provider returns another job's result | **No.** |
| H5 | The result is a replay of an older recording | **No.** This is the incident. |
| H6 | Result overwrites a newer job's result | Yes. The poll write already predicates on `.eq("provider_job_id", …)`. |
| H6 | Result written to the wrong lecture row | Yes. `.eq("id", id)`. |
| H7 | Knowledge derived from a foreign transcript | **No.** `5ced44b6` is `ready` and published. |

Eleven of these are currently undetectable, and all eleven are on the path between
"the teacher's bytes" and "the text on screen".

---

## 2. The bindings

Two observations make the chain checkable, and neither is specific to a filename, a course, a
language, a lecturer or a subject. Every lecture produces both, automatically, forever.

### Binding A — what the server actually sent

`submitted_audio_sha256` (new column). SHA-256, computed **server-side**, of the exact
`ArrayBuffer` handed to `provider.submit()`.

- **Written:** in `api/lectures/[id]/transcribe/route.ts`, in the same `UPDATE` that writes
  `provider_job_id`. A row can never name a job without naming the bytes that job was given.
- **Checked:** immediately, against `lectures.checksum_sha256` — the browser's claim — before
  the provider is called at all.

This is deliberately **one** column, not a `stored_` and a `submitted_` pair. The route
downloads into one buffer and passes that same buffer onward, so two columns would be equal by
construction and could only ever disagree through a bug. **Cost, named:** if that route is ever
changed to stream from Storage to the provider without buffering, the two stop being the same
thing and this column must split. That is written into the migration comment.

`submitted_at` (new column) is added alongside it. `created_at` is row creation, which precedes
the upload and can be hours earlier; it cannot anchor a freshness check.

### Binding B — what the provider says it decoded

`provider_audio_id` (new column). The provider's own identity for the audio it transcribed.
For Sarvam this is `raw_transcription_response.audio_hash`.

It is **not** a hash of our bytes, and this design never treats it as one. It is a hash of the
provider's *decoded* audio — the response reports `audio_mime: "audio/wav"` for a file we sent
as mp3. It cannot prove "this transcript is of my audio." What it can do is **discriminate**:
three captured fixtures have three distinct values, five real production jobs have values that
partition exactly along the real recordings, and the contaminated row shares its value with the
fixture it was replayed from.

Lifted out of the raw response by the **provider adapter** (`TranscriptionProvider.audioIdentity(raw)`),
never by a route reaching into a Sarvam-shaped field. That keeps the boundary in
`src/lib/transcription/types.ts` intact — nothing downstream of that file knows the word Sarvam,
and this must not be the exception.

- **Written:** in `api/lectures/[id]/poll/route.ts`, in the same statement as
  `raw_transcription_response`, `provenance` and `transcript_validation`.
- **Checked:** against the identity ledger (§5), atomically, in the same request.

### Binding C — the job belongs to the lecture that created it

Three changes, none of which needs a new column:

1. **The provider-side filename becomes the lecture id.** `sarvam.ts` currently sends
   `lecture.original_filename` — a user-controlled string — as the file name in
   `POST /upload-files`, and reads the output back by name. Sending `<lectureId>.<ext>` instead
   means the job's input and output files are named by *our* identifier. It removes
   user-controlled data from the provider request, it makes the downloaded output provably the
   output of the file we named, and — as a side effect that matters — it means there is no
   longer a user filename for anything to key a fixture off. One change, three benefits.
   The captured Lab v0 batch responses were produced from an 89-character filename containing
   double spaces and commas, so Sarvam is not fussy about the basename and a UUID is safe —
   but confirm on one live job before merging rather than inferring it from a fixture.
2. **The submit becomes an atomic claim.** Today the route reads `status`, decides, then
   writes. Two concurrent submits both pass the check and the second overwrites the first's
   `provider_job_id`, orphaning a live provider job. Making the status a predicate of the
   `UPDATE` — `where id = $1 and status in ('pending_upload','uploaded')` — closes the window
   with no new machinery, exactly as the poll route already does with `provider_job_id`.
3. **Freshness.** At poll, if the provider reports a job creation time
   (`polled.providerCreatedAt`) earlier than `submitted_at` less a tolerance, the result
   predates our request and cannot be a transcript of it. Provider-agnostic and cheap.
   **Honest about its reach:** it catches *stale* contamination, not concurrent contamination,
   and a tolerance of a few minutes is needed for clock skew. Measured relevance: `5ced44b6`'s
   stored response carries `request_id: 20260821_…` — a transcript stamped the **day before**
   the job was submitted. (Note the negative result: Sarvam's `request_id` is *never* equal to
   the batch `provider_job_id` — verified on all 5 real jobs — so an equality check between
   them would be simply wrong. Only the ordering is usable.)

### Where everything lives

| Fact | Written | By | Checked | By |
|---|---|---|---|---|
| `checksum_sha256` (claim) | lecture create | `api/courses/[id]/lectures` | at submit | transcribe route |
| `submitted_audio_sha256` | at submit | transcribe route | at poll, against the ledger | poll route |
| `submitted_at` | at submit | transcribe route | at poll, freshness | poll route |
| `provider_job_id` | at submit, atomically | transcribe route | at the result write | poll route (`.eq`) |
| `provider_audio_id` | at poll | poll route via adapter | ledger primary key | Postgres |
| `audio_identity` | at submit, rewritten at poll | both routes | at extraction and at read | extract route, lecture GET |
| `replay_fixture_slug` | at lecture create | lecture create route | everywhere replay must be visible | UI + queries |

---

## 3. What happens on a mismatch

### Reuse the quarantine shape, do not invent a parallel one

`audio_identity` is a `jsonb` column with **exactly** the shape of `transcript_validation`, down
to the vocabulary:

```ts
export type AudioIdentityVerdict = "pass" | "uncertain" | "reject";   // same three words

export type AudioIdentityCode =
  | "stored_audio_mismatch"       // server digest != the browser's claim
  | "upload_claim_missing"        // no claim to check (legacy / non-browser path)
  | "declared_size_mismatch"      // file_size_bytes != bytes actually downloaded
  | "foreign_audio_identity"      // identity already bound to different audio
  | "provider_audio_id_absent"    // provider returned no identity
  | "result_predates_submission"  // provider job older than our submit
  | "job_binding_mismatch"        // provenance / job id / row disagree
  | "replayed_transcript";        // deliberate replay, dev only

export interface AudioIdentity {
  verdict: AudioIdentityVerdict;
  code: AudioIdentityCode | null;
  reason: string | null;          // written for a faculty member, not an engineer
  metrics: {
    claimedSha256: string | null;
    submittedSha256: string | null;
    declaredBytes: number | null;
    observedBytes: number | null;
    providerAudioId: string | null;
    providerJobId: string | null;
    boundToLectureId: string | null;   // who already holds this identity
    submittedAt: string | null;
    providerCreatedAt: string | null;
    replayFixtureSlug: string | null;
  };
}
```

Same four top-level fields, same three verdicts, same "store the verdict, never recompute it on
read" reasoning as `20260830100000`. The payoff is direct: the extraction gate and the read gate
become one helper over two records instead of two parallel code paths that will drift.

Lives in a new pure module `src/lib/provenance/audio-identity.ts` — no imports, no clock, no
I/O, runnable under plain node, matching `transcript-validation.ts`.

### Quarantine or fail? The rule, stated once

**It depends on whether a transcript exists**, and the existing migration already defines the
line: `'quarantined'` means *a transcript exists and is retained as evidence but is not fit to
derive from*; `'failed'` means *no transcript was produced, there is nothing to keep*.

| Detected at | Transcript exists? | Outcome |
|---|---|---|
| H1–H3 (before submit): `stored_audio_mismatch`, `declared_size_mismatch` | No | **`failed`** + `audio_identity`, 409 to the caller. The provider is never called — no spend on audio we cannot vouch for. The fix is a re-upload. Calling this "quarantined" would be a lie: there is nothing quarantined. |
| H1 `upload_claim_missing` | No | **Proceed**, verdict `uncertain`. A missing claim is not evidence of a mismatch, and blocking would break every non-browser path. New uploads cannot reach this state (see below); legacy ones stay legible. |
| H4–H6 (at poll): `foreign_audio_identity`, `result_predates_submission`, `job_binding_mismatch` | **Yes** | **`quarantined`**, exactly as a language rejection. The raw response is stored unchanged in the same statement — it is the artefact everything re-derives from and the only proof of what the engine did, which is precisely what diagnosing 2026-08-22 required. |
| H5 `provider_audio_id_absent` | Yes | Verdict `uncertain`, status `transcribed`. Refusing every transcript from a provider that does not echo an identity would refuse all transcripts from any future provider. Recorded, surfaced, not blocking. |

`upload_claim_missing` is closed at the source rather than tolerated forever: the lecture-create
API starts **requiring** `checksumSha256` (400 without it). The browser already sends it; the
scripts already compute it. Legacy nulls stay null, because they cannot be filled in.

### What a quarantine stops

Unchanged from the language guard, which is the point of reusing the shape:

- `extract/route.ts` — the gate becomes "reject if `status = 'quarantined'` **or**
  `transcript_validation.verdict = 'reject'` **or** `audio_identity.verdict = 'reject'`", one
  helper over both records.
- `lectures/[id]/route.ts` — a non-owner already only sees `status = 'ready'`.
- `LectureClient.tsx` — the existing quarantine banner gains the identity reason. A faculty
  member should never have to read a provenance panel to learn the transcript is not theirs.

### Open question, deliberately left open

Should an *identity* quarantine be re-submittable? An identity failure means the plumbing was
wrong and re-transcription is the correct remedy; a *language* quarantine means the audio is
bad and retrying only spends money. That argues for allowing re-submit from `quarantined` when
the code is an identity code. It is a per-code branch in a route that currently has none, and
it is not needed to make anything above correct. **Recommend deferring** to a deliberate
operator action rather than smuggling it in.

---

## 4. Lecture 5ced44b6 today — a decision the operator has to make

It is `ready`. A student enrolled in that course can open it right now and read a
thermodynamics transcript. The row must not be modified.

Both can be true at once, because the fix is a **read-time derivation, not a write**:
when serving a lecture, treat it as unpublished for non-owners if
`audio_identity.verdict = 'reject'` **or** (`audio_identity` is null **and**
`provenance.engine` is not the live engine). No row changes; `5ced44b6` and the other 38
`fixture-replay` rows stop reaching students; every one of them stays readable by its owner and
by the audit queries.

**Cost, named:** this changes what students see for 39 historical lectures in one deploy, on a
derived condition rather than a stored one — the exact pattern §3 argues against for verdicts.
It is defensible here only because it is a *visibility* rule and not a verdict, and because the
alternative is knowingly serving foreign transcripts. Flagging it as the operator's call rather
than folding it in silently.

---

## 5. The uniqueness invariant

> **A provider audio identity belongs to exactly one piece of audio.** Two lectures whose
> submitted bytes differ may not both be told their transcript came from the same decoded audio.

### Why the obvious constraint is wrong, twice over

```sql
-- WRONG. Do not apply.
alter table public.lectures
  add constraint lectures_provider_audio_id_key unique (provider_audio_id);
```

**(a) Semantically wrong.** Re-transcribing the same lecture, or two faculty uploading the same
recording, legitimately yields two rows with the same provider identity. Production already
contains such pairs: `fc0103fc`/`16566f94` and `f8d1b370`/`42e43afb` are the same two clips
transcribed twice, matching checksums *and* matching audio hashes. This constraint would forbid
re-transcription.

**(b) It would fail to apply.** Sixteen rows share `2cb46c01b28a8d4664ef51db8536e02d`. Historical
rows must not be modified, so there is no legal way to make it valid.

Scoping by date — `where created_at > '2026-08-30'` — makes it *apply*, and is still wrong: the
semantics are unchanged, and the constraint's correctness now depends on a literal that means
nothing to a reader in a year. Special-casing the calendar is the same category of mistake as
special-casing the filename.

### The correct form: a functional dependency in a ledger that starts empty

What the rule actually states is `provider_audio_id → submitted_audio_sha256`. Postgres cannot
express a functional dependency across rows of `lectures`, but it expresses it perfectly as a
**primary key on a separate table** — and that table starts empty, so **no historical row can
make it fail to apply and no historical row is touched to create it.** That is the whole trick.

```sql
create table public.provider_audio_identities (
  provider_audio_id      text primary key,          -- the invariant IS the key
  submitted_audio_sha256 text not null,
  first_lecture_id       uuid references public.lectures(id) on delete set null,
  first_seen_at          timestamptz not null default now(),
  backfilled             boolean not null default false
);
```

`on delete set null`, not `cascade`: deleting a lecture must not silently free its identity for
a different recording to claim. The ledger is append-only evidence.

Enforcement at poll time is one statement, and the key does the work atomically — a read-then-write
check in the route could never survive two concurrent polls:

```sql
insert into public.provider_audio_identities
  (provider_audio_id, submitted_audio_sha256, first_lecture_id)
values ($1, $2, $3)
on conflict (provider_audio_id) do nothing
returning provider_audio_id;
```

Empty `RETURNING` ⇒ the identity was already bound. Read the bound row; if
`submitted_audio_sha256` differs from ours → **`foreign_audio_identity`, quarantine**. If it
matches → legitimate re-transcription, pass.

**Ordering and the orphan case.** The ledger insert happens *before* the lecture update. If the
lecture update then fails, the ledger holds a binding for a lecture with no stored transcript.
That is harmless and self-healing: the next poll of the same lecture presents the same identity
with the same digest, matches, and proceeds. An orphan can only ever cause a false *pass*, never
a false quarantine.

### Legacy rows

Seeded, tolerantly, from rows carrying **both** facts — 7 of 50 in production:

```sql
insert into public.provider_audio_identities
  (provider_audio_id, submitted_audio_sha256, first_lecture_id, first_seen_at, backfilled)
select distinct on (l.raw_transcription_response ->> 'audio_hash')
       l.raw_transcription_response ->> 'audio_hash', l.checksum_sha256, l.id, l.created_at, true
  from public.lectures l
 where l.raw_transcription_response ->> 'audio_hash' is not null
   and l.checksum_sha256 is not null
 order by (l.raw_transcription_response ->> 'audio_hash'), l.created_at
on conflict (provider_audio_id) do nothing;
```

`DISTINCT ON` picks exactly one row per identity, deterministically, oldest first — so the
insert cannot conflict with itself and the **existing violation does not abort the migration**.
The losing row is not deleted, not updated, not flagged. `backfilled = true` marks bindings that
rest on data collected under the broken regime, so an operator can delete them without touching
a lecture.

Rows with a null checksum contribute nothing verifiable and are excluded — including them would
seed the ledger with nulls and poison every future comparison.

Losers are **named, not fixed**, by a read-only view:

```sql
create or replace view public.lecture_identity_conflicts with (security_invoker = true) as …
```

It `COALESCE`s the new columns with the legacy ones, so it covers rows written before the
columns existed without writing anything back. `security_invoker` so it cannot become a hole
around the zero-policy RLS on `lectures`; `select` granted to `service_role` only. `5ced44b6`
is expected to appear in it.

### Direction: what is enforced, what is only reported

The invariant is enforced in one direction — *many audio → one identity is a violation*.

The other direction is **reported, not enforced**: `checksum e4ebbb6b77…` appears with two
different provider identities (`5ced44b6` and `dfd7312d`). That looks like a violation, and in
that specific case it is one. But we cannot *prove* a provider hashes deterministically across
submissions, and a rule that quarantines on an unproven assumption about a third party will
eventually quarantine a real lecture. The view reports it; the ledger does not enforce it.

---

## 6. The fixture provider stops being selectable by filename

### What it does today

`src/lib/transcription/fixture.ts` → `pickFixture(filename)`:

```ts
const named = fixtures.find((f) => normalized.includes(f.slug));   // filename decides
if (named) return named;
// otherwise a stable hash of the filename, modulo the fixture count
```

A lecture named `Cloud computing.mp3` matched nothing and fell to the hash, which landed on
`course-outline-en` — the thermodynamics course outline. **That is the entire mechanism of the
2026-08-22 failure.** Selection was implicit, filename-derived, and looked plausible.
`index.ts` refuses when `process.env.VERCEL` is set, which is one signal on one platform, and
which does nothing about the filename problem at all.

### What replaces it

**1. Delete `pickFixture` entirely.** No filename read, no hash fallback, no default.
`createFixtureProvider(slug)` takes the slug as an argument and throws on an unknown one.
`submit()` never sees a value it could key a decision off.

**2. Delete the `TRANSCRIPTION_PROVIDER` env var.** An environment variable is exactly the kind
of thing that gets set for a demo and forgotten — that is already written in `index.ts` as the
reason for the Vercel guard, and it is the right diagnosis with the wrong cure. Replay becomes
**per-lecture and explicit**: the lecture-create API accepts an optional `replayFixture: "<slug>"`,
stores it in `lectures.replay_fixture_slug`, and **rejects it with 400 on any deployment**
(`process.env.VERCEL` or `NODE_ENV === "production"`). A rejected *request* appears in logs; an
ambient setting does not.

**3. `getTranscriptionProvider(lecture)`** returns Sarvam unconditionally unless
`lecture.replay_fixture_slug` is non-null *and* replay is allowed here. There is no other
branch. A lecture created without naming a fixture cannot be replayed under any environment.

**4. Replay becomes a queryable fact.** `select count(*) from lectures where
replay_fixture_slug is not null` answers "does production hold any replayed lecture?" —
today that requires a JSON search through `provenance.limitations` for the word `REPLAY`.

**5. The filename we send the provider is the lecture id** (§2, Binding C). Even if someone
restored filename selection, there is no user filename left to select on.

**What this costs.** Five scripts drive the HTTP API in fixture mode
(`e2e.mts`, `verify-languages.mts`, `test-quarantine-e2e.mts`, `qa/access-boundaries.mts`,
`qa/isolation-and-duplication.mts`). Each needs a one-line change: pass `replayFixture: "<slug>"`
when creating the lecture instead of exporting an env var. They get **stronger** for it — a
test that names the transcript it expects is a better test than one that hopes the filename
hashes to the right fixture. `DEPLOY.md`, `.env.example` and `README.md` lose their
`TRANSCRIPTION_PROVIDER` sections.

**What is deliberately not done.** Deleting the fixture provider outright. The captured
responses are real Sarvam output and the misdetected-language fixture reproduces a real failure;
downstream stages can only be tested against a transcript shaped like a real one. The problem was
never that replay exists — it is that replay was *selectable by accident*.

---

## 7. Honest limits

**The first contaminated lecture is not caught.** This is the important one. The uniqueness
invariant fires when a provider identity is claimed by *second* audio. If a provider hands us
someone else's transcript for a recording we have never submitted before, the identity is new to
us, binds cleanly, and everything passes. What this design guarantees is that **contamination
cannot spread silently** — the moment it recurs, or the moment the true owner of that audio is
transcribed, it surfaces. Closing the first-occurrence hole requires comparing the transcript to
the audio itself. That is Tier 3, and it is out of scope.

**`audio_hash` is not a proof and is never treated as one.** It is a hash of the provider's
decoded audio, not of our bytes. It cannot answer "is this transcript of my audio?" — only "have
I seen this decoded audio before, under a different recording?" If Sarvam changed its decoder,
every identity would shift and every historical binding would become meaningless. Nothing breaks
(new bindings simply form), but the ledger's history stops being comparable, and nothing in the
design would announce that.

**A provider that returns no identity is unprotected.** Verdict `uncertain`, and the invariant
never runs. Sarvam's batch API returns one on all 5 real jobs observed, but that is 5 jobs on one
day; a change on their side degrades this to nothing, quietly, and the only symptom would be a
rise in `provider_audio_id_absent`.

**Byte-identical decodes collide.** Two genuinely different uploads that decode to the same audio
— the same recording exported twice into different containers, or two short near-silent clips —
produce one identity and two digests, and are quarantined as contamination. A false positive.
Recoverable (nothing is deleted) but real, and it will look alarming.

**Freshness only catches stale contamination.** A provider mixing up two jobs *in the same
minute* passes. The tolerance that makes the check survive clock skew is the same tolerance that
blinds it to concurrent mixups.

**42 legacy rows can never be verified.** No checksum was ever recorded. They are excluded from
the ledger and appear in no conflict report. Their identity is permanently unknowable, and the
design says so rather than inventing a verdict for them.

**Duration plausibility was considered and rejected.** Measured on the real data: implied bitrate
(`file_size_bytes × 8 ÷ transcript duration`) is 66.8–196.8 kbps across every genuine row and
**83.1 kbps for `5ced44b6`** — squarely inside the legitimate band. It would not have caught the
incident. It does catch gross mismatches (0.0–0.2 kbps on truncated seed rows, 449.5 kbps on the
excerpted fixture), so it is worth recording as an `uncertain` signal one day. It is not part of
this design and is not in the migration.

**H0 is unreachable.** If a teacher uploads the wrong recording, every check here passes and
should. This design proves the pipeline did not swap the audio; it cannot prove the teacher
chose the right one.

**Nothing here defends against a hostile server.** All of it assumes our own service-role code
is honest. That is the correct assumption for this threat model — the failure was a bug, not an
attack — and it should be revisited if it ever stops being true.

---

## 8. Implementation plan

Order matters: the schema must exist before anything writes to it, the pure module before the
routes that call it, and the provider interface before its implementations.

| # | File | Change | Risk |
|---|---|---|---|
| 1 | `supabase/migrations/20260830150000_audio_identity.sql` | **written, NOT applied.** Apply deliberately. | Run the backfill and read `lecture_identity_conflicts` before touching any code. If it does not list `5ced44b6`, the migration is wrong. |
| 2 | `src/lib/provenance/audio-identity.ts` (new) | Pure verdict logic, no I/O, no clock. Mirrors `transcript-validation.ts`. | Low. Testable under plain node. |
| 3 | `src/lib/transcription/types.ts` | Add `audioIdentity(raw): string \| null` to `TranscriptionProvider`. | **Interface change — both providers must implement it before anything compiles.** |
| 4 | `src/lib/transcription/sarvam.ts` | Implement `audioIdentity`; send `<lectureId>.<ext>` as the provider-side filename. | **Riskiest live change.** It alters a request that three production jobs have completed through. Verify against one real job before merging: a wrong filename breaks `upload_urls` lookup *and* `download-files`, and it fails at submit, not silently. |
| 5 | `src/lib/transcription/fixture.ts` | Delete `pickFixture`; `createFixtureProvider(slug)`; `audioIdentity` returns null. | Low. Compile errors point at every caller. |
| 6 | `src/lib/transcription/index.ts` | Delete the env branch and `activeProviderId`'s env read; `getTranscriptionProvider(lecture)`. | Medium. Every caller changes signature. |
| 7 | `src/app/api/courses/[id]/lectures/route.ts` | Require `checksumSha256`; accept `replayFixture` only when replay is allowed. | **Breaking for any client that omits the checksum.** Update the five scripts in the same commit. |
| 8 | `src/app/api/lectures/[id]/transcribe/route.ts` | Hash the downloaded buffer; compare to the claim; write `submitted_audio_sha256`, `submitted_at`, `audio_identity`; make the status an `UPDATE` predicate. | Medium. SHA-256 of 50 MB is tens of milliseconds against a 60 s budget dominated by two large transfers — measure once, do not assume. |
| 9 | `src/app/api/lectures/[id]/poll/route.ts` | Extract `provider_audio_id` via the adapter; ledger insert; freshness; final verdict; quarantine. | **Riskiest logic.** The ledger insert must precede the lecture update (§5). Do not fold it into the existing `.update()` — two statements, ordered, with the orphan case reasoned about explicitly. |
| 10 | `src/app/api/lectures/[id]/extract/route.ts` | Extend the gate to `audio_identity` via one helper over both records. | Low. |
| 11 | `src/app/api/lectures/[id]/route.ts` | The read-time gate of §4. | **Operator decision first.** Changes what students see for 39 historical lectures. |
| 12 | `src/app/_components/LectureClient.tsx`, `LectureUpload.tsx` | Surface the identity reason in the existing quarantine banner; new `FailureKind`. | Low. |
| 13 | `scripts/verify-lecture-identity.mts` | Assert the ledger, the digest comparison, and that a second lecture cannot claim a bound identity. | Low; costs a real transcription run. |
| 14 | The five fixture-mode scripts | Pass `replayFixture` at lecture creation instead of an env var. | Low, mechanical. |
| 15 | `DEPLOY.md`, `.env.example`, `README.md` | Remove `TRANSCRIPTION_PROVIDER`. | Low, and the point: a documented footgun is still a footgun. |

**Sequencing note.** Steps 3–6 are one commit; the interface change does not compile in halves.
Steps 7–9 are one commit; a route that writes `submitted_audio_sha256` and a poll route that
does not read it is a half-built guarantee, and a half-built guarantee reads exactly like a
whole one.

---

## 9. Does this protect every future lecture automatically?

The requirement was: **every future uploaded lecture, regardless of filename, course, language,
lecturer, or transcription result.** Checked against each:

- **Filename** — the client filename is no longer read by anything that makes a decision. The
  provider is sent the lecture id. `pickFixture` is deleted.
- **Course** — no check reads `course_id`, `transcription_language`, or course context.
- **Language** — no check reads the transcript text. That is `transcript-validation.ts`'s job
  and these two guards are deliberately orthogonal.
- **Lecturer** — no check reads `owner_id` or any profile.
- **Transcription result** — the identity checks read the digest of the audio, the provider's
  echoed identity, timestamps, and the job id. The transcript's *content* is never consulted.
- **Nothing is keyed to the incident.** No fixture slug, no `Cloud computing`, no thermodynamics,
  no date literal, no allowlist. The migration's date-scoped index is explicitly rejected in §5
  for exactly this reason.

The one thing that *is* incident-shaped is the `lecture_identity_conflicts` view, which exists to
list historical damage. It is read-only, it enforces nothing, and it names no lecture in its
definition.
