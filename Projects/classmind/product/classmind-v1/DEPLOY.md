# Deploying ClassMind V1 to Vercel

The app is a standard Next.js 16 App Router project and deploys without a `vercel.json`.
Everything below is a setting, a secret, or a check — there is no build magic to get right.

Four things about this repository will break a naive deploy, and all four are handled in code
already. They are listed at the end under "What was fixed for serverless" so that a future
change does not quietly undo them.

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
vercel link          # answer "no" to "in which directory is your code located?" default only if it offers the wrong path
vercel               # preview deploy
vercel --prod        # production deploy
```

`vercel login` is interactive. In Claude Code, run it yourself with `! vercel login` so the
output lands in the session.

---

## 2. Environment variables

Set these in **Project → Settings → Environment Variables**, for Production *and* Preview.
Copy the values from your local `.env.local` — it is gitignored, so nothing here is in the repo.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Public. Ends up in the browser bundle. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public by design. Every product table has RLS on with zero policies, so this key can read nothing. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Secret. Bypasses RLS entirely.** Never prefix a key with `NEXT_PUBLIC_` by accident — that would publish it to every visitor's browser and hand out full database access. |
| `SARVAM_API_KEY` | for real transcription | Not needed if you deploy in fixture mode. |
| `TRANSCRIPTION_PROVIDER` | no | Leave **unset** for real Sarvam calls. Set to `fixture` to replay captured Lab v0 responses (see below). |

You do **not** need to set `GIT_COMMIT`. Vercel injects `VERCEL_GIT_COMMIT_SHA` and the
provenance module reads it.

No environment variable is read at module scope, so a build will not fail if one is missing —
it will fail at request time instead, with a clear message naming the variable.

### Which transcription provider for the first deploy?

**Deploy with `TRANSCRIPTION_PROVIDER=fixture` first.** It costs nothing, is deterministic, and
proves the whole pipeline works on Vercel before any money is spent. A replayed transcript is not
disguised: every provenance record it writes begins `REPLAYED, NOT TRANSCRIBED`, and the lecture
page renders those limitations in a visible panel.

Then remove the variable and redeploy to go live. Note that **no live Sarvam call has ever been
made from this app** — the first real one will happen on Vercel, so do it deliberately with one
short recording and watch the function logs.

---

## 3. Supabase configuration

**Authentication → URL Configuration:**

- **Site URL:** `https://<your-vercel-domain>`
- **Redirect URLs** — add all of these:
  ```
  https://<your-vercel-domain>/**
  http://localhost:3100/**
  ```
  The wildcards cover `/auth/callback` for Google sign-in and the email-confirmation link. Keep
  the localhost entry so local development keeps working.

Preview deployments get a new URL per commit. If you want OAuth to work on previews, add
`https://*-<your-team-slug>.vercel.app/**` too — or just test auth on production.

**Storage:** nothing to configure. Audio goes browser → Supabase Storage directly through a
signed URL and never passes through a Vercel function, which is what keeps uploads clear of
Vercel's 4.5 MB request body limit. Run `npm run setup:db` once against the project if the
`lectures` bucket does not exist yet.

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

You will also need to fill in the OAuth consent screen. While it is in *Testing* status only
accounts you list as test users can sign in — publish it before a real demo.

**Supabase dashboard** → Authentication → Providers → Google: enable it, paste the Client ID and
Client Secret, save.

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
- [ ] **Turn off `TRANSCRIPTION_PROVIDER=fixture`** unless you intend a replay demo.
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
