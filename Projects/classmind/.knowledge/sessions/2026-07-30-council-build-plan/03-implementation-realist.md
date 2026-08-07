---
seat: Implementation Realist
model: Sonnet
council: 2026-07-30 — ClassMind Lab build plan
verbatim: true
---

> Stored exactly as returned. Not edited, not trimmed. This seat's hour estimates and Windows
> failure modes were accepted in full; its SQLite recommendation was taken over the Build
> Planner's Docker + Postgres. See `README.md`.

---

# Implementation Realist Report — ClassMind Lab, Three-Day Build

## 1. Files read

- `E:\CopyPasteLabs\Projects\classmind\.knowledge\project.md`
- `E:\CopyPasteLabs\Projects\classmind\.knowledge\walkthrough-protocol.md`
- `E:\CopyPasteLabs\Projects\classmind\.knowledge\constitution.md`
- `E:\CopyPasteLabs\Projects\classmind\.knowledge\decisions.md`
- `E:\CopyPasteLabs\Projects\classmind\.knowledge\domain-model.md`
- `E:\CopyPasteLabs\TEAM.md`
- Confirmed via directory listing: zero code exists anywhere under `Projects/classmind`; no `walkthrough/` data folder yet.

One thing has to be said before the estimates, because it changes what "3-day plan" even means: **the team's own frozen decision (2026-07-30, decisions.md) says the disposable Experiment Platform — "ClassMind Lab" — must not be built until the manual walkthrough (zero software, pure annotation) has run and produced its results document.** The brief for this council seat asks me to plan the Lab build for tomorrow morning. I'll answer that question honestly and in full, because the council needs the numbers regardless of sequencing — but I flag this now so it doesn't get lost, and I return to it in Section 8.

---

## 2. Honest hour estimates

Baseline = a competent engineer who has done each of these before, working alone. Multiplier = what I apply for *this* team (three students, first time, AI-assisted, three different Windows laptops, no one to unblock them but each other and an LLM). The multiplier is higher wherever the failure mode is silent (wrong output that looks right) or environment-dependent (varies by laptop), lower wherever it's a well-trodden path with huge Stack Overflow coverage.

| Component | Experienced-eng baseline | Multiplier | This team, real hours | Why this multiplier |
|---|---|---|---|---|
| Python project setup on Windows, all 3 can run it | 0.5h | **5x** | 2.5–4h total (spread across 3 machines) | `py` vs `python` launcher confusion, PowerShell execution-policy blocking venv activation, three machines likely on three different Python minor versions installed at different times for different reasons. Each machine effectively repeats the setup; assume one machine goes fine, two hit at least one blocker each. |
| Audio from NPTEL/YouTube into a local file | 0.25h | **4–6x** | 1–2h first time, 10 min after | `yt-dlp` itself is fine and well-documented, but it silently depends on ffmpeg for merging/re-encoding. Missing ffmpeg is the single most common "worked in the tutorial, doesn't work for me" moment for this exact workflow. |
| Sarvam ASR: account, key, first call, 40-min file | 1h | **4x** | 3–5h | Account/key is quick. The real cost is discovering Sarvam's per-request duration/size limits (Indian ASR vendor docs are thinner than OpenAI's — expect to hit an undocumented cap by trial and error) and writing the chunk-and-stitch logic once you do. Budget an extra pass for this. |
| Whisper locally (faster-whisper), CPU, no GPU: install → first transcript → real 40-min runtime | 1h (excl. runtime) | **3x install, but runtime is what it is** | Install/first transcript: 2–3h. **Runtime on a 40-min lecture: realistically 30–90 min with a `small` model, 1.5–4 hours with `medium`** on a typical student laptop (no GPU, 8–16GB RAM, thermal-throttling likely on a long CPU run) | `faster-whisper` install is usually fine (prebuilt wheels), but wheel availability for very new Python versions on Windows is a real gap — if a machine has Python 3.13, expect a failed `pip install` and a scramble to install 3.11 alongside it. The runtime number is not a typo: this is the step most likely to eat an entire evening if run at the last minute. |
| Hosted LLM: account, key, first reliable structured-output JSON call | 0.5h | **4x** | 2–4h | Getting *a* JSON response is fast. Getting one that reliably parses on Devanagari-containing, code-switched input, every time, without occasional markdown-fence wrapping or a trailing explanation sentence, takes several iterations plus a pydantic-validate-and-retry loop. |
| Postgres via Docker (Windows) vs SQLite vs JSON files | Docker: 1h; SQLite: 0.25h; JSON: 0.1h | Docker: **6–10x**, SQLite: **2x**, JSON: **1.5x** | **Docker: 4–10h, and on at least one of three laptops it may not work at all** (WSL2 needs virtualization enabled in BIOS, admin rights, disk space; college/older laptops fail this routinely). SQLite: 1h. JSON: 15 min. | This is the highest-variance row in the table. Recommend against Docker+Postgres for this specific one-lecture disposable task (see Section 4). |
| Minimal web UI: FastAPI+Jinja+htmx vs static HTML vs spreadsheet | FastAPI: 2h; static HTML: 0.5h; spreadsheet: 0.1h | FastAPI: **3x**, static HTML: **2x**, spreadsheet: **1x** | FastAPI+htmx: 5–7h (three people each need `uvicorn` running, port conflicts, `.env` handling). Static HTML generated once from JSON: 1–1.5h. Spreadsheet (open the JSONL/CSV in Excel/Sheets): 15–30 min. | For inspecting *one* lecture's ~8–20 items, a live server buys nothing. |
| Chunking a 40-min transcript for the LLM + stitching timestamps back | 1.5h | **3x** | 4–5h | Two traps specifically: (a) a 40-min transcript is only ~6–8k words — it likely fits in one hosted-LLM call without chunking at all, so budget time to *realize this* rather than build unneeded infrastructure; (b) if chunked anyway (for cost or per-utterance grounding), timestamp offsets must be added back per chunk or every stitched item after chunk 1 has a wrong absolute time — this is a quiet, hard-to-notice bug. |

**Rough total for a working, if rough, end-to-end pipeline: 25–40 hours of actual focused work**, not counting the manual annotation itself. Spread over three people that's 8–14 hours each — genuinely a "long weekend," not "tomorrow evening," if everything goes reasonably well. It will not all go reasonably well.

---

## 3. Where it actually breaks — ranked by expected pain

1. **Devanagari / encoding on Windows.** *Very likely, silent.* PowerShell's default console codepage is not UTF-8; `print()`ing Hindi text can come out as `?????` or mojibake without raising an error. Writing CSV via the stdlib `csv` module without `encoding='utf-8-sig'` corrupts the file quietly — it opens "fine" in Notepad, garbled in Excel, garbled again if re-read by a different script's default encoding. This is the one most likely to burn hours because **nothing crashes** — you just get wrong data that looks plausible until someone actually reads it. Cheapest fix: set `PYTHONUTF8=1` env var, always pass `encoding="utf-8"` explicitly on every `open()`, and set `chcp 65001` before running anything in PowerShell. Do this on day 1, not when it's discovered.

2. **ffmpeg not on PATH.** *High likelihood, first-run only.* `yt-dlp` and `faster-whisper`'s audio decoding both shell out to ffmpeg. Error looks like `WinError 2: The system cannot find the file specified` or a `yt-dlp` postprocessing failure with no useful hint that ffmpeg is the cause. Fix: `winget install ffmpeg` (or manual zip + PATH edit) on all three machines on day 1, verify with `ffmpeg -version` in a fresh terminal before doing anything else.

3. **Docker Desktop / WSL2 on at least one of three laptops fails outright.** *Moderate-high likelihood.* Needs virtualization enabled in BIOS, admin rights, and disk space; college laptops and budget machines routinely fail one of these. Error is often an opaque WSL kernel update prompt or a "Docker Desktop failed to start" with no actionable message. Cheapest fix: don't require Docker for this task at all — use SQLite (Section 4).

4. **Python version drift across three machines.** *Likely.* `faster-whisper`'s dependency chain (`ctranslate2`) doesn't always ship prebuilt Windows wheels for the newest Python within days of release; whoever has the newest Python gets a build-from-source failure that looks like a wall of C++ compiler errors. Fix: standardize on Python 3.11 across all three machines on day 1, write it in the README, don't debate it.

5. **LLM returns malformed or non-JSON output.** *Very likely on first attempts.* Manifests as JSON wrapped in a markdown code fence, a trailing sentence after valid JSON, or a subtly invalid escape inside a Devanagari string. Cheapest fix: use the provider's native structured-output/JSON-mode feature rather than prompting "return JSON," validate with pydantic, and retry once on parse failure before failing loudly (never silently drop the row).

6. **Devanagari embedded in JSON string values.** *Moderate.* Some models will transliterate Hindi to Roman script instead of preserving Devanagari when asked for structured output, especially under aggressive prompting for "clean" text. This isn't a crash — it's a content-fidelity bug that violates Article IV's "verbatim" citation kind if unnoticed. Fix: spot-check 3–5 outputs by eye before trusting the pipeline, and make the prompt explicit that the deliverable text must be preserved verbatim, script included.

7. **Long-audio API limits (Sarvam).** *Moderate, but exact numbers unknown until tested — flagged in the hour estimate above.* Whatever the limit turns out to be, hitting it looks like a plain HTTP 4xx with a terse message. Cheapest avoidance: chunk into ~5–10 minute segments from the start rather than discovering the limit against the full 40-minute file at 11pm.

8. **Timestamp drift across chunks.** *Moderate, silent.* If chunk-local timestamps aren't offset by the chunk's start time before stitching, every citation after chunk 1 points at the wrong moment in the recording — and it will look fine in isolation, only breaking when someone clicks a citation and the audio is 6 minutes off. Cheapest fix: always store and add the absolute chunk-start offset immediately upon chunking, never carry chunk-relative time downstream.

9. **A 40-minute CPU Whisper run blocks a laptop for over an hour.** *Certain if used, not a bug but a scheduling problem.* Whoever runs it can't use that machine meaningfully for the duration; running it at 11pm before a review guarantees someone is staring at a progress bar instead of working. Cheapest fix: kick it off first thing in a session, in the background, and go do something else (annotation, prompt drafting) while it runs — or skip local Whisper for the full file entirely and rely on Sarvam for the actual 40-minute run, keeping Whisper only as the documented fallback.

10. **Git single-writer friction.** *Certain, low pain per instance but constant.* Two people wanting to touch the same pipeline file at the same time literally cannot, by team rule — it has to go through Shyam. This isn't a bug, it's a designed bottleneck (TEAM.md §0), but it will feel like friction on day 1 specifically when everyone is excited and wants to type code simultaneously. Addressed in Section 7.

---

## 4. The 3-day plan

**Day 1 — Plumbing, not pipeline. Definition of done: one correctly-rendered Devanagari transcript exists on all three machines, produced the same way.**

- Morning: all three machines — install Python 3.11, ffmpeg, git config, set `PYTHONUTF8=1`. Verify with a one-line script that prints a Hindi test string and it renders correctly in the terminal and in a UTF-8-opened file.
- Midday: download one real NPTEL lecture (or a short 5–10 min clip of one) with `yt-dlp`.
- Afternoon: get Sarvam ASR working end-to-end on the short clip (not the full 40 minutes yet). In parallel, kick off `faster-whisper` on the same short clip on a second machine as the fallback path, since decisions.md already commits to Sarvam-primary/Whisper-fallback.
- **Observable DoD:** a transcript file (`.json` or `.txt`) from the short clip, with correct Devanagari, openable by all three people, from both ASR paths.
- **What will slip:** at least one machine will hit either the ffmpeg-PATH or Python-wheel problem. Budget the whole day for this, not half of it.

**Day 2 — Full pipeline on the real file. Definition of done: one command produces a JSONL of extracted Observations for the entire 40-minute lecture, from a fresh transcript.**

- Morning: run the *full* 40-minute file through Sarvam (chunked if the duration limit forces it); kick off the CPU Whisper run in parallel on a separate machine as a comparison/fallback, accepting it may still be running at lunch.
- Midday: build the chunk-and-stitch logic if chunking turns out to be necessary (test first whether the whole transcript fits one LLM call — it probably does at ~6–8k words).
- Afternoon: LLM structured-output extraction with pydantic validation, storing results in SQLite (not Docker/Postgres — see Section 4 table below) with the fields the domain model and the 17-column template already specify (verbatim, unit type, due phrase, timestamp, etc.).
- **Observable DoD:** running one documented command against the stored transcript produces a JSONL file with one row per extracted item, timestamps intact, Devanagari intact, spot-checked by eye for at least 5 items.
- **What will slip:** the "one command, no manual steps" bar. Expect the first working version to require 2–3 manual interventions; getting it to a single clean command is itself an hour or two of cleanup that's easy to skip under time pressure — don't skip it, it's the testability requirement (Section 6).

**Day 3 — Inspection and reproducibility. Definition of done: someone who didn't write the pipeline can reproduce the exact same output from a fresh checkout with one command, and view it.**

- Morning: generate a static HTML page (or, more realistically, just open the JSONL/CSV in a spreadsheet) so the team can actually read the output together rather than staring at raw JSON.
- Midday: team review of the extracted items — this is where you'll actually see whether the ASR-to-LLM pipeline produces anything sane on real code-switched speech, which is the whole point.
- Afternoon: write the README with the exact reproduction command, the manifest fields (model id + snapshot, prompt version, code commit), and hand a second machine the task of running it cold.
- **Observable DoD:** a teammate who was not at the keyboard for the pipeline build runs one command on their own machine and gets byte-identical (or acceptably close, given LLM non-determinism — record temperature/seed) output.
- **What will slip:** the "second person reproduces it cold" step reliably surfaces at least one machine-specific assumption (a hardcoded path, a missing env var) that the original builder didn't notice. That's fine — that's the point of doing it, and it's cheaper to find on day 3 than to discover it's never been reproducible at all.

**Realistic overall expectation:** by end of day 3, you have a working, once-reproducible pipeline on one real lecture, with visible rough edges in the extraction quality and probably a UI that's "a spreadsheet" rather than a webpage. That is a legitimate, honest outcome for this team in three days. A polished FastAPI review screen is not.

---

## 5. Build vs. buy vs. skip

| Capability | Verdict | Notes |
|---|---|---|
| Audio download | **Buy (use `yt-dlp`)** | Do not write a downloader. Well-trodden, huge community coverage for exactly this failure surface. |
| Transcription | **Buy (Sarvam API, faster-whisper as fallback)** | Already decided in decisions.md. Neither is "build" — both are integration work, not model-building. |
| LLM structured output | **Buy the model, write a thin wrapper (~30–50 lines)** | Use the provider's native JSON/structured-output mode directly. Do **not** reach for LangChain or similar orchestration frameworks — for a team at this experience level they add a debugging surface (silent prompt templating, version churn) that outweighs the convenience. A raw API call + pydantic model + manual retry is more debuggable and is the "concrete thing" Article VI would tell you to write, since there's no named second LLM-orchestration-framework requirement. |
| Storage | **Write it (SQLite), skip Docker/Postgres for this task** | This is the disposable, single-lecture Lab, not the Product Platform. Postgres+pgvector is the right *eventual* Product Platform decision (already made, correctly, in decisions.md) — but pgvector/semantic search has no job to do over ~8–20 items from one lecture, and Docker on Windows is the single highest-variance failure point in the whole plan (Section 2/3). SQLite is in the Python standard library, needs zero install, and is trivially droppable/rebuildable per Article II. Revisit Postgres when there's actually a volume of lectures that needs it. |
| Inspection UI | **Build minimal (static HTML from a template), skip FastAPI+htmx for now** | A live server buys nothing for one lecture's worth of data and adds three more moving parts (uvicorn, ports, `.env`) across three machines. A spreadsheet is even cheaper and arguably better for eyeballing 8–20 rows with hesitation/notes columns. |
| Scoring / agreement computation | **Skip for the Lab; this belongs to the manual walkthrough, not the pipeline** | Boundary/label agreement (≥80% span overlap, agreement-on-agreed-boundaries) is ~30–50 lines of plain Python if and when it's needed for comparing Observers. Don't build it speculatively; it has no job until there are two independent annotation sets to compare, which for the walkthrough happens on paper/spreadsheet, not in this codebase. |
| Experiment tracking | **Write it minimally, explicitly skip MLflow/W&B** | The Constitution forbids both by name (Article VII). "Tracking" here means: one JSONL file per run, one manifest.json per run capturing model id+snapshot, prompt version, code commit, timestamp — see Section 6. This is a directory convention, not a tool. |

---

## 6. Testability minimum (Article VII, no CI, no heavyweight tooling)

The team has never set up CI and shouldn't try to for this. The minimum that actually satisfies "every reported number is regenerable by one command" is a **file layout convention plus one script**, nothing more:

```
classmind-lab/
  data/
    raw/                          # audio files — gitignored (too large/sensitive for git); tracked by a checksum manifest instead
      manifest.json                # {filename, sha256, source_url, duration}
    transcripts/
      lecture1_sarvam_v1.json      # never overwritten — new engine/version = new file
      lecture1_whisper_v1.json
    runs/
      2026-08-01_1420/
        manifest.json              # model id+snapshot, prompt version, transcript file used, code commit, timestamp
        predictions.jsonl          # one row per Observation, raw and untouched
  prompts/
    extract_v1.txt                 # versioned by filename; a prompt is never edited in place, only superseded
  src/
    download_audio.py
    transcribe.py
    extract.py
    run_pipeline.py                # the one command
  README.md                        # the exact commands, copy-pasteable, tested by a second person
```

The one command:

```
python src/run_pipeline.py --lecture data/raw/lecture1.mp3 --engine sarvam --prompt prompts/extract_v1.txt --out data/runs/<timestamp>
```

which must, without asking, write `manifest.json` (including `git rev-parse HEAD` captured automatically, not typed by hand) and `predictions.jsonl` into a fresh run folder.

Four rules of discipline, no tooling required:

1. **Never hand-edit `predictions.jsonl`.** If a run is wrong, fix the code or prompt and rerun into a new folder. Old runs are never deleted, only superseded — this is Article VII in miniature.
2. **Never edit a prompt file in place.** New behavior = new filename (`extract_v2.txt`), because a reported number's prompt version must still resolve to exact prompt text a year later.
3. **No notebooks for a number anyone will cite.** Notebooks are fine for exploring; the number that goes in the results document must come from `run_pipeline.py` run non-interactively, so it's rerunnable by someone who wasn't in the room.
4. **On Windows, skip Makefiles** (they require installing `make` separately and are a needless extra dependency) — put the exact command in the README as copy-pasteable text, or use a trivial `run.py`/`run.ps1` wrapper. The goal is "one command any of the three of you can paste," not build-system sophistication.

This costs roughly an extra hour on day 2 over just hacking something together, and it's the difference between a result the team can actually defend later and one that quietly can't be regenerated by the time it matters.

---

## 7. Parallelisation

Single-writer git means only Shyam's machine commits and pushes. That constrains *code*, not everything else.

**What can genuinely run in parallel, no stepping on anyone:**
- Shyam builds/debugs the pipeline code, since he's the only one who can push it anyway.
- Shiv and Darsh can, at the same time, do everything that doesn't require repo write access: select and quality-check the lecture audio, draft and test LLM prompts against a scratch copy of the transcript in a hosted playground (ChatGPT/Claude web UI, or Sarvam's own console) with results handed over as a text file rather than a commit, and — most valuably — **the manual, independent annotation the frozen walkthrough protocol already requires two people to do**, in a shared spreadsheet, using the 17-column template. This needs zero software and zero repo access, so it is literally the one task built to run alongside code work without any coordination cost.
- Because Shyam will spend real chunks of day 1–2 waiting on installs, a long ASR run, or a CPU Whisper run that's blocking his machine for an hour-plus, that dead time is exactly when Shiv and Darsh's independent annotation pass should be happening — it converts otherwise-wasted parallel time into the highest-value activity in the entire project, since (per decisions.md) that annotation is supposed to gate everything else anyway.

**What must be serial:**
- Any change to shared pipeline code or schema goes through Shyam. Proposals arrive as GitHub Issues, get implemented on his machine, and the issue closes with a reference — this has real latency (hours, possibly a day), which will feel slow on day 1 when three people are enthusiastic and want to type simultaneously. Plan for it rather than fighting it: Shiv and Darsh should have their own non-code task queued up (see above) rather than waiting on Shyam to unblock them.
- The walkthrough's step 5 ("write the two-page annotation guide, together") and step 9 ("reconcile disagreements, both") are explicitly the only points where the two annotators are supposed to talk to each other before then — this is itself a serial checkpoint baked into the frozen protocol, not something this plan should route around even under time pressure.

---

## 8. The single biggest practical risk, and confidence

**Not technical — sequencing.** The team's own frozen decision from yesterday (2026-07-30, decisions.md, "Separate the Experiment Platform from the Product Platform") states explicitly: *"The immediate next step needs no software: the manual walkthrough... Building the Experiment Platform before the manual walkthrough would repeat the mistake this project already made once with BuilderOS: infrastructure built ahead of the thing it exists to serve."* The plan this seat was asked to produce — build ClassMind Lab tomorrow, this week — is exactly the sequence that decision was written to prevent.

The practical consequence isn't abstract: the walkthrough's pre-registered predictions (P6, P7) explicitly anticipate discovering a fourth Ledger-item type (policy/condition statements like "late submissions won't be accepted") and possibly finding Guidance collapses into Notice. If either happens, the JSON schema, the extraction prompt's category list, and the storage fields this three-day plan builds all need to change afterward. Article 0 says code is cheap and rewriting is fine in principle — but for a team already spending 25–40 hours just getting Devanagari, ffmpeg, and a Docker-free storage layer to work reliably, redoing that work because the taxonomy shifted underneath it is real, avoidable cost, not a healthy iteration.

**Confidence: high** that this is the biggest risk — it's not a guess, it's stated in the team's own frozen decision record, dated yesterday, by the same three people. The technical risks in Section 3 (Devanagari encoding chief among them) are real and will cost hours, but they're all recoverable within a day. The sequencing risk is the one that costs a redo of the *understanding*, not just the code.

Practical recommendation, stated plainly since it's what an implementation realist is for: if there is any way to run the four-lecture manual walkthrough (one day, per its own stopping rule, zero software) before or in parallel with the first day of Lab-building rather than after it, do that. If the three-day window is fixed and can't accommodate both, build the Lab knowing explicitly that its schema and prompt categories are provisional and likely to be revised once the walkthrough's results exist — and say so in the README, so nobody mistakes day-3's output for validated output.
