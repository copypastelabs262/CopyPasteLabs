# Milestone 2 handoff — paused mid-design, no code written yet

Session paused 2026-08-07 at the user's request (shutting down for the day).
Repo is clean: `git status` shows nothing uncommitted, fully synced with
`origin/master` at `1f68368`. **Nothing in this note is committed to git
history or design decisions** — it's a resume point for the next session,
and should probably be deleted once Milestone 2's plan is actually written
up and agreed.

## Where things stand

**Milestone 1 is done, verified, and pushed.** See `README.md`'s milestone
table and the commit `ed74e62`/`42af125` trail for what it produced.

**Milestone 2 (Audio Ingestion) is in the design phase.** The user gave an
explicit "do not generate code yet — first design the plan" instruction,
asking for 10 specific things (end-to-end flow, folder structure, files,
API routes, Storage structure, DB schema, Sarvam integration strategy,
error handling, file validation, success criteria). **None of that plan has
been written up or shown to the user yet.** Do not skip straight to
implementation on resume — finish the design, present it, wait for
approval, per the user's own instruction in this milestone's kickoff
message.

## What was being investigated when interrupted

Two things were being checked against the actual installed versions
(per `AGENTS.md`'s instruction to verify against `node_modules/next/dist/docs`
rather than trust training-data assumptions, since this Next.js version
postdates training data):

1. **Next.js 16 Route Handler body handling.** Confirmed via
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`:
   `request.formData()` is the standard way to read a multipart upload in a
   Route Handler, and it buffers the entire body before you can touch it.
   For a 200–400MB lecture file, proxying the upload through a Next.js
   Route Handler this way would hold the whole file in server memory —
   wasteful and avoidable.

2. **Installed Supabase Storage client's upload API surface.** Confirmed
   via `node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts`
   (installed `@supabase/supabase-js@2.112.2`): it has
   `createSignedUploadUrl()` and `uploadToSignedUrl()`, i.e. genuine support
   for **direct browser-to-Storage upload** that never routes the audio
   bytes through our Next.js server at all.

**Where this was heading:** the emerging recommendation was to design
Milestone 2's upload path as direct-to-Supabase-Storage from the browser
(via a signed upload URL minted by a small server endpoint), with the
Next.js server only ever handling small JSON payloads (metadata, the
signed-URL request, the "create record" call) — never the audio bytes
themselves. This was not yet finalized or presented to the user.

## A naming conflict worth raising when the design resumes

The user's kickoff message for Milestone 2 says "Create lecture record" as
one step of the flow. Checked against
`.knowledge/domain-model.md` line 58:

> Lecture | **Rename → Session** | "Lecture" means three different things:
> the scheduled slot, the meeting that occurred, and the recording of it.

So "Lecture" is an explicitly renamed/banned word in the frozen domain
model — not a casual naming choice. But the obvious fix (call the table
`sessions` instead) has its own problem: **"Session" is itself a formal
domain-model concept**, part of the Session aggregate, with
`Depends on: Course Offering, Person` and a defined lifecycle
(`Occurred → Captured → Transcribed → Observed → Reviewed → Settled`).
Naming Milestone 2's raw-intake table `sessions` would quietly assert that
every uploaded file represents a validated Session in the domain sense —
exactly the kind of premature domain-concept commitment `lab/README.md`'s
own gate line exists to prevent ("Anything that handles bytes and
provenance is not [behind the gate]").

**Leaning toward recommending:** a domain-neutral name for the Milestone 2
table/entity — something like `runs` or `ingestion_runs` — that makes no
claim about class structure, course offerings, or people. This also matches
vocabulary the Realist's council session already used for the CLI-era plan
(`data/runs/<timestamp>`). This wasn't yet raised with the user — do that
before writing the schema section of the plan.

## Still open from Milestone 1's handoff (status unknown, ask first)

1. Has the Supabase project been created, and is `.env.local` filled in?
2. Has Sarvam's terms on secondary use of submitted audio been read
   (Milestone 0), and is there a Sarvam API key?

Both block real testing of whatever Milestone 2 builds, though the design
work itself doesn't need them yet.

## Next action on resume

Finish grounding the Milestone 2 design (the Sarvam integration strategy
section still needs Sarvam's actual API shape — likely needs the user to
paste in API docs, since Sarvam isn't an installed package we can inspect
the way we inspected Next.js/Supabase), then present the full 10-point plan
and wait for the user's go-ahead before writing any code.
