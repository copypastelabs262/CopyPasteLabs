# Deploying ClassMind V1 to Vercel

**Live: https://copy-paste-labs.vercel.app** — deployed 2026-08-22, verified with 67 end-to-end
and 33 language checks run against production.

The app is a standard Next.js 16 App Router project and deploys without a `vercel.json`.
Everything below is a setting, a secret, or a check — there is no build magic to get right.

Four things about this repository will break a naive deploy, and all four are handled in code
already. They are listed at the end under "What was fixed for serverless" so that a future
change does not quietly undo them.

## Current state of the live project

| | |
|---|---|
| Vercel project | `copypaste-labs/copy-paste-labs` |
| Root Directory | `Projects/classmind/product/classmind-v1` |
| Framework | Next.js |
| Function region | `bom1` (Mumbai) |
| Production branch | `master` — every push deploys |
| Supabase | `kkjyfojcahlopsfpcdbw`, wired by the Supabase Vercel integration |
| Transcription | Live Sarvam. Replay is refused on every deployment — see § 2 |

### Two things the first deploy got wrong, so they are not rediscovered

**The project was created with Root Directory unset.** It "succeeded" in 2 seconds and served a
404 on every path: Vercel found no `package.json` at the repository root, detected no framework,
built nothing, and deployed an empty site. A build that is suspiciously fast and a 404 that
mentions no route are the symptom.

**`vercel --prod` from inside the app directory does not work on this project, and that is
correct behaviour.** The CLI uploads the current directory as the deployment root, and Vercel
then applies Root Directory *inside* that upload — so it looks for
`Projects/classmind/product/classmind-v1/Projects/classmind/product/classmind-v1` and fails with
"The specified Root Directory does not exist." Deploy by pushing to `master`, or trigger a Git
deployment through the dashboard. If you must use the CLI, run it from the repository root.

---

## 1. Create the Vercel project

**The one setting that matters: Root Directory.** This app is not at the repository root — the
repo is `CopyPasteLabs`, a multi-project workspace, and the app lives four levels down. Vercel
will find nothing if you skip this.

| Setting | Value |
|---|---|
| Repository | `copypastelabs262/CopyPasteLabs` |
| **Root Directory** | **`Projects/classmind/product/classmind-v1`** |
| Framework Preset | Next.js (auto-detected once Root Directory is right) |
| Build / Install / Output | leave all at the defaults |
| Node.js Version | 22.x or later |

There is no `package.json` above the app directory, so nothing competes for detection.

Via the CLI instead, from inside the app directory:

```
vercel login
vercel link      # when it asks "In which directory is your code located?", give this app's path
vercel           # preview deploy
vercel --prod    # production deploy
```

`vercel login` is interactive. In Claude Code, run it yourself with `! vercel login` so the
output lands in the session.

---

## 2. Environment variables

**Most of these are already set.** The Supabase Vercel integration populated
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and a
number of `POSTGRES_*` variables the app does not use; `SARVAM_API_KEY` was added by hand.
`TRANSCRIPTION_PROVIDER` was too, and is now dead — see below. All of them are **Production only** — preview
deployments have no Supabase configuration and will fail at request time until the targets are
widened.

Vercel marks these values *sensitive*, which means they can never be read back — not through the
API, not in the dashboard. Verify which Supabase project is wired up with
`vercel env pull <file> --environment=production`, which resolves the non-sensitive ones, rather
than by trying to decrypt them.

Set any new ones in **Project → Settings → Environment Variables**. Copy values from your local
`.env.local` — it is gitignored, so nothing here is in the repo.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Public. Ends up in the browser bundle. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public by design. Every product table has RLS on with zero policies, so this key can read nothing. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Secret. Bypasses RLS entirely.** Never prefix a key with `NEXT_PUBLIC_` by accident — that would publish it to every visitor's browser and hand out full database access. |
| `SARVAM_API_KEY` | yes | Every deployment transcribes for real; replay is not available on a deployment. |
| `TRANSCRIPTION_PROVIDER` | **removed** | Read nowhere. **Delete it from the project** — leaving it set implies a replay mode that no longer exists. |
| `ALLOW_LIVE_SARVAM` | no | Developer machines only, and never needed here. It permits a billable call locally; it cannot enable replay anywhere. |

You do **not** need to set `GIT_COMMIT`. Vercel injects `VERCEL_GIT_COMMIT_SHA` and the
provenance module reads it.

No environment variable is read at module scope, so a build will not fail if one is missing —
it will fail at request time instead, with a clear message naming the variable.

### Replay is not available on a deployment, deliberately

This used to say: deploy with `TRANSCRIPTION_PROVIDER=fixture` first, because it costs nothing
and proves the pipeline. That advice produced the 2026-08-22 failure. Replay attaches a
transcript from a *different* recording, the variable was set for a demo and then forgotten, and
the fixture was chosen by the uploaded **filename** — so a lecture named `Cloud computing.mp3`
was served an engineering thermodynamics transcript, on a live URL, to a real user. The
provenance said `REPLAYED, NOT TRANSCRIBED` and the panel rendered it; nobody read it.

So the switch was removed rather than re-documented. A documented footgun is still a footgun.

- `TRANSCRIPTION_PROVIDER` is read nowhere. Setting it has no effect. **Delete it.**
- Replay is now a property of one lecture (`replayFixture: "<slug>"` at creation, stored in
  `lectures.replay_fixture_slug`) and the API **refuses it with 400** whenever `VERCEL` is set or
  `NODE_ENV=production`. A refused request appears in the logs; an ambient setting did not.
- `select count(*) from lectures where replay_fixture_slug is not null` answers "does this
  deployment hold any replayed lecture?" directly. It should be zero here, forever.

The first deploy therefore transcribes for real. Do it deliberately with one short recording and
watch the function logs.

---

## 3. Supabase configuration

**Authentication → URL Configuration:**

- **Site URL:** `https://<your-vercel-domain>`
- **Redirect URLs** — add all of these:
  ```
  https://<your-vercel-domain>/**
  http://localhost:3100/**
  ```
  **The wildcard is not optional.** Supabase glob-matches the *entire* `redirectTo` URL including
  its query string, and the sign-in page appends `?role=faculty` so the callback knows which kind
  of account to create. A bare `https://<domain>/auth/callback` entry will not match that and the
  sign-in fails with a redirect-not-allowed error. Keep the localhost entry so local development
  keeps working.

Preview deployments get a new URL per commit. If you want OAuth to work on previews, add
`https://*-<your-team-slug>.vercel.app/**` too — or just test auth on production.

**Storage:** nothing to configure. Audio goes browser → Supabase Storage directly through a
signed URL and never passes through a Vercel function, which is what keeps uploads clear of
Vercel's 4.5 MB request body limit. Run `npm run setup:db` once against the project if the
`lectures` bucket does not exist yet.

### Function region — measured, not theoretical

Already set to `bom1`. Do not move it without re-measuring.

Vercel defaults new projects to **Washington DC (`iad1`)**. This Supabase project resolves to
`2406:da1a:…` — AWS **ap-south-1 (Mumbai)** — so on the default region every database query, and
the entire audio transfer in the transcribe route, crossed the Atlantic.

Measured on the live deployment, five calls to `/api/courses` (a two-query endpoint):

| Function region | Median | Range |
|---|---|---|
| `iad1` (Washington DC) | **1545 ms** | 1140–2328 ms |
| `bom1` (Mumbai) | **389 ms** | 151–1299 ms |

Four times faster, and the high end of the `bom1` range is a cold start rather than network
distance. If the Supabase project is ever moved, re-run the measurement — the setting is under
**Project → Settings → Functions → Function Region**.

---

## 4. Google sign-in

Two sides, and both must be done or the button fails with an unhelpful provider error.

**Google Cloud Console** → APIs & Services → Credentials → Create OAuth client ID → *Web
application*:

- **Authorised JavaScript origins:** `https://<your-vercel-domain>` and `http://localhost:3100`
- **Authorised redirect URI** — this is Supabase's callback, **not** your app's:
  ```
  https://<your-project-ref>.supabase.co/auth/v1/callback
  ```
  Getting this wrong is the single most common failure. The app's own `/auth/callback` is where
  Supabase sends the user *afterwards*; Google never calls it directly.

You will also need to fill in the OAuth consent screen (User Type *External*, app name, support
email, developer contact). **While it is in _Testing_ status, only Google accounts you list under
Test users can sign in** — everyone else gets `access_denied`, which looks exactly like a code
bug. Publish it before a real demo.

**Supabase dashboard** → Authentication → Providers → Google: enable it, paste the Client ID and
Client Secret, save. That panel also displays the callback URL Supabase expects — confirm it
matches character-for-character what you pasted into Google above.

Nothing goes into `.env.local` or Vercel for this. The Google client ID and secret live in
Supabase, not in the app.

**What the code does, so you can tell a config problem from a code problem.** The button calls
`signInWithOAuth`; Google returns to Supabase; Supabase returns to `/auth/callback`, which
exchanges the code for a session cookie and creates a `profiles` row **only if none exists** — a
second Google sign-in never overwrites a name or role the user has since changed. Every failure
path redirects to `/signin?error=<message>` rather than showing a blank page, so whatever goes
wrong will be legible on screen. The `next` parameter is validated against open redirects
(`//evil.com`, `/\evil.com`, absolute URLs are all rejected).

---

## 5. Verify the deployment

The verification suites accept a base URL, so point them at production. Run them **from your
laptop** — they need the service-role key to make assertions directly against the database:

```
E2E_BASE_URL=https://<your-vercel-domain> npm run test:e2e
E2E_BASE_URL=https://<your-vercel-domain> npm run test:languages
```

67 and 33 checks respectively. Note they upload ~10 MB and ~50 MB of real audio and create a
course per run, so this writes real rows into the live project — fine now, not something to run
casually once there is real course data.

If Vercel Deployment Protection is on (it is, by default, for preview deployments), the suites
will get HTML login pages instead of JSON. Either disable protection for previews or run against
production.

Then check by hand:

- `/signin` renders and Google sign-in completes
- A lecture upload advances on its own from `Transcribing` to `Published` without touching the page
- Clicking a candidate's timestamp seeks the audio and highlights the transcript
- A student who has joined sees only confirmed items

---

## 6. Before this is used by anyone real

- [ ] **Delete the test accounts.** `faculty.test@classmind.local` and
      `student.test@classmind.local` both have the password `ClassMindTest!2026`, which is in this
      repository. Delete them in Supabase → Authentication → Users.
- [ ] **Delete the test courses.** Sixteen `E2E-*`, `LANG-*`, `UIAUDIT-*`, `UIPOLL-*` and
      `UISTUCK-*` courses exist in the live project from verification runs.
- [ ] **Confirm `SUPABASE_SERVICE_ROLE_KEY` is not prefixed `NEXT_PUBLIC_`** in the Vercel
      dashboard.
- [ ] **Delete `TRANSCRIPTION_PROVIDER` from the Vercel project.** It is read nowhere; leaving it
      set implies a replay mode that no longer exists. Replay cannot be enabled on a deployment
      by any variable. Confirm with
      `select count(*) from lectures where replay_fixture_slug is not null` — expect 0.
- [ ] There is no consent or data-protection position yet, and lecture audio is personal data.
      That is a real blocker for use with actual students, not a formality.

---

## What was fixed for serverless

Four things in this codebase assumed a long-lived machine with a working directory. Each is
handled; each would fail *in production only*, which is the expensive kind of failure.

1. **`getCommitHash()` shelled out to `git`.** Vercel builds ship with no `.git` directory and no
   git binary, so every provenance record would have carried "commitHash could not be resolved".
   It now reads `VERCEL_GIT_COMMIT_SHA` first. `src/lib/provenance/commit.ts`.

2. **The fixture provider reads JSON off disk with `readdirSync`.** Nothing imports those files,
   so Next's dependency tracer could not see them and the serverless bundle shipped without them
   — ENOENT on the first transcribe. `outputFileTracingIncludes` in `next.config.ts` names them
   explicitly. Verified by grepping the built `.nft.json` trace for all three fixtures.

3. **The transcribe route is the only slow one.** It pulls the whole audio object out of Supabase
   Storage and pushes it to the provider — two large transfers in one request. It declares
   `maxDuration = 60`, which is the Hobby ceiling and is accepted on every plan. If a real lecture
   times out, raise it to 300 on Pro. A timeout is recoverable: the lecture stays
   `pending_upload` with its audio already in storage, so submitting again re-runs only the
   transfer.

4. **Nothing keeps in-process state between requests.** The fixture provider encodes which
   fixture a job is in the job id rather than holding a map, so polling resolves on any instance;
   and the real provider's job id comes from Sarvam. This was already true — it is listed so a
   future change does not casually add a module-level cache and break polling across cold starts
   in a way that is invisible locally.
