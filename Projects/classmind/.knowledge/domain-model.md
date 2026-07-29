---
status: Draft
created: 2026-07-29
updated: 2026-07-29
---

# The ClassMind Domain Model

**This document defines the language of ClassMind.** Every person and every AI agent working
on this product uses these words with these meanings and no others. When code, a screen, a
conversation, or a paper uses a word from the glossary in Part 7, it means what Part 7 says
it means.

No tables, no schemas, no APIs, no classes. This describes what exists in the world, not what
exists in a computer.

Governed by [constitution.md](constitution.md). Where this document and the synopsis in
`research/` disagree, this document wins — the synopsis is frozen history.

---

## The one idea everything else follows from

There are two layers in this domain and confusing them is the source of nearly every problem
in the earlier documents:

> **What was said** happened at a moment, cannot be un-said, and never changes.
> **What is true now** is a conclusion, changes constantly, and is always derived.

A lecturer said "assignment 3 is due Friday" on 12 November. Three weeks later she said "I'm
extending it to Monday." Both are permanently true as *utterances*. Neither is the deadline.
The deadline is a **conclusion** you reach by reading both in order, and it changes without
either utterance changing.

Every concept below sits in exactly one of three layers:

| Layer | Nature | Examples |
|---|---|---|
| **The Record** | What happened. Immutable. Append-only. | Recording, Utterance, Observation, Attestation |
| **The Ledger** | What is currently true. Derived by reading the Record in order. | Commitment, Notice, Guidance |
| **The Frame** | The world the other two happen inside. Mostly not ours. | Institution, Person, Course Offering, Term |

The product's entire value is the moment a Record entry becomes a Ledger entry — see Part 5.

---

# PART 1 — Concept Inventory

## What we keep, rename, split, merge, and kill

| Proposed concept | Verdict | Reasoning |
|---|---|---|
| Institution | **Keep** | Real, and the tenancy boundary. Needs a hierarchy — see Part 2. |
| Faculty | **Demote to a role** | Not an entity. A *Person* holding an *Appointment* on a Course Offering. A PhD student who teaches one course and takes another is both, simultaneously, and a model with two entity types cannot represent her. |
| Student | **Demote to a role** | Same reasoning — a Person holding an *Enrolment*. |
| Course | **Split into two** | "Course" means both the catalogue entry (CS301 Databases) and the thing that actually happens (CS301, Autumn 2026, Prof. Rao, Section B). Only the second one has lectures. See **Course Offering**. |
| Semester | **Rename → Term** | "Semester" presumes a two-term year. Indian institutions run semesters, trimesters, and annual systems. *Term* is neutral. |
| Lecture | **Rename → Session** | "Lecture" means three different things: the scheduled slot, the meeting that occurred, and the recording of it. Only the meeting that *occurred* matters to us. A cancelled class has a slot and no Session. |
| Recording | **Keep** | Raw. Note a Session may have zero, one, or several. |
| Transcript | **Keep, but it is versioned and produced by a named act** | One audio can be transcribed many times by different engines. "The transcript" does not exist; a *Transcription* produces a *Transcript*. |
| Slide Deck | **Generalise → Course Material** | Slides, PDFs, handouts, question papers. All play the same role: supporting evidence and context. |
| Observation | **Keep — promote to central** | The single most important concept. See Part 2. |
| Commitment | **Keep — promote to central** | The other central concept. |
| Academic Event | **KILL** | Too broad, and actively harmful. It collapses four unrelated kinds of thing. See Part 8, Challenge 1. |
| Assignment / Quiz / Exam | **Merge → kinds of Commitment** | These differ in weight and ceremony, not in nature. All three are "something is required of you by a time." |
| Announcement | **Rename → Notice** | Clearer, and distinguishes it from a Commitment. |
| Deadline | **KILL as an entity** | A deadline is a *property* of a Commitment, not a sibling of one. Treating it as a peer of Assignment is the specific category error that made cross-lecture tracking look unsolvable. See Part 8, Challenge 2. |
| AI Extraction | **Rename → Extraction Pass**, and add **Observer** | The pass is the act; the Observer is who or what did the observing. We need the Observer as a first-class idea because three different Observers will read the same Utterance and disagree — that disagreement is the research contribution. |
| Faculty Review | **Rename the artefact → Attestation** | "Review" is an activity. The durable thing the activity produces is an Attestation. |
| Attestation | **Keep — promote to central** | Third of the three central concepts. |
| Evidence | **Keep as a role, not an entity** | Evidence is what an Utterance *is* when something cites it. No separate thing exists. |
| Citation | **Keep as a relationship** | The bond between a Ledger item and the Evidence behind it. |
| Knowledge | **KILL** | Not an entity. You cannot point at it, own it, or change it. What actually exists is the **Course Ledger**. See Part 8, Challenge 3. |
| Question | **Rename → Enquiry** | "Question" collides with exam questions, which are a different thing entirely. |
| Answer | **Rename → Response** | Same collision reason. |
| Conversation | **Keep** | A sequence of Enquiries and Responses by one Person. |
| Evaluation Dataset | **Rename → Benchmark**, add **Gold Annotation** | And keep it rigidly apart from Attestation — Constitution Article VIII. |

## Concepts nobody listed that must exist

| New concept | Why it is unavoidable |
|---|---|
| **Person** | Because Faculty and Student are roles, something must hold identity across them. |
| **Appointment** / **Enrolment** | The relationships that grant a Person a role in a Course Offering. |
| **Consent Grant** | Article I makes consent a precondition for every artefact's existence. A precondition that is not a concept cannot be enforced. |
| **Authority** | Answers "who is allowed to attest to this?" Without it, that question has no domain answer, only an access-control answer — which is the wrong layer. |
| **Observer** | The producer of an Observation. Required for the three-arm comparison and for Article IV provenance. |
| **Utterance** | The bounded span of speech an Observation is about. Without it, Observations point at nothing citable. |
| **Course Ledger** | The current attested state. This is the thing students actually read, and it had no name. |
| **Revision** | One change to the Ledger, caused by one Attestation. This is what makes "the deadline moved" expressible. |
| **Scope** | What an exam or assignment covers. Absorbs "exam topic," which was wrongly modelled as a peer of Assignment. |
| **Academic Calendar** | "Next Thursday," "after the mid-terms," and "before the break" cannot be resolved without it. |
| **Gold Annotation** | The research instrument, structurally separate from Attestation. |
| **Benchmark** | A frozen, versioned set of Gold Annotations. |

---

# PART 2 — Concept Definitions

Written as business definitions. Each states: what it is, why it exists, who creates it, who
owns it, whether it changes, its layer (raw / derived / authored), its lifecycle, and its
dependencies.

---

## THE FRAME — the world we operate inside

### Institution

**What:** An organisation that teaches — a college, or a university, or a department within
one. Institutions nest: an affiliating university may have two hundred member colleges, each
with departments.

**Why it exists:** It is the unit that decides to use ClassMind, signs the agreement, owns the
academic content, and constitutes the boundary across which no data may ever leak.

**Who creates it:** ClassMind staff, during onboarding. **Who owns it:** itself.

**Can it change:** Rarely — a name, a hierarchy position. **Layer:** Authored.

**Lifecycle:** Prospect → Active → Suspended → Departed. *Departed is the important one:* a
departing Institution takes its data with it, which is why nothing may be designed on the
assumption that data stays forever.

**Depends on:** nothing. **Depended on by:** everything. Every single concept in this document
is scoped to an Institution.

---

### Person

**What:** A human being known to the system. Not a "user" — a Person may exist in the record
because they were recorded, without ever logging in.

**Why it exists:** Because Faculty and Student are roles a Person holds, not species a Person
belongs to. The same Person teaches one course and takes another. The same Person is a
student this year and a teaching assistant the next.

**Who creates it:** The Institution, by providing a roster; or ClassMind, on invitation.
**Who owns it:** The Person owns their identity. The Institution owns the affiliation.

**Can it change:** Names change, roles change constantly. **Layer:** Authored.

**Lifecycle:** Known → Active → Departed → Erased. *Erased* is required by Article I and is
genuinely destructive — it is the one place in this domain where the Record is not permanent.

**Depends on:** Institution. **Depended on by:** Appointment, Enrolment, Attestation, Consent
Grant, Enquiry, Utterance (as speaker).

---

### Course

**What:** A catalogue entry. "CS301 — Database Systems, 4 credits."

**Why it exists:** So that two offerings of the same subject in different terms can be
recognised as related. This is the only reason it exists, and it is a weak reason for the
capstone — but it costs nothing to name now and is awkward to introduce later.

**Who creates it / owns it:** The Institution. **ClassMind is never the source of truth for
the course catalogue.** See Part 8, Challenge 6.

**Can it change:** Slowly. **Layer:** Authored, and *externally* authored.

**Depends on:** Institution. **Depended on by:** Course Offering.

---

### Course Offering

**What:** One actual run of a course: a Course, in a Term, taught by particular people, to a
particular group. "CS301, Autumn 2026, Prof. Rao, Section B."

**Why it exists:** This is where teaching actually happens. Sessions belong to it, Commitments
belong to it, students enrol in it. It is the **primary working unit of the whole product** —
almost every question a student asks is scoped to one Offering.

**Who creates it:** The Institution. **Who owns it:** The Institution; the teaching Faculty
hold Authority within it.

**Can it change:** Staff and enrolment change during a term. **Layer:** Authored (external).

**Lifecycle:** Planned → Running → Concluded → Archived. Note that Commitments have no meaning
outside a running or recently concluded Offering, but the Record outlives it indefinitely.

**Depends on:** Course, Term, Institution, Person. **Depended on by:** Session, Course Ledger,
Enrolment, Appointment, Course Material.

---

### Term

**What:** A named span of the academic year with a start, an end, and known breaks.

**Why it exists:** Two reasons, both load-bearing. It bounds an Offering. And it is half of
what makes "submit by next Thursday" resolvable into a date.

**Who creates it / owns it:** The Institution. **Layer:** Authored (external).

**Depends on:** Institution. **Depended on by:** Course Offering, Academic Calendar.

---

### Academic Calendar

**What:** The institution's dated skeleton — term boundaries, holidays, examination windows,
breaks, and the weekly timetable of when each Offering meets.

**Why it exists:** Because lecturers speak in relative time almost exclusively. "Next
Thursday," "after the mid-terms," "before the break," "in the last class." None of these can
be resolved without the calendar, and resolving them is a stated requirement.

**Who creates it / owns it:** The Institution. **Layer:** Authored (external).

**Can it change:** Yes, and **this is a subtle trap.** If a holiday is declared after an
utterance was resolved, "next Thursday" may now mean a different date than it did when it was
spoken. This is why the spoken phrase must be kept alongside the resolved date — Article IV.

**Depends on:** Term, Institution. **Depended on by:** every date resolution.

---

### Appointment / Enrolment

**What:** The two ways a Person is attached to a Course Offering. An **Appointment** is a
teaching relationship (lecturer, co-lecturer, teaching assistant). An **Enrolment** is a
learning relationship.

**Why they exist:** They are the source of Authority and the source of visibility. Who may
attest, and who may read the Ledger, both follow from these and from nothing else.

**Who creates them / owns them:** The Institution. **Layer:** Authored (external).

**Lifecycle:** Both are time-bounded and both change mid-term. A student who drops out in week
six should not see week ten's Commitments; a lecturer who hands over a course stops having
Authority on the handover date, but their past Attestations remain valid, because they were
validly made at the time.

**Depends on:** Person, Course Offering. **Depended on by:** Authority, visibility.

---

### Consent Grant

**What:** A recorded permission from a Person, for a stated purpose, over a stated scope, for
a stated period, revocable.

**Why it exists:** Because Article I makes it a precondition for the existence of every raw
artefact. A recorded lecture contains the voices of the lecturer *and* of every student who
spoke — all of them are subjects, not just the lecturer.

**Who creates it:** The Person granting it. **Who owns it:** The Person, permanently — this is
the only concept in the domain whose owner can unilaterally destroy it.

**Can it change:** It can be **revoked**, never edited. A revocation is a new fact, not a
change to the old one.

**Layer:** Authored, and it is the root of the Record — nothing raw may exist without one.

**Lifecycle:** Requested → Granted → *(Expired | Revoked)* → Erasure executed.

**Depends on:** Person, and a stated Purpose. **Depended on by:** Recording, Utterance, and
transitively everything derived from them.

**The hard consequence:** revocation forces erasure of derived material too. This is the one
force in the domain that runs *backwards* against the general rule that the Record is
permanent, and the tension is resolved in favour of the Person, always.

---

## THE RECORD — what happened, permanently

### Session

**What:** A class meeting that actually took place. Not a scheduled slot — an event that
occurred.

**Why it exists:** It is the unit lecturers and students both think in ("last Tuesday's
class"), and it is what a Recording is a recording *of*.

**Who creates it:** The Institution's timetable proposes it; the act of recording confirms it
occurred.

**Who owns it:** The Course Offering.

**Can it change:** Its metadata can be corrected (wrong date, wrong lecturer). The fact that it
occurred cannot. **Layer:** Authored.

**Lifecycle:** Occurred → Captured → Transcribed → Observed → Reviewed → Settled. A Session
that nobody recorded is still a Session; it simply produces no Record.

**Depends on:** Course Offering, Person (who taught). **Depended on by:** Recording, and
through it everything.

---

### Recording

**What:** A captured audio artefact of some or all of a Session.

**Why it exists:** It is the only irreplaceable input. Everything else in the Record can be
recomputed from it; it can be recomputed from nothing.

**Who creates it:** A Person who starts a capture. **Who owns it:** The Institution, subject to
every Consent Grant it touches.

**Can it change:** **Never.** It is the definition of raw. **Layer:** Raw.

**Lifecycle:** Captured → Stored → *(Retained | Erased)*. It has **its own retention clock,
independent of everything else** — it is the largest, most expensive and most legally exposed
artefact in the system, and it will often be deleted while everything derived from it lives on.

**A consequence that must be stated explicitly:** when a Recording is erased, its Transcript
stops being derived and becomes authoritative *by succession* — it is now the earliest
surviving account of what was said. This transition must be deliberate and visible, not
silent, because it changes what a citation actually proves.

**Depends on:** Session, Consent Grant. **Depended on by:** Transcription, Utterance, Evidence.

---

### Transcription

**What:** One act of converting a Recording into words, by one named engine, at one time.

**Why it exists as a separate concept from Transcript:** Because "the transcript" is not a
thing. The same hour of audio will be transcribed by different engines, and comparing them is
scheduled work. Two accounts of the same audio must both be able to exist without one
overwriting the other.

**Who creates it:** The system, on request. **Who owns it:** the Session.

**Can it change:** No. A new attempt is a new Transcription. **Layer:** Derived, versioned.

**Lifecycle:** Requested → Completed → *(Current | Superseded)*. Exactly one Transcription per
Recording is marked current at any time; the others remain readable forever.

**Depends on:** Recording, and a named engine. **Depended on by:** Transcript, Utterance.

---

### Transcript

**What:** The words produced by one Transcription — the full text of what was said.

**Why it exists:** It is the readable form of the Recording and the substrate observation
works on.

**Can it change:** **No — and this matters more than it sounds.** The temptation to let faculty
fix a misheard word in place is enormous and must be refused, because the mishearing *is* the
research finding. A correction is a new authored fact attached to the Utterance, never an edit.

**Layer:** Derived. **Depends on:** Transcription. **Depended on by:** Utterance.

---

### Utterance

**What:** A bounded stretch of speech: some words, a speaker, and a time range within the
Recording.

**Why it exists:** It is the unit of **Evidence**. Everything a student is ever shown must be
traceable to one, and "traceable" means a human can listen to those seconds and hear it.

**Who creates it:** Derived from a Transcript. **Layer:** Derived — but it plays an
authoritative role, because it is what citations point at.

**Can it change:** The words cannot. The *interpretation* of them changes constantly, which is
exactly why interpretation lives in Observation and not here.

**The subtle requirement:** a citation must survive re-transcription. If a citation points at a
transcript's internal structure it breaks the moment a better engine runs. So the durable
anchor is **the time range in the Recording**, which is immutable, and the words are the
convenient form. This is not a technical note — it is a statement about what evidence *is*.

**Depends on:** Transcript, Recording. **Depended on by:** Observation, Evidence, Citation.

---

### Observer

**What:** Whoever or whatever produced an Observation — a specific extraction method at a
specific version, or a named Person.

**Why it exists:** Two reasons, both essential. Three Observers reading the same Utterance and
disagreeing *is the research contribution*. And Article IV requires that every claim carry its
producer's identity.

**Who creates it:** The team, by defining a method version. **Layer:** Authored.

**Can it change:** No — a changed method is a new Observer. This is what makes an old
measurement still mean something.

**Depended on by:** Observation, Extraction Pass, Benchmark comparisons.

---

### Extraction Pass

**What:** One run of one Observer over one Transcript.

**Why it exists:** It groups the Observations that were produced together under identical
conditions, which is the unit of measurement for every reported number.

**Can it change:** No. **Layer:** Derived, and permanently recorded.

**Depends on:** Observer, Transcript. **Depended on by:** Observation, every evaluation result.

---

### Observation

**What:** A record that *an Observer, reading a particular Utterance, believes something is
being asserted.* For example: "reading 34:20–34:38 of Session 8, the LLM Observer at version 3
believes a submission is being required, of Chapter 5 analysis, by a time expressed as 'Friday
5 PM', and believes this concerns a commitment already known from Session 5."

**Why it exists — and this is the heart of the model:** it separates *noticing* from *being
true*. An Observation is never wrong; it is a faithful record of what an Observer thought. The
Observer may have been wrong, which is a different statement, and one that Attestation
resolves.

This separation is what makes three things possible at once: comparing Observers (the
research), auditing what the machine said before a human touched it (the trust story), and
keeping a permanent training signal (the corpus).

**Who creates it:** An Observer, during an Extraction Pass. Or a Person directly — a lecturer
who types a commitment in by hand is making an Observation with themselves as Observer.

**Who owns it:** The Session it was observed in.

**Can it change:** **Never.** This is the strongest immutability rule in the domain. When a
human corrects an Observation they do not edit it — they attest against it, and the correction
is a new fact. Article V.

**Layer:** The Record. Immutable, append-only.

**Lifecycle:** Made → *(Unadjudicated | Attested | Denied)*. An Observation nobody ever ruled
on stays unadjudicated forever, and is worth nothing. An adjudicated one is permanent corpus.

**What an Observation carries:** what it thinks is being asserted; how strongly it holds that
belief; which Utterance it read; which Observer made it; and **what it believes the assertion
is about** — either a Commitment already known, or a new one. That last part is the hardest
judgement in the whole product and it belongs here, in the Observation, as a *belief* — not as
a fact.

**Depends on:** Utterance, Observer, Extraction Pass. **Depended on by:** Attestation, and
through it the entire Ledger.

---

### Authority

**What:** The standing of a particular Person to rule on a particular matter. It is not
permission to use software; it is the domain fact that this person's word settles the question.

**Why it exists:** Because "who may approve this?" is a question about the world, not about
access control. The lecturer who set an assignment has authority over it because she set it.
That is true whether or not any software exists.

**Where it comes from:** Primarily an Appointment on the Offering. Secondarily by **delegation**
— a lecturer may delegate to a teaching assistant, a head of department may act for an absent
colleague. Delegated Authority is real but must be recorded as delegated, because who ruled and
on what basis is exactly what someone asks when a deadline turns out wrong.

**Can it change:** Yes, and it expires. Crucially, **Authority is evaluated at the moment of
attesting, and never re-evaluated.** A lecturer who later leaves does not invalidate her past
Attestations; they were validly made.

**Depends on:** Person, Appointment, Course Offering. **Depended on by:** Attestation.

---

### Attestation

**What:** A ruling by a Person with Authority on an Observation: *confirmed as it stands*,
*confirmed with correction*, or *denied*.

**Why it exists:** It is the moment machine output becomes institutional fact. It is the
product's entire trust proposition and, not coincidentally, its moment of value creation.

**The framing that matters:** the attester is not a quality inspector checking an AI's
homework. **They are the person who spoke, confirming their own words.** The right question to
put to them is "did you say this?" — a two-second memory check with the audio one keypress
away — not "is this extraction correct?", which is data entry and which nobody will keep doing.
Every design decision downstream of this should be tested against that distinction.

**Who creates it:** A Person with Authority. **Who owns it:** them, permanently and by name.

**Can it change:** **Never.** A later change of mind is a new Attestation, not an edit. The
Ledger reflects the latest; the Record keeps both.

**Layer:** The Record. Authored, immutable, append-only.

**Lifecycle:** Made. That is all. It has no states because it is a point-in-time act.

**Depends on:** Observation, Person, Authority. **Depended on by:** Revision, Commitment,
Notice, Guidance, Course Ledger.

---

## THE LEDGER — what is currently true

### Course Ledger

**What:** The current, attested answer to "what does this course require of me, what has been
announced, and what am I advised to do?" for one Course Offering.

**Why it exists:** It is what students actually read. It is the product.

**Who creates it:** Nobody. **It is derived, always, by reading the Attestations in order.**
Nobody writes to the Ledger; people make Attestations and the Ledger follows.

**Can it change:** Constantly — and only ever as a consequence of a new Attestation.

**Layer:** Derived. Entirely reconstructible. If it were lost it could be rebuilt exactly, from
the Record, by replaying the Attestations.

**Depends on:** Attestation, Course Offering. **Depended on by:** every student-facing view,
every Response.

---

### Ledger Item

The umbrella for the three kinds of thing a Ledger holds. Each is derived, each cites Evidence,
each exists only because Attestations put it there.

---

### Commitment

**What:** Something required of students, by a time, with consequences. It has identity, it
persists across Sessions, and it accumulates history.

**Kinds:** Assignment, Quiz, Exam, Project, Presentation. These differ in weight and ceremony,
not in nature — all are "something is required of you by a time."

**Why it exists:** It is the thing students most need and most often miss. It is the reason the
product exists.

**What it holds:** an identity; what is required; **a due moment** (a property, never an entity
of its own); a Scope; a submission method; a weight; and its full history of Revisions.

**Who creates it:** The first Attestation that confirms an Observation not referring to an
existing Commitment. **Who owns it:** the Course Offering; the attesting Faculty hold Authority.

**Can it change:** Constantly — dates move, scope grows, requirements are clarified. **Every
change is a Revision caused by an Attestation.** Nobody ever edits a Commitment directly.

**Layer:** Derived.

**Lifecycle:** Announced → *(Amended · Amended · …)* → *(Due | Cancelled)* → Closed.
Note *Cancelled* and *Closed* are different: cancelled means it was withdrawn; closed means its
moment has passed. Both are terminal for students, and both matter for the record.

**Depends on:** Attestation, Observation, Utterance. **Depended on by:** the student's calendar,
Scope, Response, and later Observations that refer back to it.

---

### Scope

**What:** What a Commitment covers. For an Exam, the topics that will appear. For an
Assignment, the material it draws on.

**Why it exists — and this is one of the model's better moves:** it absorbs "exam topic," which
was previously modelled as a peer of Assignment. But "thermodynamics will be on the exam" is
not a sibling of "submit chapter 5" — it is a *statement about the exam*. Recognising it as
Scope means exam topics accumulate onto the Exam Commitment over the whole term, exactly as
they do in reality, instead of scattering as unrelated items a student must assemble by hand.

**Can it change:** It grows through the term, and occasionally shrinks ("we won't cover that
after all"). Each change is a Revision.

**Layer:** Derived. **Depends on:** Commitment, Attestation. **Depended on by:** exam
preparation views.

---

### Notice

**What:** Something announced that students need to know, which requires nothing of them.
"Thursday's class is cancelled." "We've moved to room 204." "A guest lecturer is coming."

**Why it exists separately from Commitment:** it has no due moment, no discharge condition, and
no lifecycle beyond being announced and possibly retracted. Forcing it into the same shape as a
Commitment produces empty fields and a confusing student view.

**Can it change:** It can be **retracted or superseded**, not amended. "Class is cancelled" then
"actually class is on" are two Notices, and the second supersedes the first.

**Layer:** Derived. **Lifecycle:** Announced → *(Current | Superseded | Expired)*. Notices
expire naturally — a room change for last Tuesday is no longer news.

---

### Guidance

**What:** Non-binding advice. "Read chapter 5." "Practice the problems at the end." "Revise
your linear algebra before next week."

**Why it exists separately:** because the distinction between "you must" and "you should" is
**the product's central discrimination** — it is precisely what separates ClassMind from a
transcription tool. If that distinction is a field on a shared thing, it can be left blank. If
it is the difference between two kinds of thing, it cannot.

**Can it change:** Rarely. Guidance is usually said once. **Layer:** Derived.

---

### Revision

**What:** One change to a Ledger Item, caused by one Attestation. "On 3 December, Prof. Rao
moved Assignment 1's due date from 28 November to 1 December, on the basis of what she said at
12:45 in Session 8."

**Why it exists:** It is what makes "the deadline changed" a first-class, explainable fact
rather than two contradictory items a student has to reconcile alone. It is also the audit
trail: every state the Ledger has ever been in is reconstructible.

**Who creates it:** Nobody directly. It is the consequence of an Attestation.

**Can it change:** No. **Layer:** Derived, and permanent.

**Depends on:** Attestation, Ledger Item. **Depended on by:** history views, change
notifications, "what changed since I last looked."

---

### Citation

**What:** The bond between something a student is shown and the Utterance that warrants it —
the Session, the moment, and the words.

**Why it exists:** Because an unwarranted claim about a deadline is a liability, and because
"how do you know?" must always have an answer.

**Its kind matters, and must always be visible:** *verbatim* (this is what was said),
*corrected* (a human amended what the machine heard), or *authored* (a human stated this
directly; there is no utterance behind it). All three are legitimate. Only the first may claim
to be a quotation. Conflating them is how a citation becomes a convincing lie.

**Layer:** Derived. **Depends on:** Utterance, Ledger Item, Attestation.

---

## THE ENQUIRY LAYER

### Enquiry

**What:** A question a student asks in their own words. "When's the next deadline?" "What's on
the mid-term?"

**Why it exists:** It is how students actually want to interact. It is also **the single best
product signal available** — the questions the Ledger cannot answer tell you precisely what the
product is missing, for free.

**Who creates it / owns it:** The student. **Layer:** Authored, immutable.

**Its handling is unusually sensitive.** An Enquiry is behavioural data about an identifiable
individual, individually attributable by construction, and arguably more revealing than the
lecture audio — a pattern of anxious questions before an exam says a great deal about a person.
It therefore carries **the shortest retention and the strictest access rules in the domain**.
Aggregate insight is legitimate; a lecturer browsing one named student's questions is not.

**Depends on:** Person, Course Offering. **Depended on by:** Response, Conversation.

---

### Response

**What:** An answer to an Enquiry, drawn only from the Ledger, always citing its Evidence.

**Why it exists:** To make the Ledger usable without navigating it.

**The rule that defines it:** a Response may only assert what the Ledger holds. When the Ledger
holds nothing relevant, the honest Response is *"that was not mentioned in your lectures"* —
never a guess. A Response that draws on anything other than attested Ledger items is outside
the domain and is a defect, not a feature.

**Can it change:** No. It is a permanent record of what a student was told — necessary the first
time someone says "your app told me the wrong date."

**Layer:** Derived in principle, kept as a permanent record in practice.

---

### Conversation

**What:** An ordered sequence of Enquiries and Responses with one Person, where later ones may
depend on earlier ones ("what about the next one?").

**Layer:** Derived. **Depends on:** Enquiry, Response.

---

## THE RESEARCH LAYER

*Kept rigidly apart from everything above. Constitution Article VIII.*

### Gold Annotation

**What:** An independent, trained judgement of what a Session's Utterances actually contain,
produced **without seeing what any Observer proposed.**

**Why it exists separately from Attestation:** because they are different instruments measuring
different things, and merging them destroys both. An Attestation is fast, single-person, and
anchored to what the machine suggested. A Gold Annotation is slow, independent, blind, and
double-produced. Attestation is optimised for trust and speed — correctly. Gold Annotation is
optimised for truth. **Neither can do the other's job.** See Part 8, Challenge 4.

**Who creates it:** Trained annotators, at least two independently. **Who owns it:** the
research record.

**Can it change:** Only before a Benchmark is frozen. After freezing, never.

**Layer:** Authored. **Depends on:** Utterance. **Depended on by:** Benchmark.

---

### Benchmark

**What:** A frozen, named, versioned set of Gold Annotations over a fixed set of Sessions, with
its agreement level recorded.

**Why it exists:** It is the only thing any reported number may be measured against.

**Can it change:** **Never, once frozen.** A change makes a new version, and results from
different versions are not comparable.

**Layer:** Authored. **Lifecycle:** Assembling → Frozen → Superseded (never deleted).

---

### Annotation Guideline

**What:** The written definition of what counts as a Commitment, what counts as Guidance, how
to treat hedged speech, and how to handle every ambiguous case the annotators have hit.

**Why it exists — and it is badly under-valued in every earlier document:** it is what makes two
annotators agree. Without it, agreement is luck. **A corpus whose labelling standard drifted
silently is worth nothing**, because you can no longer tell genuine disagreement from a change
in the rules.

**Who owns it:** The research lead. **Can it change:** Yes, and every change is versioned,
because it changes what past labels mean.

**This is a long-lived asset on the same order as the Recordings.** It is also, arguably, the
most genuinely defensible thing the project will produce.

---

# PART 3 — Aggregates

An aggregate is a cluster that changes together, has one entry point, and is consistent as a
whole. The test: *if I change this, what else must change at the same instant to stay sensible?*

## The five aggregates

### 1. Session — the capture aggregate

**Contains:** the Session, its Recordings, Transcriptions, Transcripts, and Utterances.

**Reasoning:** These have no meaning apart from each other. An Utterance without its Recording
is an unverifiable quotation; a Transcript without its Session belongs to nobody. They are
created together, they are erased together when consent is revoked, and they share a retention
clock. Nothing outside reaches inside except through the Session.

**Explicitly excluded: Observations.** This answers the question in the prompt directly — a
Session does **not** own its extracted output. See below.

---

### 2. Extraction Pass — the observation aggregate

**Contains:** the Pass, its Observer identity, and every Observation it produced.

**Reasoning, and it is the least obvious decision in this document:** Observations belong to the
Pass that made them, not to the Session they are about.

Consider what happens otherwise. Three Observers each read Session 8, as the research design
requires. If the Session owns Observations, it now owns three conflicting sets of them and has
no way to say which belongs together — and re-running an Observer either destroys the previous
run or silently doubles everything. Both outcomes wreck the comparison the project is graded on.

Grouping by Pass makes each set self-consistent, independently re-runnable, and comparable
against the others. The Session remains what the Observations are *about*; the Pass is what they
*came from*.

---

### 3. Commitment — the ledger aggregate

**Contains:** the Commitment, its Scope, and its Revisions.

**Reasoning:** A Commitment's due date, scope and history must be consistent at every instant —
a student seeing a new date and an old scope is being misled. Notices and Guidance are separate
small aggregates of the same shape.

**Explicitly excluded: Attestations.** A Commitment is *derived from* Attestations, and derived
things do not own their sources. Article II.

---

### 4. Attestation — a deliberately tiny aggregate

**Contains:** itself alone. The Observation it rules on, the Person, and the Authority are all
references outward.

**Reasoning:** An Attestation is a point-in-time act with no internal parts and no consistency
requirement beyond its own existence. Making it small is what lets the same act simultaneously
create a Commitment, amend another, and deposit a training label — none of which are the same
aggregate, and none of which need to change in the same instant.

---

### 5. Course Offering — the frame aggregate

**Contains:** the Offering, its Appointments and Enrolments.

**Reasoning:** Who teaches and who is enrolled must be consistent together, because Authority
and visibility both derive from them.

---

## Deliberately not aggregates

- **Person** stands alone. They cross Offerings, Institutions and years.
- **Consent Grant** stands alone and is referenced by the Session aggregate. It cannot be owned
  by what it authorises — the authorisation must be able to outlive and overrule the thing.
- **Benchmark** and **Gold Annotation** form their own cluster, and it touches nothing above.
  That isolation is not tidiness; it is Article VIII made structural.

---

# PART 4 — Relationships and Cardinality

## The spine

```
Institution
   └─ Course Offering ──────────────────────────── Course Ledger
        ├─ Session                                      │
        │    └─ Recording ── Transcription ── Transcript│
        │                                    └─ Utterance
        │                                          │
        │                        (an Observer reads it)
        │                                          ▼
        │                    Extraction Pass ── Observation
        │                                          │
        │                        (a Person with Authority rules)
        │                                          ▼
        │                                     Attestation
        │                                          │
        │                                     Revision
        │                                          ▼
        └────────────────────────── Commitment · Notice · Guidance
                                                   │
                                          cited back to Utterance
```

## The questions asked, answered

**Can one Session produce many Commitments?** Yes — zero to many. A lecture may announce three
assignments or none. Nothing requires a Session to produce anything.

**Can one Commitment appear in many Sessions?** **Yes, and this is the point of the whole model.**
An assignment is announced in Session 5, clarified in Session 6, extended in Session 8, and
reminded about in Session 11. That is one Commitment with four Observations across four Sessions
and four Revisions. The old model, which made each mention a separate event that "superseded"
the last, was asserting that an utterance in Session 8 cancelled an utterance in Session 5 —
which is false. Both were said, neither can be un-said, and only the *conclusion* changed.

**Can one Utterance produce many Observations?** Yes, necessarily — one per Observer, which is
what makes comparison possible. Also, one Utterance may assert two things at once ("submit by
Friday, and this will be on the exam"), producing two Observations from one Observer.

**Can one Observation concern many Commitments?** No — exactly zero or one. If a lecturer says
something about two assignments in one breath, that is two Observations. Keeping this at one
keeps attestation a single yes-or-no judgement, which is what keeps it fast.

**Can one Attestation cause many Revisions?** Yes. Confirming "I'm extending assignment 1 and it
now includes the case study" moves a date and grows a Scope — two Revisions, one act.

**Can one Transcript generate many Ledger changes?** Yes. One Session's transcript may yield
several Observations, each separately attested, each folding into the Ledger.

**Can one Faculty member attest to another's Commitment?** **Normally no — and the reasoning
matters more than the rule.** Attestation is not review; it is the speaker confirming their own
words. Someone who was not in the room is guessing, and a guess dressed as an attestation is
worse than no attestation, because it carries authority it has not earned.

Three genuine exceptions, each of which must be recorded as what it is:
- **Co-teaching** — several Appointments on one Offering, all with native Authority.
- **Delegation** — a lecturer authorises a teaching assistant. Real, and must be recorded as
  delegated, with the delegator named.
- **Institutional override** — a head of department acting for an absent colleague. Legitimate
  and rare, and it should feel heavier than the normal path, because it is.

**Can a student attest?** Never. Students may **flag** a Ledger Item as wrong, which creates an
Observation with the student as Observer, routed to someone with Authority. The distinction is
exact: students can raise a question, only Authority can settle it.

**Can an Observation exist with no Utterance?** Yes — when a lecturer types a commitment in
directly. The Observer is the Person, the Citation kind is *authored*, and it must never present
itself as a quotation.

**Can a Ledger Item exist with no Attestation?** **Never.** Article III. This is the single
hardest invariant in the domain.

**Can a Recording exist without a Consent Grant?** Never. Article I.

**Can Authority be evaluated after the fact?** No. It is fixed at the moment of attesting.

---

# PART 5 — The Life of One Session

Business states only. Nothing about how any of it happens.

### 1. A Session occurs
A Course Offering meets. People speak. **Nothing exists yet.**

### 2. Capture is authorised
Consent Grants covering everyone whose voice may be captured are already in force. *If they are
not, capture must not occur* — this precedes everything and is not a step that can be caught up
later.

### 3. A Recording is made
Now the Record begins. This artefact is permanent until deliberately erased, and everything
downstream is reconstructible from it.

### 4. A Transcription is performed
Producing a Transcript and its Utterances. **State: the Session is Transcribed.** If a second
engine runs later, a second Transcription joins the first; neither replaces the other.

### 5. An Extraction Pass runs
An Observer reads the Utterances and makes Observations. Each carries what it believes is being
asserted, how strongly, and **what it believes the assertion is about** — a Commitment already in
the Ledger, or a new one.

**State: the Session is Observed. Nothing is visible to any student.** This is the most important
sentence in this document. Everything so far is a machine's opinion.

### 6. Attestation
A Person with Authority — normally the lecturer who spoke — is presented with each Observation
and asked, in effect, *"did you say this?"*

Each Observation is **confirmed**, **corrected**, or **denied**. Each ruling is an Attestation:
permanent, attributed by name, and never editable.

Note what happens to a denied Observation: it does not vanish. It stays in the Record as a
permanent example of the machine being wrong, which is one of the more useful things the system
produces.

### 7. The Ledger revises
Each Attestation folds into the Course Ledger:

- Confirms an Observation about *no known Commitment* → **a Commitment is born.**
- Confirms one about an *existing* Commitment → **a Revision.** The due date moves, or the Scope
  grows, or a requirement is clarified. The Commitment's identity is untouched.
- Confirms an Observation of a Notice or Guidance → that item enters the Ledger.
- Denies → nothing enters the Ledger. The Record keeps the denial.

**State: the Session is Settled.** Only now does anything become visible to students.

### 8. Students read the Ledger
Deadlines appear in a calendar. Exam Scope accumulates. Changed items show *what* changed, *when*,
*who* changed it, and *the words they said* — because a Revision carries all four.

### 9. Students enquire
A student asks in their own words. The Response draws only on the Ledger and cites its Evidence.
When the Ledger holds nothing, the Response says so.

### 10. A later Session refers back
Session 11 contains "remember assignment 1 is due Monday." An Observation is made believing this
concerns the Commitment born in Session 5. Attestation confirms it. Either it changes nothing —
a reminder — or it revises again.

**The loop closes. The Commitment persists across four Sessions, and at every moment the Ledger
holds exactly one current answer while the Record holds every version and every reason.**

### The state summary

| Layer | States |
|---|---|
| Session | Occurred → Captured → Transcribed → Observed → Settled |
| Observation | Made → Unadjudicated / Attested / Denied |
| Commitment | Announced → Amended* → Due / Cancelled → Closed |
| Notice | Announced → Current / Superseded / Expired |
| Consent | Requested → Granted → Expired / Revoked → Erased |

---

# PART 6 — Boundaries

The proposed list — Teaching, Knowledge Management, Review, Evaluation, Student Learning, AI
Extraction, Research, Administration — is mostly wrong, because it names *activities* rather than
areas where **words mean different things**. That is the actual test for a boundary.

"Teaching" is not a boundary; it is what the Institution does around us. "Knowledge Management"
is not a boundary; it is a phrase. The real seams are where the same word changes meaning.

## The five real boundaries

### 1. Academic Context *(supporting, and mostly not ours)*
Institutions, People, Courses, Offerings, Terms, Calendars, Appointments, Enrolments.

**Why it is a boundary:** we consume all of it and are authoritative for none of it. It answers
"who, what course, when" and nothing else. **This is the boundary most likely to be violated by
accident,** because it is so tempting to let ClassMind become the place where courses are
managed. It must not. See Part 8, Challenge 6.

### 2. Capture *(supporting)*
Consent, Sessions, Recordings, Transcriptions, Transcripts, Utterances.

**Why:** everything here is about faithfully recording what happened, with zero interpretation.
The word *accurate* means "matches the audio" — and nowhere else in the system does it mean that.

### 3. Interpretation *(dual-status — read the note)*
Observers, Extraction Passes, Observations.

**Why:** everything here is provisional by nature. The word *confidence* exists only here.
Nothing here is ever shown to a student.

**Its dual status must be stated openly:** for the capstone this is the **graded** area and
deserves disproportionate effort. For the startup it is a commodity that will be replaced
repeatedly as models improve. Confusing the two is how a company ends up defending a prompt.

### 4. Attestation and Ledger *(CORE — this is the business)*
Authority, Attestations, Commitments, Scope, Notices, Guidance, Revisions, Citations.

**Why this is the core:** it is the only place anything becomes *true*. Every other boundary
either feeds it or reads from it. If ClassMind is ever sold, this is what is being bought.

The word *approved* exists only here. *Due* exists only here. *Authority* exists only here.

### 5. Research *(isolated by constitutional requirement)*
Gold Annotations, Benchmarks, Annotation Guidelines, measurements.

**Why it is separate:** it uses the same nouns as Interpretation and means different things by
them. A "label" here is independent ground truth; a "label" in Interpretation is a machine
guess. Article VIII exists to keep those apart, and a boundary is how you keep them apart in
people's heads as well as in data.

## Deliberately generic — buy, do not build, spend no design effort

Identity and sign-in, notification delivery, file storage, calendar rendering, tenancy plumbing,
and **retrieval for enquiries**.

That last one is a deliberate demotion. Once Commitments are structured and attested, the great
majority of student questions — "when is assignment 3 due", "what's on the exam" — are ordinary
lookups over a few hundred items, not a search problem. Natural-language enquiry is a required
capability; it is not a reason to spend architecture effort building a retrieval product on top
of a dataset that would fit on a page.

## The boundary map

```
      ACADEMIC CONTEXT  ─────────────►  (who, what course, when)
      not ours, read-only                        │
                                                 ▼
      CAPTURE ─────────────────────►  what was said, verbatim
      supporting                                 │
                                                 ▼
      INTERPRETATION ──────────────►  what a machine thinks it means
      graded now, commodity later                │
                                                 ▼
   ╔═══════════════════════════════════════════════════════════╗
   ║  ATTESTATION & LEDGER   ── what is TRUE ──  THE BUSINESS  ║
   ╚═══════════════════════════════════════════════════════════╝
                                                 │
                                                 ▼
                                        students read it


      RESEARCH ── isolated by Article VIII, touches nothing above
```

---

# PART 7 — Ubiquitous Language

The official vocabulary. **One word, one meaning.** If you need a different meaning, you need a
different word — and it must be added here first.

## Glossary

| Term | Meaning |
|---|---|
| **Appointment** | A Person's teaching relationship to a Course Offering. Source of Authority. |
| **Attestation** | A ruling by a Person with Authority on an Observation: confirmed, corrected, or denied. Permanent, attributed, never edited. |
| **Authority** | The standing of a Person to rule on a particular matter. Derived from Appointment or explicit delegation. Fixed at the moment of attesting. |
| **Benchmark** | A frozen, versioned set of Gold Annotations. The only thing a reported number may be measured against. |
| **Citation** | The bond from something a student is shown back to the Utterance warranting it. Always of kind *verbatim*, *corrected*, or *authored*. |
| **Commitment** | Something required of students by a time, with consequences. Has identity, persists across Sessions, accumulates Revisions. Kinds: Assignment, Quiz, Exam, Project, Presentation. |
| **Consent Grant** | A Person's recorded permission, for a stated purpose and period, revocable. Precondition for every raw artefact. |
| **Conversation** | An ordered sequence of Enquiries and Responses with one Person. |
| **Course** | A catalogue entry. Owned by the Institution. Not where teaching happens. |
| **Course Ledger** | The current attested state of one Course Offering — all its Commitments, Notices and Guidance. Derived, never written to directly. **What students read.** |
| **Course Material** | Slides, PDFs, handouts. Supporting evidence and context. |
| **Course Offering** | One actual run of a Course in a Term with particular staff and students. **The primary working unit.** |
| **Enquiry** | A question asked by a student in their own words. Highly sensitive. |
| **Enrolment** | A Person's learning relationship to a Course Offering. Source of visibility. |
| **Evidence** | The role an Utterance plays when something cites it. Not a separate thing. |
| **Extraction Pass** | One run of one Observer over one Transcript. The unit of measurement. |
| **Gold Annotation** | An independent, blind, trained judgement of what Utterances contain. **Never an Attestation.** |
| **Guidance** | Non-binding advice. No due moment, no consequence. |
| **Institution** | An organisation that teaches. The tenancy boundary. |
| **Ledger Item** | Umbrella for Commitment, Notice, and Guidance. |
| **Notice** | Something announced that requires nothing of students. Superseded, never amended. |
| **Observation** | A record that an Observer, reading an Utterance, believes something is being asserted. **Immutable. Never visible to students.** |
| **Observer** | Whoever or whatever produced an Observation — a named method at a version, or a Person. |
| **Person** | A human known to the system. Holds roles; is not a role. |
| **Recording** | Captured audio of a Session. Raw, irreplaceable, own retention clock. |
| **Response** | An answer to an Enquiry, drawn only from the Ledger, always cited. |
| **Revision** | One change to a Ledger Item, caused by one Attestation. Carries what changed, when, by whom, and on what evidence. |
| **Scope** | What a Commitment covers. Absorbs "exam topics." Accumulates through the term. |
| **Session** | A class meeting that actually occurred. Not a scheduled slot. |
| **Term** | A named span of the academic year. |
| **Transcript** | The words produced by one Transcription. Never edited. |
| **Transcription** | One act of converting a Recording to words by one named engine. Versioned. |
| **Utterance** | A bounded span of speech: words, speaker, time range. The unit of Evidence. |

## Banned words

Each of these is either ambiguous, or a different concept wearing a familiar name. **Do not use
them in code, documents, screens, or conversation.**

| Banned | Use instead | Why |
|---|---|---|
| **Academic Event** | Commitment, Notice, or Guidance | Collapses four unrelated kinds of thing. See Challenge 1. |
| **Deadline** *(as a thing)* | The **due moment** of a Commitment | A property, not an entity. Saying "the deadline" is fine in speech; modelling one is not. |
| **Knowledge** | Course Ledger | Not an entity. Cannot be pointed at, owned, or changed. |
| **Lecture** | Session | Means the slot, the meeting, or the recording. |
| **Event** | Observation, Attestation, or Revision — say which | Means everything, therefore nothing. |
| **Approve** | **Attest** | "Approve" suggests a supervisor checking work. The lecturer is confirming their own words. The wrong verb produces the wrong interface. |
| **Task / Reminder / Action Item / To-do** | Commitment | Consumer-productivity vocabulary. A Commitment is institutional and has consequences. |
| **User** | Person, plus the role | "User" hides which role is meant, and the roles have opposite needs. |
| **Correction** *(as an entity)* | Attestation of kind *corrected* | There is no separate correction object. |
| **Extraction** *(as a noun for output)* | Observation | The output is an Observation; the act is an Extraction Pass. |
| **Confidence** | **Review priority** — until calibrated | Article IX. Only call it confidence when it is a measured probability. |
| **Ground truth** *(loosely)* | Gold Annotation | Only Gold Annotations are ground truth. Attestations never are. |
| **Semester** | Term | Presumes a two-term year. |

---

# PART 8 — Challenges to Existing Thinking

## Challenge 1 — "Academic Event" must be abolished

**The current model** has one thing with a type of `assignment | deadline | exam_topic |
announcement`.

**These are not four values of one kind of thing.** An assignment is an entity with identity and
a lifecycle spanning months. A deadline is a *property of* an assignment. An exam topic is a
*statement about* an exam. An announcement is a point-in-time notice that by definition never
changes. Putting them in one bucket forces every one of them to carry every other's fields, so
most fields are empty most of the time, and the product's central distinction — must versus
should — becomes a column that can be left blank.

**Replace with:** Commitment (with a due moment and a Scope), Notice, Guidance.

## Challenge 2 — Deadline is not an entity, and this is why cross-lecture tracking looked impossible

The existing architecture calls cross-lecture tracking "the hardest unsolved piece" and predicts
it will be the biggest source of bugs. **It looks hard because the model conflates the utterance
with the thing the utterance is about.**

Walk the case through. Session 5: "assignment due Friday." Session 8: "extending assignment 1 to
Monday." In the old model, what does the Session 8 event supersede? The Session 5 event. But
nothing about the assignment was superseded — the assignment still exists, unchanged; only its
due date moved. The model destroys and recreates an entity that persisted, and asserts that one
utterance cancelled another, which is false. **Both were said. Neither can be un-said.**

Separate Observation from Commitment and the problem changes shape entirely: it becomes *"does
this Observation concern a Commitment we already know?"* That is still genuinely hard — but it is
now also **a one-click question for the lecturer**: "is this the same assignment 1?" An unsolved
research problem becomes a UI affordance that produces a labelled example for free.

## Challenge 3 — "Knowledge" is not an entity

You cannot point at Knowledge, own it, create it, or change it. Every sentence with "Knowledge"
in it is either about the **Course Ledger** (the current attested state) or about the **Record**
(what was said) — and those two have opposite properties, so a word covering both hides the only
distinction that matters.

**Replace with Course Ledger.** And note that "knowledge is the product" was doing real damage:
it was the phrase behind the claim that accumulated data is the company's moat, a claim already
withdrawn on arithmetic grounds.

## Challenge 4 — Attestation and Gold Annotation must never be the same thing

They look almost identical — a human saying what an Utterance means — which is exactly why the
error is easy to make and was in fact made in an earlier version of `decisions.md`.

| | Attestation | Gold Annotation |
|---|---|---|
| Who | The person who spoke | Trained annotators |
| How many | One | Two or more, independent |
| Sees the machine's answer first? | **Yes — anchored by design** | **No — blind by design** |
| Optimised for | Trust and speed | Truth |
| Time budget | Under five minutes per hour | However long it takes |
| Can measure recall? | **No — only sees what was proposed** | Yes |
| Agreement measurable? | No — single judge | Yes |

Both are correct instruments for their own purpose. Neither can do the other's job. Merging them
means grading a model against data anchored to that model's own output — and reporting recall
that is structurally capped by what the model proposed.

## Challenge 5 — "Approve" is the wrong verb, and it will produce the wrong product

"Faculty approval" frames the lecturer as a quality inspector checking an AI's homework. Under
that frame the natural interface shows a confidence score and an edit box, and asks *"is this
extraction correct?"* — which is data entry, which is exactly what the requirements identify as
the thing that kills adoption.

**The lecturer is not reviewing a machine. They are confirming their own words.** The right
question is *"did you say this?"*, with the audio one keypress away — a two-second memory check.

Same data, entirely different product. This is why the verb is **attest**, and why "approve" is
on the banned list.

## Challenge 6 — ClassMind must never become the source of truth for academic structure

Absent from every earlier document, and it matters more than it looks.

**ClassMind owns claims made in lectures. It owns nothing about institutional structure** — not
the course catalogue, not the roster, not the timetable, not term dates. All of that is read,
never authored.

The pull to drift is strong: a college without a good timetable system will ask, and saying yes
is easy. But the moment ClassMind is authoritative for rosters, every future integration becomes
a data-reconciliation project instead of a read-only sync, and the product acquires an
administrative burden with nothing to do with why anyone bought it.

Write it down now, while it costs nothing.

## Challenge 7 — Faculty and Student are roles, not entities

A PhD student teaches one course and takes another, in the same term. A teaching assistant is
enrolled and has delegated Authority. A lecturer sits in on a colleague's course.

A model with a Faculty table and a Student table cannot represent any of these without
duplicating the person, and duplicated people diverge. **Person, plus Appointment or Enrolment
per Offering.**

## Challenge 8 — Exam topics are Scope, not items

"Thermodynamics will be on the exam" is not a sibling of "submit chapter 5." It is a *statement
about the exam*. Modelling it as an independent item scatters exam information across the term
and leaves the student to assemble it. Modelling it as **Scope on the Exam Commitment** means it
accumulates exactly as it does in reality: by the end of term, the Exam has gathered its topics,
each citing the moment it was mentioned.

## Challenge 9 — An Observation must record what it believes it is *about*

The reference judgement — "this concerns assignment 1" — is the hardest call in the product, and
it must live in the Observation as a **belief**, alongside the machine's uncertainty about it, so
that Attestation can settle it.

If reference is resolved silently before a human ever sees it, the single most error-prone
judgement in the system becomes the one nobody is asked to check — and a wrongly-linked
Observation silently rewrites the due date of an unrelated Commitment. That is the worst failure
this product can produce.

## Challenge 10 — Consent constrains immutability, and nobody had noticed

Article II says the Record is append-only and never edited. Article I says a Person may withdraw
consent and have their voice erased. **These conflict, and the conflict has never been written
down.**

The resolution: *"never edited in place"* and *"never deletable"* are different rules. The Record
is the first. Erasure is a designed, whole-subject, cascading operation that must be built before
the first real Recording exists — not retrofitted after someone asks.

---

## What this model still cannot answer

Recorded honestly, because a domain model that claims to have solved everything is hiding
something.

1. **How much of the domain does reference resolution actually touch?** If most Observations are
   about new Commitments, the Observation/Commitment split is ceremony at capstone scale. If many
   are re-references, it is mandatory. *Resolvable cheaply:* annotate three real Sessions and
   count. Nobody has this number.
2. **Will lecturers attest at all?** The entire core domain has no producer if they will not.
   *Resolvable cheaply:* print twenty Observations from a mock Session on paper, sit with three
   lecturers, and time them.
3. **Is Guidance a real category or does it collapse into Notice?** Plausible either way until
   real lectures are annotated.
4. **Can Authority delegation be kept simple?** Modelled minimally here. Real institutional
   politics may demand more, and more would be costly.
5. **Does Scope work for assignments as well as exams,** or is it exam-specific? Currently
   asserted, not tested.
