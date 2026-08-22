# ClassMind — Project Logbook

**Project:** ClassMind / Ambient Academic Intelligence
**Duration:** 5 weeks

**What the project does:** Records a college lecture as audio, converts it to a timestamped
transcript using AI speech recognition, and stores it so that structured academic information
(assignments, deadlines, exam topics, announcements) can later be extracted from it. It is built
for Indian classrooms, where teachers mix Hindi and English in the same sentence.

---

## Week 1 — Problem Definition and Research

**Goal:** Confirm the problem is real and find out what already exists.

- Identified the problem: assignments, deadlines and exam topics are announced verbally during
  lectures and are regularly missed or written down incorrectly by students.
- Studied existing solutions — lecture recording platforms, AI transcription tools, and Indian
  ed-tech apps. All of them record and transcribe, but none extract structured academic
  information from what was said.
- Identified the specific difficulty in Indian classrooms: teachers code-switch between Hindi and
  English mid-sentence, which normal speech recognition handles poorly.
- Decided to capture **audio only, not video**, because video adds large storage and processing
  cost without helping extract spoken information.
- Selected **Sarvam AI (Saaras v3)** as the speech recognition service, because it supports Indian
  languages and code-switched speech.
- Wrote the project synopsis and a competitive analysis.

**Result:** A clearly defined problem, a chosen approach, and a chosen speech recognition service.

---

## Week 2 — Project Planning and System Design

**Goal:** Turn the idea into a properly planned project before writing code.

- Set up the project repository and a working method for the team.
- Wrote the project scope, requirements and roadmap.
- Defined the **domain model** — the standard vocabulary for the system, so that every part of the
  project uses the same words for the same things.
- Wrote a set of engineering principles for the project to follow.
- Recorded all major technical decisions along with the alternatives that were considered and
  rejected, so the reasoning is not lost.
- Held two design review sessions and changed parts of the plan based on what they found.
- Decided on a **two-system approach**: first build a small experiment system to test whether the
  idea works, and build the actual product only after that is proven.

**Result:** A documented plan, a fixed vocabulary, and recorded reasons for every major decision.

---

## Week 3 — Database, Storage and Upload Pipeline

**Goal:** Build the base system that can accept a lecture audio file.

- Organised the project into three parts: documentation, the experiment system, and the future
  product.
- Built the web application skeleton using Next.js and TypeScript, with safe configuration
  handling and separate database clients for browser and server.
- Designed and created the **`runs` database table**, which tracks each lecture through every
  stage of processing — upload, transcription, result and errors.
- Enabled row-level security on the table with a deny-by-default setup, so only the server can
  read or write it.
- Wrote a setup script that creates the private audio storage bucket with file type and size
  limits.
- Built the **upload API**: it checks the file type and size, creates the database record, and
  gives the browser a temporary signed URL to upload directly to storage.
- Designed the upload so that **audio never passes through the application server** — the browser
  sends it straight to storage, which keeps the server light.
- Designed each lecture as a long-running job rather than a single request, because Sarvam's
  transcription API works asynchronously and can take time to finish.
- Found and fixed a configuration bug that was hiding the example settings file from the
  repository.

**Result:** A working application that can receive and store a lecture audio file.

---

## Week 4 — Documentation Review and Correction

**Goal:** Make sure the written documents actually match the software that had been built.

- Reviewed every project document against the code.
- Found that one document gave an incorrect reason for why the experiment system was being built,
  and corrected it with the honest reason.
- Found a project rule that had been written down quoting the wrong source, and removed it.
- Recovered four technical decisions that had only been recorded inside commit messages and code
  comments, and wrote them properly into the decisions document.

**Result:** Documentation that matches the actual system, with no incorrect claims left in it.

---

## Week 5 — Transcription, User Interface and Testing

**Goal:** Connect the real transcription service, get a real lecture through the system, and test it.

**Transcription**
- Built a transcription interface layer so the speech recognition service can be replaced later
  without rewriting the rest of the system.
- Built the Sarvam adapter, handling the full process: start job → upload audio → begin
  transcription → check status repeatedly → download the result.
- Built the API routes that start a transcription and check its progress.
- Built **provenance recording** — every transcript stores which model, settings and code version
  produced it, saved in the same database write as the transcript itself so it can never be
  missing.
- Completed the **first successful transcription** of a real Hindi/English physics lecture:
  114 timed segments and roughly 85,000 characters of text.

**Fixes**
- Found and fixed a database permissions problem that was blocking every operation in the system.
- Fixed a rendering bug in the interface that caused repeated unnecessary updates.

**User interface**
- Built the upload screen with live upload progress.
- Built a **Lecture Library** that lists all previously processed lectures and allows any of them
  to be opened again.
- Built the transcript viewer, which shows the lecture as readable text with `[mm:ss]` time
  markers so any sentence can be traced back to the moment it was spoken.
- Added a **download button** that saves the transcript as a text file.
- Designed the transcript formatting to happen when the page is opened rather than being saved,
  so the original response from the service always remains the source of truth.

**Testing**
- Verified the code passes linting, type checking and a production build.
- Confirmed the first lecture's stored data was not changed by any of the new work.
- Confirmed the database permissions were correct and that public access was still blocked.
- Tested the system on a second, different lecture — an English lecture on the FFT algorithm.

**Problem found during testing**
- The English lecture was transcribed into the **wrong language**. The speech recognition service
  had low confidence in detecting the language and converted the English speech as though it were
  a different Indian-script language. The transcript was unusable.
- This does not happen every time — another English lecture worked correctly — so the fault
  depends on how confident the service is about the language, and it fails silently without
  showing an error.
- This is currently an open issue and is the next thing to fix.

**Result:** A working system that takes a lecture from upload to a stored, viewable, downloadable
transcript — plus a real problem discovered by testing it on new material.

---

## Where the Project Stands

**Working**
- Upload a lecture audio file from the browser
- Store it securely in cloud storage
- Transcribe it using Sarvam AI
- Save the transcript with full details of how it was produced
- View the transcript with time markers
- Download the transcript
- Browse and reopen all past lectures

**Open issues**
- The transcription sometimes converts speech into the wrong language, and does so without
  reporting an error. This needs to be fixed by telling the service which language to expect
  instead of letting it guess.
- Some abandoned upload attempts leave unused records in the database. Cause not yet identified.

**Not built yet — planned for the next phase**
- Automatic extraction of assignments, deadlines and exam topics from the transcript
- Uploading the teacher's PPT for additional context
- Teacher confirmation of extracted information
- Student question answering over stored lectures
- User accounts and support for multiple courses

**Next steps**
1. Fix the language detection problem.
2. Investigate the unused database records.
3. Begin the extraction stage, which converts the transcript into structured academic information.
