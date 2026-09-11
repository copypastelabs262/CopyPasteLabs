# INTERIM REPORT — Capstone Project 2026-27

> **This is the drafting master for the Interim Report.** It follows Annexure A.8 of
> `Capstone_project_guidelines_2026-27_final.pdf` exactly: front matter, Chapters 1–5,
> Conclusion and Future Scope, References, Appendices A–D.
>
> **Team and project details are filled in.** Four things remain in `[SQUARE BRACKETS]` and
> only you can supply them: the three **SAP IDs**, Dr. Bomnale's **designation**, the
> **Acknowledgement** paragraph, and reference [15]'s volume/page numbers. They are marked
> rather than guessed — a fabricated SAP ID on a signed submission is worse than a blank one.
>
> **Generate the Word file** with `build-report-docx.py` (see the command in the folder), then
> do final layout there. The converter already applies A.8 §1–13 and §18–19: Times New Roman,
> 12 pt body, 1.5 spacing, 1.5″ left margin, 18/14/12 pt headings, 10 pt table captions,
> header and footer, Roman front matter and decimal body numbering.
>
> **Delete every grey italic note like this one before submitting.**

---

# Title Page

**ClassMinds: An AI-Powered Academic Intelligence and Contextual Learning Platform**

Project Report submitted in partial fulfilment

of

**Bachelor of Technology (B.Tech.)**

In

**Electronics & Telecommunication Engineering**

by

**Shyam Chavda (D004)**
**Dharsh Gujar (D010)**
**Shiv Pujarie (D022)**

Under the supervision of

**Dr. Archana Bomnale**
*([DESIGNATION — e.g. Assistant Professor], Department of Electronics & Telecommunication Engineering, MPSTME)*

SVKM's NMIMS University (Deemed-to-be University)
Mukesh Patel School of Technology Management & Engineering (MPSTME)
Vile Parle (W), Mumbai–56
**Academic Year 2026-27**

> **Note.** The title is taken from the signed Log Book and is now fixed. It must read
> identically on the title page, the certificate, and every page header. Note the product is
> spelled **ClassMinds** — the repository slug `classmind` is an internal identifier and is
> deliberately not renamed; that difference should not appear anywhere in this report.

---

# Certificate

This is to certify that the project entitled **"ClassMinds: An AI-Powered Academic Intelligence and
Contextual Learning Platform"** has been done by **Shyam Chavda, Dharsh Gujar and Shiv
Pujarie** under my guidance and supervision, and has been submitted in partial
fulfilment of the degree of **Bachelor of Technology** in **Electronics & Telecommunication Engineering** of MPSTME, SVKM's NMIMS
(Deemed-to-be University), Mumbai, India.

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_    \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
Project mentor (name and signature)    Examiner (name and signature)
(Internal Guide)

Date:
Place: Mumbai    \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
    (HoD) (name and signature)

---

# Acknowledgement

[ONE PARAGRAPH. Thank the faculty mentor by name, the department, and anyone who provided
lecture recordings or consented to their use. Keep it short and specific — a generic
acknowledgement reads as filler.]

| NAME | ROLL NO. | SAP ID |
|---|---|---|
| Shyam Chavda | D004 | [SAP ID] |
| Dharsh Gujar | D010 | [SAP ID] |
| Shiv Pujarie | D022 | [SAP ID] |

---

# Abstract

Recorded lectures are now routine in Indian higher education, but recording solves only
availability. A student who needs to know what was *assigned* in a lecture must still search
an hour of continuous speech for the thirty seconds in which the obligation was stated. The
information exists and is not actionable. This problem is sharpened in Indian classrooms by
code-switching — the routine mixing of Hindi and English within a single sentence — which
degrades the automatic speech recognition that any downstream processing depends on.

This project addresses the automatic extraction of structured academic commitments —
assignments, submission deadlines, examination topics and announcements — from code-switched
Hindi–English classroom speech, with each extracted item carrying a confidence score and a
link to the exact moment in the recording where it was said. A survey of twelve works across
code-switched speech recognition, commitment detection in spontaneous speech, LLM-based
information extraction and retrieval-augmented delivery in education establishes that these
literatures address the problem's components but have not been joined: code-switching
research terminates at the transcript, action-item detection operates on monolingual English
business meetings, and educational retrieval systems presuppose a document corpus that
faculty have uploaded.

The survey also establishes the difficulty honestly. The strongest published result on the
nearest analogue task — action item detection on the AMI meeting corpus — is approximately
43 F1, obtained on clean monolingual English with annotated in-domain training data. The
system architecture is therefore built around a single load-bearing boundary between
*proposed* and *approved* events: nothing reaches a student without faculty approval, so an
extraction error becomes review workload rather than a wrong deadline.

At the interim stage a working system has been implemented and exercised on real
code-switched lectures. It performs ingest, transcription with millisecond-level timestamps,
LLM-based extraction into a typed knowledge model, a faculty review queue, and a
course-scoped question-answering surface in which every answer cites the transcript span it
came from. Two real Hinglish lectures have been processed end to end, and the same lecture
has been processed through two different reasoning providers to compare their output.
Quantitative precision and recall against an annotated ground truth have **not** yet been
measured; that evaluation, over a corpus of fifteen or more annotated lectures, is the
principal remaining work and is described in the Future Scope.

**Keywords:** code-switching, automatic speech recognition, information extraction, event
extraction, educational technology, Hindi–English, large language models, human-in-the-loop.

---

# Table of Contents

| Topic | Page |
|---|---|
| List of Figures | i |
| List of Tables | xvi |
| Abbreviations | xix |
| **Chapter 1 — Introduction** | 1 |
| 1.1 Background of the project topic | |
| 1.2 Motivation and scope of the report | |
| 1.3 Problem statement | |
| 1.4 Salient contribution | |
| 1.5 Organization of report | |
| **Chapter 2 — Literature Survey** | |
| 2.1 Introduction to the overall topic | |
| 2.2 Exhaustive literature survey | |
| 2.3 Comparative summary | |
| 2.4 Research gap | |
| **Chapter 3 — Methodology and Implementation** | |
| 3.1 Block diagram | |
| 3.2 Hardware description | |
| 3.3 Software description, flowchart and algorithm | |
| **Chapter 4 — Results and Analysis** | |
| 4.1 Implementation status | |
| 4.2 Extraction output on real lectures | |
| 4.3 Provider comparison | |
| 4.4 System verification | |
| 4.5 Development timeline | |
| 4.6 What has not yet been measured | |
| **Chapter 5 — Advantages, Limitations and Applications** | |
| 5.1 Advantages | |
| 5.2 Limitations | |
| 5.3 Applications | |
| **Conclusion and Future Scope** | |
| **References** | |
| **Appendix A — Soft Code Flowcharts** | |
| **Appendix B — Data Sheets** | |
| **Appendix C — List of Components** | |
| **Appendix D — List of Papers Presented and Published** | |

*(A.8 §18–19: page numbers for the List of Figures, List of Tables and Abbreviations are
Roman; from Chapter 1 onward they are decimal. Generate the real numbers in Word after
pagination, not by hand.)*

## List of Figures

| Fig No | Name of the figure | Page No |
|---|---|---|
| 3.1 | System block diagram | |
| 3.2 | Processing pipeline — ingest to approved event | |
| 3.3 | The proposed/approved boundary | |
| 4.1 | Faculty review queue (screenshot) | |
| 4.2 | Student question-answering surface with citation (screenshot) | |

## List of Tables

| Table No | Name of the Table | Page No |
|---|---|---|
| 2.1 | Comparison of reviewed literature | |
| 3.1 | Technology stack and rationale | |
| 3.2 | Knowledge item categories and kinds | |
| 4.1 | Extraction output on two real lectures | |
| 4.2 | Provider comparison on an identical transcript | |
| 4.3 | Automated verification suites | |
| 4.4 | Development timeline, Weeks 1–7 | |

## Abbreviations

| Abbreviation | Expansion |
|---|---|
| ASR | Automatic Speech Recognition |
| CER | Character Error Rate |
| DPDP | Digital Personal Data Protection (Act, 2023) |
| IE | Information Extraction |
| LLM | Large Language Model |
| NER | Named Entity Recognition |
| RAG | Retrieval-Augmented Generation |
| RLS | Row-Level Security |
| WER | Word Error Rate |

---

# Chapter 1 — Introduction

This chapter introduces the problem the project addresses, the reasoning that motivates it,
the precise problem statement derived in Chapter 2, and the organisation of the remainder of
this report.

## 1.1 Background of the project topic

Lecture recording is now standard infrastructure in higher education, and platforms such as
Panopto, Echo360 and Otter.ai handle capture and transcription competently. What none of them
resolve is that a recording is an undifferentiated hour of speech. The sentence a student
needs — "submit the Chapter 5 analysis by Friday 5 PM" — occupies perhaps fifteen seconds of
it, and nothing in the recording marks that span as different from the surrounding material.
The consequence is a familiar pattern: students miss deadlines that were announced clearly,
faculty repeat announcements across lectures, and revision before an examination becomes a
search through entire recordings for the phrase "this will be on the exam."

The technical obstacle is not transcription but interpretation. General-purpose transcription
and meeting-summarisation tools treat a lecture as they would a business meeting, and are not
built to separate an obligation from a suggestion — to distinguish "please read Chapter 5,"
which is advice, from "submit the Chapter 5 analysis by Friday," which is a commitment with a
deadline attached. That distinction is the substance of this project.

The Indian classroom adds a constraint that is not incidental. Instruction routinely mixes
Hindi and English within a single sentence — for example, "यह बहुत important concept है जो exam
में आएगा" — a phenomenon linguists term **code-switching**. Code-switching is a documented
source of degradation in speech recognition [1], [3], and it is precisely the characteristic
that prevents direct reuse of tools built for monolingual English lecture capture.

## 1.2 Motivation and scope of the report

The motivation is that the failure is avoidable. The information a student needs was stated
aloud, clearly, by the lecturer, and was captured by the recording. Only its structure is
missing. Recovering that structure automatically converts an existing but inert artefact into
something students can act on, at no additional cost to faculty beyond a short review.

**In scope for the capstone:**

- Upload of a recorded lecture audio file and transcription with timestamps;
- Extraction of assignments, deadlines, examination topics and announcements, each carrying a
  confidence indicator and a link to its source moment in the recording;
- Tracking of the same commitment across lectures, so that a revised deadline is recognised as
  a change rather than recorded as a second, conflicting item;
- A faculty review interface supporting approve, edit and reject;
- A student surface providing a list of confirmed items and natural-language questioning over
  them, with every answer citing its source;
- Evaluation on fifteen or more annotated real lectures, with precision and recall reported
  honestly, including failure analysis.

**Explicitly out of scope,** with reasons, since a scope boundary without a reason is an
omission rather than a decision:

- **Live transcription during the lecture** — introduces streaming, hardware and
  partial-transcript handling for no research value; uploading a file yields the same product
  at a fraction of the risk.
- **Mobile applications** — a responsive web interface covers both the demonstration and any
  pilot.
- **LMS integration** (Canvas, Moodle, Blackboard) — commercially valuable, expensive to
  integrate, and demonstrates nothing about the research question.
- **Languages beyond Hindi–English** — multiplies the annotation burden without changing the
  research finding. The architecture must not preclude them, which is a different requirement
  from building them.
- **Training or fine-tuning a speech model** — out of proportion to the project's resources.

## 1.3 Problem statement

Derived in full in Section 2.4 from the literature reviewed in Chapter 2:

> **How accurately can structured academic events — assignments, submission deadlines,
> examination topics and announcements — be extracted from code-switched Hindi–English
> classroom speech; and which combination of techniques, among pattern matching, named-entity
> recognition and LLM-based classification, yields the highest precision under realistic
> classroom conditions?**

Two properties of this formulation are deliberate. First, the comparison between techniques
is the contribution, not the application that demonstrates it; a negative result — for
instance, that a well-prompted general-purpose LLM outperforms an elaborate multi-stage
pipeline — is a valid finding to be reported, not a failure to be concealed. Second, the
formulation asks for precision under realistic conditions rather than under laboratory
conditions, because a system that is confidently wrong about a deadline is worse than no
system at all.

## 1.4 Salient contribution

At the interim stage the project contributes the following.

1. **A problem formulation at an unoccupied intersection.** Chapter 2 establishes, from
   twelve reviewed works, that code-switched ASR research stops at the transcript, that
   commitment detection has been studied on monolingual English business meetings, and that
   educational retrieval systems assume an instructor-supplied document corpus. No reviewed
   work extracts academic commitments from code-switched classroom speech.

2. **An architecture whose central boundary follows from the literature rather than from
   preference.** Because the strongest published result on the nearest analogue task is
   approximately 43 F1 [5], the system is designed so that extraction output is *proposed*
   and only faculty-approved items become visible to students. Extraction error is thereby
   converted from a correctness failure into a review cost.

3. **A working implementation exercised on genuine code-switched lectures,** rather than on
   synthetic or read speech, including a swappable reasoning-provider interface that permits
   two different models to be compared over an identical transcript.

4. **An evidence contract.** Every extracted item stores the verbatim transcript quote and
   the millisecond offsets it derives from, so that any claim the system makes can be checked
   against the recording by a single click. This is what makes faculty review fast enough to
   be realistic.

## 1.5 Organization of report

**Chapter 2** surveys the literature across the four areas that constrain the problem and
derives the research gap and problem statement. **Chapter 3** presents the system
architecture, the processing pipeline and the implementation. **Chapter 4** reports what has
been built and measured at the interim stage, and states plainly what has not. **Chapter 5**
discusses advantages, limitations and applications. The **Conclusion and Future Scope**
sets out the remaining work, of which the annotated evaluation is the most significant.

---

# Chapter 2 — Literature Survey

This chapter reviews the research bearing on the automatic extraction of academic commitments
from code-switched classroom speech. It is organised along the four technical seams the
problem possesses rather than chronologically, because the question each body of work answers
maps to a component the system either implements or deliberately omits. The chapter concludes
by identifying the research gap and deriving the problem statement from it.

## 2.1 Introduction to the overall topic

The recorded lecture resolves availability but not actionability. Converting a recording into
something a student can act upon requires four distinct capabilities: transcribing
code-switched classroom speech into text; identifying, within that text, the utterances that
constitute commitments; extracting those commitments into structured records with resolved
dates; and delivering the result in a form whose claims can be verified. Each capability has
an established literature, and the central observation of this chapter is that these
literatures have not been joined.

Research on code-switched automatic speech recognition treats the transcript as the finished
product [1], [2], [3], [4]. Research on detecting commitments in spontaneous speech is mature
but has been conducted almost exclusively on monolingual English business meetings [5], [6].
Research on large language models for information extraction has advanced rapidly but is
benchmarked on written text in news, scientific and socio-political domains [7], [8].
Research on resolving temporal expressions is well developed for written English news [9],
[10]. Research on grounded question answering in education presupposes a corpus of documents
that an instructor has already uploaded [11]. The problem addressed here sits in the space
between them.

## 2.2 Exhaustive literature survey

### 2.2.1 Code-switched automatic speech recognition for Indian languages

The foundational benchmark for Indian-language ASR under code-switching is the challenge
released by Diwan et al. [1], who assembled approximately 600 hours of transcribed speech
across seven Indian languages, including dedicated Hindi–English and Bengali–English
code-switched subsets. Their published baseline systems reported a word error rate (WER) of
**32.45%** on the code-switching test set against 30.73% on the multilingual set. The value
of this work here is that it quantifies how severely code-switching degrades recognition on
precisely the language pair of interest. Its limitation is equally clear: the work terminates
at the transcript, and no downstream interpretation task is attempted.

Jain and Bhowmick [2] addressed a different weakness in the available resources — speaker
diversity — by constructing VITB-HEBiC, a Hindi–English bilingual corpus of 7.5 hours of read
speech comprising 3,590 utterances and 58,245 words, recorded from speakers drawn from **27
Indian states** with differing mother tongues and accents. Benchmarking modern neural
architectures against this corpus, they found Whisper-medium [4] achieved the lowest word
error rate at **15.7%**, while W2V2-BERT achieved the best character error rate at 6.4%. Read
against [1], the trajectory is encouraging. The caveat is material: VITB-HEBiC consists of
**read speech**, which lacks the disfluency, hesitation, self-correction, overlapping speech
and domain-specific vocabulary of an actual lecture. Error rates on spontaneous classroom
speech should be expected to exceed 15.7%, and [2] is therefore treated here as an optimistic
bound rather than as a prediction.

Bhogale et al. [3] approached the same problem from the direction of evaluation breadth,
collating **Vistaar** as a set of **59 benchmarks** across language and domain combinations
drawn from Kathbath, FLEURS, CommonVoice, IndicTTS, MUCS and GramVaani, and evaluating three
public and two commercial ASR systems against them. They additionally fine-tuned Whisper on
publicly available data across **12 Indian languages totalling 10,700 hours**, producing
IndicWhisper, which achieved the lowest WER on **39 of the 59 benchmarks** with an average
reduction of 4.1 WER. Their methodological argument is directly applicable to this project:
performance on Indian-language speech varies so substantially across domains that a single
benchmark cannot characterise a system. By extension, no published benchmark characterises
performance on lecture speech, which is why this project must construct its own evaluation
set.

The most complete picture of the field is the systematic literature review of Agro et al.
[12], who collected and manually annotated **127 peer-reviewed papers published between 2018
and 2024**, recording the languages, datasets, metrics and model choices of each. Their
findings quantify a concentration usually only asserted: Mandarin–English accounts for
approximately 55% of the literature while **Hindi–English accounts for approximately 11%**,
across 35 unique language pairs and 38 available datasets; roughly 77% of papers use
accessible datasets. They identify four structural gaps — data scarcity, geographic disparity
in coverage, inconsistent evaluation practice, and poor reproducibility. This review matters
here for a methodological reason as much as a substantive one: it allows the claim that
Hindi–English code-switching is comparatively under-served to be stated as a measured finding
from published work rather than as an assertion by the present authors.

### 2.2.2 Detecting commitments in spontaneous speech

The closest published analogue to the task undertaken here is **action item detection** —
identifying, within a recorded multi-party conversation, the utterances that commit someone
to a future task. Murray and Renals [5] established the reference result using the AMI meeting
corpus, applying a supervised logistic regression classifier over prosodic, lexical,
structural and speaker-related features across 138 scenario meetings with 20 held out for
testing. They reported an area under the ROC curve (AUROC) of **0.91 on manual transcripts
and 0.93 on ASR output**, where the recogniser carried a word error rate of **38.9%**.

That comparison is the single most consequential finding in this chapter for system design.
Detection performance did not degrade when the classifier was applied to substantially
erroneous transcripts — a robustness the authors relate to the analogous finding in automatic
speech summarisation. The practical consequence is that transcription quality, while
important, is **not a gate that must be cleared before extraction can be attempted**, and
this conclusion directly governs the sequencing of the present work.

Liu et al. [6] revisited the task with modern pre-trained language models, noting that
annotated data remains scarce: they obtained 101 annotated AMI meetings containing **381
action items**, and released AMC-A, a Chinese meeting corpus of 424 meetings, to address the
shortage. Their method introduced Context-Drop, a contrastive regularisation approach forcing
consistency between predictions made on a focus sentence alone and on the same sentence with
local or global context attached, combined with a lightweight model ensemble initialising
encoder and pooler layers from different pre-trained models. Fine-tuning StructBERT, they
improved positive-class F1 on AMI from a sentence-only baseline of **38.67 to 43.12**, and on
AMC-A from 67.84 to 70.82.

The AMI figure warrants emphasis. After fifteen years of sustained research attention, on
clean monolingual English audio, with annotated in-domain training data, the best reported F1
for detecting action items in meetings is approximately **43**. The task addressed in this
project is harder along every axis: the input is code-switched, no labelled corpus exists,
and the required distinction is finer, since an obligation must be separated from a
suggestion — a separation that action item detection collapses into a single positive class.
Any design for this problem that assumes near-perfect extraction is therefore contradicted by
the literature, and this is the principal justification for the human verification stage
described in Chapter 3.

### 2.2.3 Large language models for information and event extraction

The methodological landscape for extraction has shifted with the arrival of generative
models. Xu et al. [7] survey this shift, categorising the literature by information extraction
subtask — named entity recognition, relation extraction and event extraction — and by
technique, covering zero-shot, few-shot, fine-tuned and distilled approaches. Their synthesis
establishes that generative LLMs now address every information extraction subtask, while
noting that specialised supervised models retain an advantage on certain established
benchmarks. For this project the survey supplies framing rather than a target figure, and it
supports the decision to treat an LLM-based extractor as the primary approach with pattern
matching and named-entity recognition retained as comparison baselines rather than as
sequential pipeline stages.

Because no labelled corpus of annotated Indian lecture transcripts exists, the operative
regime is zero-shot extraction, which makes the work of Parekh et al. [8] directly relevant.
Their DiCoRe framework decomposes zero-shot event detection into three stages: a *Dreamer*
performing open-ended reasoning to maximise recall, a *Grounder* applying finite-state-machine
constrained decoding to align free-form output with the task schema, and an *LLM-Judge* that
verifies candidates to restore precision. Evaluated across six datasets spanning five domains
with nine different LLMs, the approach achieved average F1 gains of **4–7%** over zero-shot,
transfer-learning and reasoning baselines. The architectural lesson — that a high-recall
generative pass should be followed by an explicit precision-restoring verification stage —
transfers directly to the design adopted here. What does not transfer is the evaluation
setting: none of the five domains is education, and none of the input is spontaneous or
code-switched speech.

### 2.2.4 Resolving temporal expressions

Extracting a deadline requires more than detecting that a date was mentioned; the expression
must be resolved to an absolute point in time. Strötgen and Gertz [9] introduced HeidelTime, a
rule-based temporal tagger using regular-expression patterns for extraction together with
knowledge resources and linguistic cues for normalisation, which achieved the best results for
English temporal expression extraction and normalisation in the TempEval-2 challenge. Chang
and Manning [10] subsequently presented SUTIME, a deterministic rule-based tagger distributed
with the Stanford CoreNLP pipeline, reporting on the TempEval-2 English evaluation set a
precision of 0.88, recall of 0.96 and **F1 of 0.92** for identifying the extent of temporal
expressions, against HeidelTime's 0.86.

The more informative number in [10] is the other one. While extent identification reaches 0.92
F1, accuracy on the normalised **value** attribute is **0.82** for SUTIME and 0.85 for
HeidelTime — that is, correctly locating a temporal expression is substantially easier than
correctly resolving what it denotes. This distinction is central to the present problem.
Classroom deadlines are overwhelmingly expressed relatively — "next Thursday," "by the end of
this week," "before the mid-terms" — and their resolution depends on the lecture date, on the
academic calendar, and sometimes on a prior lecture. Both [9] and [10] operate on written
English news text with a reliable document creation time; neither addresses code-switched
speech, where a temporal expression may itself be code-switched ("agle Friday tak"). This
report treats deadline normalisation as an identified and currently unsolved sub-problem
rather than as a solved input, and Chapter 4 records that the present data model does not yet
store a resolved due date — deliberately, since rendering a fabricated date would violate the
project's central design commitment.

### 2.2.5 Verified delivery and human-in-the-loop review

The final seam concerns how extracted information reaches students without introducing the
fabrication risk that accompanies generative models. Li et al. [11] provide a systematic
survey of retrieval-augmented generation (RAG) in education, reviewing interactive learning
systems, the generation and assessment of educational content, and large-scale deployment
across educational ecosystems, and identifying hallucination, static internal knowledge, the
completeness and timeliness of retrieved material, and computational cost as the field's open
challenges. The pattern common to the systems they survey is decisive here: in each case the
knowledge base is assembled from **material an instructor has uploaded**. Its existence
presupposes deliberate faculty effort, and no surveyed system constructs its knowledge base
from what was said in class.

Where automated output cannot be trusted unconditionally, the established response is
selective human review. Korthals et al. [13] present SURE, a human-in-the-loop pipeline for
LLM-based grading that combines repeated prompting for self-consistency, uncertainty-based
flagging of unreliable items, and selective human re-grading of only the flagged subset. The
principle generalises directly to the present system: rather than accepting or rejecting
automated output wholesale, route it by confidence, and spend scarce human attention only
where the model is uncertain. This is the literature's endorsement of the review-queue design
in Chapter 3, and the ordering of that queue by confidence is taken directly from it.

## 2.3 Comparative summary

**Table 2.1** Comparison of reviewed literature

| Ref | Author, Year, Venue | Problem addressed | Dataset | Method | Reported result | Limitation for the present work |
|---|---|---|---|---|---|---|
| [1] | Diwan et al., 2021, Interspeech | ASR benchmark for Indian languages including code-switching | ~600 h, 7 languages; Hi–En, Bn–En code-switched subsets | Multilingual and code-switching baseline recipes | WER 32.45% (code-switching); 30.73% (multilingual) | Stops at the transcript; no downstream interpretation |
| [2] | Jain & Bhowmick, 2024, *Applied Acoustics* | Accent-diverse Hindi–English corpus and ASR benchmark | VITB-HEBiC: 7.5 h, 3,590 utterances, 27 states | Whisper, Wav2Vec2.0, XLSR-53, W2V2-BERT, IndicWav2Vec | Whisper-medium WER 15.7%; W2V2-BERT CER 6.4% | Read speech, not spontaneous lecture speech; optimistic bound |
| [3] | Bhogale et al., 2023, Interspeech | Diverse benchmarks and training sets for Indian ASR | Vistaar: 59 benchmarks; 10.7 K h training, 12 languages | Fine-tuned Whisper → IndicWhisper | Lowest WER on 39/59 benchmarks; avg. reduction 4.1 WER | No lecture-domain benchmark exists; we must build our own |
| [5] | Murray & Renals, 2008, MLMI (LNCS 5237) | Action item detection in spontaneous speech | AMI corpus, 138 scenario meetings, 20 test | Logistic regression over prosodic, lexical, structural, speaker features | AUROC 0.91 (manual); **0.93 (ASR @ 38.9% WER)** | Monolingual English business meetings; ranking metric conceals precision difficulty |
| [6] | Liu et al., 2023, IEEE ICASSP | Supervised action item detection with pre-trained models | 101 AMI meetings / 381 action items; releases AMC-A (424 meetings) | StructBERT + Context-Drop + lightweight model ensemble | AMI positive F1 **38.67 → 43.12**; AMC-A 67.84 → 70.82 | Best analogue result ≈43 F1 *with* training data; obligation vs. suggestion not distinguished |
| [7] | Xu et al., 2024, *Frontiers of Computer Science* | Survey of LLM-based generative information extraction | Survey of the generative IE literature | Taxonomy by subtask (NER, RE, EE) and technique | LLMs span all IE subtasks; supervised specialists still lead some benchmarks | Written-text benchmarks; no speech, no educational domain |
| [8] | Parekh et al., 2025, EMNLP | Zero-shot event detection without labelled data | 6 datasets, 5 domains, 9 LLMs | Dreamer → Grounder (constrained decoding) → LLM-Judge | **4–7% average F1 gain** over zero-shot and transfer baselines | No educational domain; written text, not code-switched speech |
| [9] | Strötgen & Gertz, 2010, SemEval | Rule-based temporal expression extraction and normalisation | TempEval-2 | Regex patterns + knowledge resources and linguistic cues | Best English extraction and normalisation in TempEval-2 | Written English news with reliable document creation time |
| [10] | Chang & Manning, 2012, LREC | Temporal tagging library (SUTIME) | TempEval-2 English evaluation set | Deterministic rule-based, extensible | Extent P 0.88 / R 0.96 / **F1 0.92**; **value accuracy only 0.82** | Locating a date is far easier than resolving it; no speech, no code-switching |
| [11] | Li et al., 2025, *Computers and Education: AI* | Systematic survey of RAG in education | Survey of educational RAG systems | Review of learning systems, content generation, deployment | Hallucination, static knowledge, retrieval completeness, cost named as open challenges | Every system grounds in **faculty-uploaded documents**; none builds its corpus from classroom speech |
| [12] | Agro et al., 2025, arXiv:2507.07741 | Systematic review of code-switching ASR | 127 peer-reviewed papers, 2018–2024; 35 pairs, 38 datasets | Manual annotation of languages, data, metrics, models | Mandarin–En ≈55%; **Hindi–En ≈11%**; ~77% accessible data | Review only; names data scarcity and inconsistent evaluation as open gaps |
| [13] | Korthals et al., 2026, *Machine Learning and Knowledge Extraction* | Reliable LLM grading with selective human review | Short-answer grading | SURE: self-consistency + uncertainty flagging + selective human re-grading | Higher accuracy with reduced human workload | Grading, not extraction; supports confidence-ordered review as a principle |

## 2.4 Research gap

Reading Table 2.1 across rows rather than down columns, four conclusions follow.

First, **transcription of code-switched Hindi–English speech is a managed risk rather than a
blocking constraint.** The WER trajectory from 32.45% [1] to 15.7% [2] is favourable, and
Murray and Renals [5] demonstrate that commitment detection is substantially robust to
recognition error, holding at 0.93 AUROC over transcripts carrying 38.9% WER. Recognition
quality must be measured and reported, but need not be solved first.

Second, **the extraction problem is genuinely unsolved, and the literature's honest figure is
low.** The strongest reported supervised result on the closest analogue task is approximately
43 F1 [6], obtained under conditions more favourable than those of this project in every
respect. This is a finding about task difficulty, not about method quality, and a design that
tolerates imperfect extraction is the response the literature supports.

Third, **resolving a deadline is a distinct and harder problem than detecting one.** The gap
between 0.92 F1 for locating a temporal expression and 0.82 accuracy for resolving its value
[10] is measured on written English news with a known document date. Spoken, relative,
sometimes code-switched classroom deadlines are strictly harder, and this project does not
claim to have solved that sub-problem.

Fourth, **the reviewed literatures have not been joined.** Agro et al. [12] measured that
Hindi–English constitutes approximately 11% of a 127-paper code-switching literature that
treats the transcript as its output. Murray and Renals [5] and Liu et al. [6] extract
commitments, but from monolingual English business meetings. Xu et al. [7] and Parekh et al.
[8] establish that generative and zero-shot extraction are viable, on written text in
non-educational domains. Li et al. [11] show that grounded educational question answering
depends on a document corpus that faculty must supply.

Accordingly, the gap is stated as follows:

> We identified no published work that extracts structured academic commitments —
> assignments, submission deadlines and examination topics — from code-switched Hindi–English
> classroom speech, and no evaluation set exists for that task. The adjacent literatures each
> address one component of the problem: code-switched ASR terminates at the transcript,
> action item detection operates on monolingual English business speech, temporal
> normalisation is developed for written news text, and educational RAG presupposes an
> uploaded document corpus.

The claim is deliberately expressed as an absence of located evidence rather than as a claim
of priority, which the scope of any feasible search cannot support. The problem statement in
Section 1.3 follows directly from this gap.

**Chapter summary.** This chapter reviewed twelve works across four areas. Code-switched ASR
for Hindi–English has improved markedly but remains under-represented and stops at the
transcript. Commitment detection in spontaneous speech is established and demonstrably robust
to recognition error, yet the strongest reported result on the nearest analogue task remains
approximately 43 F1 on monolingual English. Temporal expression resolution is substantially
harder than temporal expression detection. LLM-based extraction, including zero-shot, is
viable but evaluated on written text outside education. Grounded delivery in education
presupposes a faculty-supplied corpus. Chapter 3 presents the methodology adopted in response.

---

# Chapter 3 — Methodology and Implementation

This chapter describes the system architecture, the processing pipeline, and the state of
implementation. The design follows from Chapter 2 in one specific respect that governs
everything else, and that respect is stated first.

## 3.1 Block diagram

**The load-bearing design decision.** Because the literature establishes that extraction from
spontaneous speech is unreliable — approximately 43 F1 on an easier task with training data
[6] — the system is organised around a single boundary between **proposed** and **approved**
knowledge. Extraction writes proposals. Only a faculty approval action promotes a proposal to
an approved item, and only approved items are visible to students. Three consequences follow,
and together they constitute the architectural argument of this project:

1. An extraction error cannot surface to a student as a wrong deadline; it surfaces to
   faculty as a rejected proposal.
2. The extractor can be replaced entirely — a different model, a different prompt, a
   different provider — without altering anything a student sees.
3. Every faculty decision is a labelled data point, accumulating a correction corpus usable
   for regression testing and few-shot exemplars.

[**FIGURE 3.1 — System block diagram.** Draw this in draw.io or PowerPoint and export as PNG.
Caption *below* the figure, Times New Roman 10 pt: "Fig 3.1 System block diagram". Layout:
seven boxes left to right — Ingest → Transcription → Extraction → Knowledge Store → Review
Queue → Retrieval & Q&A → Web Interfaces. Draw a heavy vertical line between Review Queue and
Retrieval, labelled "the proposed/approved boundary", with the note "nothing crosses without
faculty approval". Show Transcription and Extraction each sitting behind a dashed box labelled
"swappable provider interface".]

The components are as follows.

**1 — Ingest.** Accepts an audio file, stores it in private object storage, records the course
and date it belongs to, and queues a processing job. Upload is separated from processing
because upload must succeed immediately while processing takes minutes; combining them makes
a slow transcription indistinguishable from a broken website.

**2 — Transcription.** Converts audio to text with millisecond timestamps.
Interface: `transcribe(audio) → [{text, start_ms, end_ms}]`. Implemented against Sarvam,
chosen for Indian-language and code-switching support, with a fixture provider used for
development so that the system can be exercised without incurring API cost. Nothing downstream
knows which provider ran.

**3 — Extraction.** Converts a transcript into proposed knowledge items with a source span.
Interface: `extract(transcript, lecture_date) → [ProposedItem]`. The lecture date is passed in
because "next Thursday" cannot be resolved without it. Implemented against a reasoning-provider
abstraction so that alternative models can be compared over an identical transcript — this
interface is what makes the research comparison cheap, since without it comparing approaches
would mean maintaining parallel systems.

**4 — Knowledge store.** PostgreSQL via Supabase, holding courses, lectures, transcripts,
knowledge items, evidence spans, review decisions and conversations, with row-level security
enforcing access.

**5 — Review queue.** Presents proposals to faculty for approval, editing or rejection. The
design constraint is a time budget: under five minutes of faculty attention per lecture. This
budget, not aesthetics, dictates the interface — ordering by confidence, showing the
supporting quote inline so that verification needs no navigation, and offering a single
primary action per item. The ordering-by-confidence principle follows [13].

**6 — Retrieval and question answering.** Answers student questions from approved items only,
with every answer citing the transcript span it derives from. The governing rule is that there
is no answer without a source: where retrieval finds nothing relevant, the system states that
the topic was not mentioned rather than generating a plausible guess. This directly addresses
the hallucination challenge named in [11].

**7 — Web interfaces.** A single responsive application presenting a class shell with four
destinations — Home, Ask, Lectures and Assignments — with faculty-only affordances appearing
inside those destinations rather than as a separate application.

## 3.2 Hardware description

This project has no custom hardware. The only hardware dependency is the audio capture device
used to record a lecture, and the system is deliberately agnostic to it: any device producing
a standard audio file is acceptable, and the recording platform is explicitly out of scope
(Section 1.2). Development and deployment use commodity cloud infrastructure.

*(A.8 prescribes a hardware description because the template serves hardware projects as well
as software ones. Stating plainly that the project has no custom hardware, and why, is the
correct response — an invented hardware section would be padding.)*

## 3.3 Software description, flowchart and algorithm

### 3.3.1 Technology stack

**Table 3.1** Technology stack and rationale

| Layer | Choice | Rationale |
|---|---|---|
| Web framework | Next.js 16 with React 19 | Server rendering and API routes in one deployable unit; very large documentation base |
| Language | TypeScript throughout | A single language across the stack for a three-person team learning as it builds |
| Database | PostgreSQL via Supabase | Managed, with row-level security available at the database rather than only in application code |
| Object storage | Supabase Storage, private bucket | Audio never becomes publicly addressable; access is via signed URLs only |
| Authentication | Supabase Auth | Integrated with the database; roles are `student` and `faculty` |
| Transcription | Sarvam ASR behind a provider interface | Built for Indian languages and code-switching; a fixture provider enables zero-cost development |
| Reasoning | Provider abstraction (`src/lib/reasoning/`) | Permits comparison of models over an identical transcript; a missing provider is an error, never a silent fallback |
| Hosting | Vercel | Free tier covers the capstone |

A deliberate deviation from the original design is recorded here. The initial architecture
specified a separate Python service for the machine-learning work. Implementation consolidated
on TypeScript once the extraction approach settled on hosted LLM APIs behind an interface,
since no local model execution was required. For a three-person team learning while building,
eliminating a second language and a second deployment target was judged the larger benefit.
This is a documented change, not an accident.

### 3.3.2 The knowledge model

Extraction does not produce free text. It produces typed items, each classified along two
axes, and each carrying at least one evidence span.

**Table 3.2** Knowledge item categories and kinds

| Axis | Values | Meaning |
|---|---|---|
| Category | `actionable`, `teaching` | Whether the item obliges a student to do something, or explains subject matter |
| Kind | `assignment`, `concept`, `procedure`, `comparison`, `topic` | The item's shape, determining how it is displayed |
| Status | `auto`, `confirmed`, `rejected` | Position relative to the proposed/approved boundary |

The `actionable`/`teaching` split is the data-model expression of the distinction Chapter 2
identified as the substance of the problem — the separation of obligations from explanation
that action item detection collapses into a single class [5], [6].

Every item stores one or more **evidence** records containing the verbatim transcript quote,
its character offsets within the transcript, and its start and end times in milliseconds. This
is the evidence contract, and it is what makes both faculty review and student trust possible:
any claim the system makes can be checked against the recording in one click.

### 3.3.3 Processing algorithm

[**FIGURE 3.2 — Processing pipeline.** Render as a flowchart. Caption below, TNR 10 pt.]

```
1.  Faculty uploads an audio file to a course
2.  Server validates type and size; stores in the private bucket; creates a lecture row
        status ← uploaded
3.  Processing job claims the lecture (single-flight claim prevents duplicate paid work)
        status ← transcribing
4.  Transcription provider returns segments with millisecond timestamps
        persist transcript; status ← transcribed
5.  Transcript is divided into overlapping windows sized to the model's context limit
6.  For each window, the reasoning provider proposes knowledge items, each required to
        return a verbatim quote from the window
7.  Each returned quote is located in the transcript to recover exact offsets and times
        a quote that cannot be located is DISCARDED, not stored with an approximate span
8.  Items are de-duplicated across window overlaps
9.  Items are persisted with status = auto  ← the proposed side of the boundary
10. Faculty reviews the queue: approve → status = confirmed; reject → status = rejected
11. Only confirmed items are visible to students, and only they are retrievable by Ask
```

Step 7 deserves emphasis because it is a deliberate and costly choice. An item whose
supporting quote cannot be located exactly in the transcript is discarded rather than stored
with an approximate timestamp. This reduces recall. It is accepted because a citation that
does not land on the right moment is worse than no citation: it teaches the user that
citations cannot be trusted, which destroys the only mechanism by which the system's claims
can be verified.

### 3.3.4 Cost control

Because both transcription and reasoning are billed third-party APIs, spend control is a
functional requirement rather than an operational detail. Three mechanisms are implemented: a
fixture transcription provider allowing the full pipeline to run without ASR cost; a
single-flight claim on the processing job so that concurrent requests cannot bill twice for
the same lecture; and rate limiting on the routes that reach billed providers. A missing
reasoning provider raises an explicit error rather than silently falling back to a paid one.

---

# Chapter 4 — Results and Analysis

This chapter reports what has been built and measured at the interim stage. It also states
plainly what has not been measured, which at this stage is the project's headline quantitative
claim.

## 4.1 Implementation status

A working system exists and has been exercised end to end on real code-switched lectures. The
implemented surface comprises: authentication with student and faculty roles; course creation
and enrolment by join code; audio upload to private storage; transcription with millisecond
timestamps; windowed LLM extraction into the typed knowledge model; the faculty review queue
with approve, edit and reject; a course-scoped question-answering surface with per-answer
citations; persistent conversations; and a lecture detail view that seeks the audio to the
moment a cited quote was spoken.

Against the Review-2 expectation of 50–60% completion, the assessment is that the *system*
is substantially complete for the capstone's declared scope, while the *evaluation* — which
is the research contribution — has not begun. This is an honest and slightly unusual position:
the engineering is ahead of the science.

## 4.2 Extraction output on real lectures

Two genuine code-switched lectures have been processed end to end. Both are ordinary recorded
university teaching, not scripted or read material, and both exhibit natural Hindi–English
mixing — one transcript segment reads "Transformation matrix. Theek hai? Two coordinate
transformation matrix."

**Table 4.1** Extraction output on two real lectures

| Lecture | Subject | Items extracted | Evidence spans | Actionable | Teaching | Kinds represented |
|---|---|---|---|---|---|---|
| A (`dfd7312d`) | Cloud infrastructure / resource management | 26 | 35 | 2 | 24 | concept (17), topic (4), comparison (3), assignment (2) |
| B (`87a4a143`) | Robotics — transformation matrices | 4 | 10 | 1 | 3 | procedure (2), concept (1), assignment (1) |

Three observations follow. The system does detect assignments in genuine code-switched
speech — Lecture A yielded two actionable items and Lecture B one, each carrying a verbatim
supporting quote and a timestamp. The distribution is heavily weighted toward teaching content,
which is expected, since a typical lecture contains far more explanation than instruction, and
it confirms that the `actionable`/`teaching` split is doing useful work rather than being
ceremony. The difference in yield between lectures (26 against 4) reflects lecture length and
content density and must not be read as a quality measure — without ground-truth annotation it
is not known how many items *should* have been extracted from either.

## 4.3 Provider comparison

Because extraction sits behind a provider interface (§3.1), the same transcript can be
processed by different reasoning models and the outputs compared directly. Lecture A was
processed twice.

**Table 4.2** Provider comparison on an identical transcript (Lecture A)

| Provider | Items | Evidence spans | Actionable items | Distinct kinds |
|---|---|---|---|---|
| Provider 1 (Sarvam, 2026-09-01) | 24 | 28 | 1 | concept, comparison, topic, procedure, assignment |
| Provider 2 (Gemini, 2026-09-06) | 26 | 35 | 2 | concept, comparison, topic, assignment |

The second configuration produced more items, materially more evidence spans (35 against 28,
a 25% increase in citation density), and detected an additional actionable item. Because no
ground truth exists for this lecture, **this comparison establishes difference, not
superiority** — a higher item count is consistent with better recall and equally consistent
with over-extraction. What the comparison does demonstrate is that the provider abstraction
functions as designed: swapping the reasoning model required no change to storage, retrieval
or interface code, which is the precondition for the technique comparison that the problem
statement requires.

## 4.4 System verification

**Table 4.3** Automated verification

| Category | Coverage | Result |
|---|---|---|
| Functional suites (extraction, transcript, reconstruction, knowledge planning, navigation, conversations) | 12 suites, offline over stored fixtures | 766 assertions, 0 failures |
| Authenticated security testing | Cross-user isolation, role escalation, resource authorisation, row-level security under real user tokens, forged tokens | 145 assertions, 0 failures |
| **Total** | | **911 assertions, 0 failures** |
| Static analysis | TypeScript compilation, ESLint, production build | Clean |
| Storage posture | Bucket privacy, audio-only MIME restriction, 50 MB cap | Verified |
| Build secrets | No server secret present in the client bundle | Verified |

The security testing was conducted against a production build with the provider API keys
blanked, so that no request could incur spend. Test accounts were created through the real API
and deleted afterwards, with cleanup asserting that no seeded object, course or profile
survived.

## 4.5 Development timeline

Table 4.4 records the work actually carried out, week by week, from project initiation to the
mid-term review. It is presented against the plan submitted at Review 1.

**Table 4.4** Development timeline, Weeks 1–7

| Week | Phase | Work completed |
|---|---|---|
| 1 | Problem identification and research | Identified the problem — academic information stated aloud in lectures is missed or forgotten. Surveyed existing lecture-capture, transcription and AI learning tools and established that they transcribe speech without extracting structured academic information. Researched Hindi–English code-switching in classroom speech. Shortlisted Sarvam AI for Indian-language recognition. Defined the initial problem statement and objectives; prepared the synopsis. |
| 2 | Planning and system architecture | Defined scope, requirements and roadmap. Designed the system architecture and data flow. Planned the capture, storage, transcription and processing workflow. Designed the initial database schema for lectures and transcription jobs. Defined the knowledge, evidence and provenance requirements. Compared technology options and documented the major decisions with their trade-offs. Held architecture reviews before development began. |
| 3 | Backend and infrastructure | Built the initial application in Next.js and TypeScript. Provisioned Supabase for database and object storage. Designed the asynchronous lecture-processing workflow. Built the audio upload API and storage workflow, using signed URLs for direct browser-to-storage upload so that audio never passes through the application server. Added server-side transcription job handling, storage and database validation. |
| 4 | Documentation and system review | Audited documentation against what had actually been built and corrected mismatches between planned and implemented architecture. Refined the separation between the Experiment Platform and the Product Platform. Revisited earlier technical decisions and improved the design. Reviewed the knowledge model ahead of AI integration and established a structured development and validation process. |
| 5 | Transcription pipeline and first deployment | Integrated Sarvam AI speech-to-text (Saarika / Batch API). Completed the Upload → Storage → Transcription → Transcript pipeline with asynchronous processing and status polling. Added provenance tracking recording which model, mode and settings produced each transcript. Built the lecture library and a timestamped transcript viewer. Deployed V1 to Vercel with Google OAuth sign-in and public privacy and terms pages. Tested on real classroom recordings and identified Hinglish language-detection issues. |
| 6 | Knowledge engine and provider comparison | Extended the system beyond transcription into an academic knowledge engine. Designed lecture segmentation and structured knowledge extraction. Compared reasoning providers on output quality, reliability, token usage and cost, and integrated the Gemini API behind a provider abstraction so the model remains swappable. Implemented evidence-grounded extraction in which every extracted item is backed by a verbatim quote with provenance. Added validation of structured output and evaluated extraction on real transcripts. |
| 7 | Assistant and product development | Built the Ask assistant with global, course and lecture-level scoping. Implemented grounded answers citing supporting evidence. Built a persistent multi-turn conversation workspace. Implemented cost-aware routing and per-request usage metering so that cheaper lookups bypass the paid model and every paid call is measured. Restructured the product around a class-based layout and refined the course and lecture screens through product and interface walkthroughs. |

Two observations on the timeline. Development proceeded broadly to plan on the engineering
track, and in two respects ahead of it — deployment was achieved in Week 5 against a plan that
placed it later, and the provider abstraction introduced in Week 6 was not in the original
design but has since become the mechanism on which the project's central technique comparison
depends. The evaluation track, by contrast, has not started, and Section 4.6 states the
consequences of that directly.

## 4.6 What has not yet been measured

This section is deliberate. The project's central claim is a quantitative one, and it cannot
yet be made.

**No precision or recall figure exists**, because no annotated ground truth exists. Producing
one requires a corpus of fifteen or more real lectures, each annotated by hand with the
academic commitments it actually contains, against which extraction output can be scored. That
corpus does not exist, and building it is the single largest remaining task.

**No transcription accuracy figure exists** for this system on lecture speech. The WER figures
cited in Chapter 2 are from published benchmarks on other corpora — and, in the case of
VITB-HEBiC [2], on read rather than spontaneous speech.

**The baseline comparison has not been run.** The problem statement asks which combination of
pattern matching, named-entity recognition and LLM classification performs best. Only the LLM
path is implemented; the two baselines exist as an interface contract, not as code.

**Deadline resolution is not implemented.** Consistent with Section 2.2.4, the data model does
not currently store a resolved due date, and the interface renders none. This is a deliberate
omission rather than an oversight: displaying a fabricated date would violate the project's
central commitment, and correct relative-date resolution over code-switched speech is an
unsolved sub-problem.

The precision targets of 92%, 90% and 85% appearing in the project synopsis were written
before any lecture had been processed and are **not** carried into this report as claims. In
light of [6], where the best published supervised result on an easier task is approximately 43
F1, those figures should be treated as aspirations pending measurement.

---

# Chapter 5 — Advantages, Limitations and Applications

## 5.1 Advantages

**Verifiability by construction.** Every extracted item stores a verbatim quote and
millisecond offsets, and any item whose quote cannot be located exactly is discarded. A user
can therefore check any claim against the recording in one action. Most systems in this space
ask to be trusted; this one can be checked.

**Extraction error cannot reach a student.** The proposed/approved boundary means an error
becomes review workload rather than a wrong deadline. This is what makes the system's
approximately-43-F1 problem [6] a manageable engineering position rather than a fatal one.

**The research comparison is cheap.** Because transcription and reasoning sit behind
interfaces, comparing models means changing configuration, not maintaining parallel systems.
Section 4.3 demonstrates this working.

**Faculty cost is bounded by design.** The review queue targets under five minutes per
lecture. If review took longer than typing the assignment into an LMS, the product would have
failed regardless of extraction quality.

**No faculty preparation is required.** Unlike every educational RAG system surveyed in [11],
the knowledge base is built from the lecture as delivered, not from documents someone
uploaded.

## 5.2 Limitations

**No quantitative accuracy claim can currently be made** (§4.5). This is the principal
limitation.

**Deadline resolution is unsolved and unimplemented.** Assignments are detected; their due
dates are not resolved to absolute times (§2.2.4).

**Evaluated on two lectures, in two subjects, from a small number of speakers.** Nothing about
generalisation across subjects, accents or teaching styles has been established.

**Only the LLM extraction path exists.** The comparison the problem statement requires is not
yet possible.

**Dependence on third-party billed APIs.** Both transcription and reasoning are external paid
services, which constrains experiment volume and introduces a data-handling consideration,
since transcripts leave the project's own infrastructure.

**No consent or data-protection position is in place.** Classroom audio captures identifiable
students, not only the lecturer, and India's Digital Personal Data Protection Act, 2023 [14]
applies to such processing. This must be resolved before recording at scale.

**No institutional partnership.** The fifteen-lecture evaluation corpus requires
institutional permission, and this has the longest lead time of any remaining item.

## 5.3 Applications

**Immediate.** A course-level companion for recorded lectures, giving students a verified list
of commitments and a search surface that cites its sources, and giving faculty a short review
in place of manual data entry.

**Institutional.** Because faculty approval produces a structured, timestamped, auditable
record of what was announced when, the same data supports departmental coordination — for
instance, identifying weeks in which several courses have converged deadlines.

**Methodological.** The annotated lecture corpus produced for evaluation would itself be a
contribution: Agro et al. [12] identify data scarcity as one of the four structural gaps in
code-switching research, and no lecture-domain Hindi–English benchmark presently exists.

**Beyond Hindi–English.** The architecture does not assume a language pair. Extending to other
Indian languages requires annotation effort rather than redesign — deliberately excluded from
capstone scope (§1.2), and a natural continuation.

---

# Conclusion and Future Scope

## Conclusion

This project set out to determine how accurately structured academic commitments can be
extracted from code-switched Hindi–English classroom speech. A survey of twelve works
established that the problem lies at an intersection the literature has not occupied:
code-switching research terminates at the transcript [1], [2], [3], [12]; commitment detection
is developed on monolingual English business meetings [5], [6]; temporal resolution is
developed for written news [9], [10]; and educational retrieval presupposes a
faculty-uploaded corpus [11]. The survey also established the problem's difficulty
quantitatively: the strongest published result on the nearest analogue task is approximately
43 F1 [6], on materially easier input.

That finding shaped the architecture rather than discouraging it. The system is built around a
boundary between proposed and approved knowledge, so that extraction error becomes faculty
review workload rather than incorrect information shown to a student, and around an evidence
contract requiring every claim to carry a verbatim quote and an exact timestamp.

At the interim stage the implementation is working and has been exercised on two genuine
code-switched lectures, producing typed, evidence-linked items including detected assignments,
and verified by 911 automated assertions with no failures. A provider comparison over an
identical transcript demonstrates that the abstraction enabling the project's research
comparison functions as designed.

The project's central quantitative claim remains unmade. No precision or recall figure exists,
because no annotated ground truth exists. The engineering is ahead of the science, and closing
that gap is the work that remains.

## Future Scope

In priority order.

1. **Build the annotated evaluation corpus.** Fifteen or more real lectures, hand-annotated
   with the commitments they contain. Everything quantitative depends on this, and it has the
   longest lead time because it requires institutional permission and consent.
2. **Establish a consent and data-protection position** under the DPDP Act, 2023 [14],
   covering student voices captured incidentally and the transmission of transcripts to
   third-party providers. Required before recording at scale, not after.
3. **Measure precision and recall,** per category and per kind, and report failure modes
   honestly, including where and why the system errs.
4. **Implement the comparison baselines** — pattern matching and named-entity recognition —
   and run all three approaches over identical transcripts. This answers the second half of
   the problem statement, and a result favouring the simplest approach is a valid finding.
5. **Address deadline resolution,** informed by [9] and [10], including the case of
   code-switched temporal expressions, which neither system was designed for.
6. **Measure transcription accuracy** on lecture speech specifically, to establish how far
   the read-speech figures of [2] overstate real performance.
7. **Extend cross-lecture commitment tracking,** so that a deadline revised in a later lecture
   updates the original item rather than creating a conflicting second one.
8. **Prepare a research paper** on the task formulation and the evaluation corpus, per the
   Review-3 requirement.

---

# References

[1] A. Diwan, R. Vaideeswaran, S. Shah, A. Singh, S. Raghavan, S. Khare, V. Unni, S. Vyas,
A. Rajpuria, C. Yarra, A. Mittal, P. K. Ghosh, P. Jyothi, K. Bali, V. Seshadri, S. Sitaram,
S. Bharadwaj, J. Nanavati, R. Nanavati, K. Sankaranarayanan, T. Seeram, and B. Abraham,
"Multilingual and code-switching ASR challenges for low resource Indian languages," in *Proc.
Interspeech*, 2021. arXiv:2104.00235.

[2] P. Jain and A. Bhowmick, "VITB-HEBiC: A bilingual corpus for evaluating ASR in diverse
Indian code-switching scenarios," *Applied Acoustics*, art. 110119, 2024.
doi: 10.1016/j.apacoust.2024.110119.

[3] K. Bhogale, S. Sundaresan, A. Raman, T. Javed, M. M. Khapra, and P. Kumar, "Vistaar:
Diverse benchmarks and training sets for Indian language ASR," in *Proc. Interspeech*, 2023.
arXiv:2305.15386.

[4] A. Radford, J. W. Kim, T. Xu, G. Brockman, C. McLeavey, and I. Sutskever, "Robust speech
recognition via large-scale weak supervision," in *Proc. Int. Conf. Machine Learning (ICML)*,
2023. arXiv:2212.04356.

[5] G. Murray and S. Renals, "Detecting action items in meetings," in *Machine Learning for
Multimodal Interaction (MLMI)*, LNCS 5237, Springer, 2008, pp. 208–213.

[6] J. Liu, C. Deng, Q. Zhang, Q. Chen, and W. Wang, "Meeting action item detection with
regularized context modeling," in *Proc. IEEE ICASSP*, Rhodes, Greece, 2023.
arXiv:2303.16763.

[7] D. Xu, W. Chen, W. Peng, C. Zhang, T. Xu, X. Zhao, X. Wu, Y. Zheng, Y. Wang, and E. Chen,
"Large language models for generative information extraction: A survey," *Frontiers of
Computer Science*, 2024. doi: 10.1007/s11704-024-40555-y.

[8] T. Parekh, K. Mehta, N. Mehrabi, K.-W. Chang, and N. Peng, "DiCoRe: Enhancing zero-shot
event detection via divergent-convergent LLM reasoning," in *Proc. EMNLP*, Suzhou, China,
2025.

[9] J. Strötgen and M. Gertz, "HeidelTime: High quality rule-based extraction and
normalization of temporal expressions," in *Proc. 5th Int. Workshop on Semantic Evaluation
(SemEval)*, 2010, pp. 321–324.

[10] A. X. Chang and C. D. Manning, "SUTIME: A library for recognizing and normalizing time
expressions," in *Proc. 8th Int. Conf. Language Resources and Evaluation (LREC)*, 2012.

[11] Z. Li, Z. Wang, W. Wang, K. Hung, H. Xie, and F. L. Wang, "Retrieval-augmented generation
for educational application: A systematic survey," *Computers and Education: Artificial
Intelligence*, vol. 8, art. 100417, 2025. doi: 10.1016/j.caeai.2025.100417.

[12] M. T. Agro, A. Kulkarni, K. Kadaoui, Z. Talat, and H. Aldarmaki, "Code-switching in
end-to-end automatic speech recognition: A systematic literature review," arXiv:2507.07741,
2025.

[13] L. Korthals, E. Akrong, G. Geller, H. Rosenbusch, R. Grasman, and I. Visser, "Towards
reliable LLM grading through self-consistency and selective human review: Higher accuracy,
less work," *Machine Learning and Knowledge Extraction*, vol. 8, no. 3, art. 74, 2026.

[14] The Digital Personal Data Protection Act, 2023, No. 22 of 2023, Government of India,
Ministry of Electronics and Information Technology, 11 August 2023.

[15] J. Carletta et al., "The AMI meeting corpus: A pre-announcement," in *Machine Learning
for Multimodal Interaction (MLMI)*, LNCS 3869, Springer, 2006, pp. 28–39.
**[VERIFY volume and page numbers before submission — cited as the dataset underlying [5]
and [6].]**

---

# Appendix A — Soft Code Flowcharts

[Insert the rendered flowcharts. At minimum: the processing pipeline of §3.3.3, the review
decision flow, and the question-answering retrieval path. Number figures continuing from
Chapter 4.]

# Appendix B — Data Sheets

[Not applicable — no hardware components. Either state this explicitly or repurpose the
appendix for the knowledge-model schema: the table definitions for lectures, transcripts,
knowledge items, evidence and review decisions. The schema is the closest analogue to a data
sheet for a software project, and an examiner will find it more useful than a blank page.]

# Appendix C — List of Components

[Not applicable in the hardware sense. Repurpose as the software component inventory: the
dependency list with versions, the external services used, and the API route inventory.]

# Appendix D — List of Papers Presented and Published

[None at the interim stage. State this plainly. Note that Review 3 carries up to 10 marks for
a Scopus-indexed publication, accepted or submitted, with plagiarism — including AI
similarity — under 10%; see Future Scope item 8.]

---

## Submission checklist

Before printing and signing:

- [ ] Every `[SQUARE BRACKET]` placeholder filled, especially the title, names, roll numbers,
      SAP IDs and mentor name
- [ ] Project title decided (see the note on the title page) and identical on the title page,
      the certificate and every page header
- [ ] Figures 3.1, 3.2, 3.3 drawn and inserted; screenshots 4.1 and 4.2 captured
- [ ] All figure captions **below** the figure, 10 pt; all table captions **above** the table,
      10 pt
- [ ] Page numbering: Roman for front matter, decimal from Chapter 1; Table of Contents
      regenerated after pagination
- [ ] Header: project title left, academic year right. Footer: page number, right
- [ ] Reference [15] volume and page numbers verified; [2] and [11] verified through the
      college library
- [ ] Every reference cited in the text, and every in-text citation present in the list
- [ ] Each chapter opens with an introductory paragraph and closes with a summary (A.8 §20)
- [ ] One conclusion only, at the end of the report (A.8 §21)
- [ ] Soft copy verified by the mentor **before** the hard copy is signed
- [ ] Mentor's signature obtained
- [ ] Soft copy (PDF) uploaded to the submission link from the department mail
