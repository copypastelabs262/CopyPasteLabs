# Chapter 2 — Literature Survey

**Draft for the Interim Report (Capstone Review 2), 2026-27.**
Derived from `Projects/classmind/.knowledge/literature-survey.md`, which is the source of
truth and holds the verification notes for every figure cited here.

**Formatting when moved into Word** (Annexure A.8): body Times New Roman 12, line spacing
1.5, left margin 1.5", others 1"; chapter title 18pt bold, section titles 14pt bold,
subsection titles 12pt bold; **table captions above the table** in Times New Roman 10;
header carries the project title (left) and academic year (right); footer page number
(right). Citations are numbered and appear in the reference list at the same number.

---

## 2.1 Introduction to the overall topic

The recorded lecture has become a standard artefact of higher education, but the recording
itself resolves only the problem of availability. A student who missed a class can watch it;
a student trying to establish what was *assigned* in it must still search an hour of
continuous speech for the thirty seconds in which the obligation was stated. The information
exists, and it is not actionable. This chapter reviews the research that bears on closing
that gap, and it does so along the four technical seams the problem actually has: converting
code-switched classroom speech into text, detecting stated commitments within spontaneous
speech, extracting structured records from that text, and delivering the result to students
in a form they can trust.

Each of these is an active research area with its own literature, and the central observation
of this chapter is that they have not been joined. Work on code-switched automatic speech
recognition (ASR) treats the transcript as the finished product [1], [2], [3]. Work on
detecting commitments in speech is mature but has been conducted almost exclusively on
monolingual English business meetings [4], [5]. Work on large language models (LLMs) for
information extraction has advanced quickly but is benchmarked on written text in news,
scientific and socio-political domains [6], [7]. Work on grounded question answering in
education assumes a corpus of documents that an instructor has already uploaded [8]. The
problem this project addresses sits precisely in the space between them.

The Indian classroom adds a constraint that is not incidental. Instruction routinely mixes
Hindi and English within a single sentence — "यह बहुत important concept है जो exam में आएगा" — a
phenomenon termed **code-switching**. Code-switching is well documented as a source of
degradation in speech recognition [1], [3], and it is the specific characteristic that
prevents the direct reuse of tools built for monolingual English lecture capture.

## 2.2 Exhaustive literature survey

### 2.2.1 Code-switched automatic speech recognition for Indian languages

The foundational benchmark for Indian-language ASR under code-switching is the challenge
released by Diwan et al. [1], who assembled approximately 600 hours of transcribed speech
across seven Indian languages, including dedicated Hindi–English and Bengali–English
code-switched subsets. Their published baseline systems reported a word error rate (WER) of
**32.45% on the code-switching test set**, against 30.73% on the multilingual set. The value
of this work for the present project is that it establishes a quantified floor for how badly
code-switching degrades recognition on exactly the language pair of interest. Its limit is
equally clear: the work terminates at the transcript, and no downstream interpretation task is
attempted.

Jain and Bhowmick [2] addressed a different weakness in the available resources — speaker
diversity — by constructing VITB-HEBiC, a Hindi–English bilingual corpus of 7.5 hours of read
speech comprising 3,590 utterances and 58,245 words, recorded from speakers drawn from **27
Indian states** with differing mother tongues and accents. Benchmarking modern neural
architectures against this corpus, they found Whisper-medium achieved the lowest word error
rate at **15.7%**, while W2V2-BERT achieved the best character error rate at 6.4%. Read
against [1], the trajectory is encouraging: recognition quality on Hindi–English improved
substantially over three years. The caveat is material to this project, however. VITB-HEBiC
consists of **read speech**, which lacks the disfluency, hesitation, self-correction,
overlapping speech and domain-specific vocabulary characteristic of an actual lecture. Error
rates observed on spontaneous classroom speech should be expected to be worse than 15.7%, and
this project therefore treats [2] as an optimistic bound rather than as a prediction.

The most complete picture of the field is provided by the systematic literature review of
Agro et al. [3], who collected and manually annotated **127 peer-reviewed papers published
between 2018 and 2024**, recording the languages, datasets, metrics and model choices of
each. Their findings quantify a concentration that is usually only asserted: Mandarin–English
accounts for approximately 55% of the literature, while **Hindi–English accounts for
approximately 11%**, across 35 unique language pairs and 38 available datasets. They further
report that roughly 77% of papers use accessible datasets, and they identify four structural
gaps in the field — data scarcity, geographic disparity in coverage, inconsistent evaluation
practice, and poor reproducibility. This review is important to the present work for a
methodological reason as much as a substantive one: it allows the claim that Hindi–English
code-switching is comparatively under-served to be stated as a measured finding from
published work, rather than as an assertion by the authors of this report.

### 2.2.2 Detecting commitments in spontaneous speech

The closest published analogue to the task undertaken here is **action item detection** —
identifying, within a recorded multi-party conversation, the utterances that commit someone
to a future task. Murray and Renals [4] established the reference result on this problem using
the AMI meeting corpus, applying a supervised logistic regression classifier over prosodic,
lexical, structural and speaker-related features across 138 scenario meetings with 20 held
out for testing. They reported an area under the ROC curve (AUROC) of **0.91 on manual
transcripts and 0.93 on ASR output**, where the recogniser carried a word error rate of
**38.9%**.

That last comparison is the single most useful finding in this chapter for the design of the
present system. Detection performance did not degrade when the classifier was run over
substantially erroneous transcripts, a robustness the authors attribute to the same effect
observed in automatic speech summarisation. The practical consequence is that transcription
quality, while important, is **not a gate that must be cleared before extraction can be
attempted** — a conclusion that directly shapes the sequencing of this project's work.

Liu et al. [5] revisited the task with modern pre-trained language models, noting that
annotated data remains scarce: they obtained 101 annotated AMI meetings containing **381
action items**, and released AMC-A, a Chinese meeting corpus of 424 meetings, to address the
shortage. Their method introduced Context-Drop, a contrastive regularisation approach that
forces consistency between predictions made on a focus sentence alone and on the same
sentence with local or global context attached, combined with a lightweight model ensemble
that initialises encoder and pooler layers from different pre-trained models. Fine-tuning
StructBERT, they improved positive-class F1 on the AMI corpus from a sentence-only baseline
of **38.67 to 43.12**, and on AMC-A from 67.84 to 70.82.

The AMI figure warrants emphasis. After fifteen years of research attention, on clean
monolingual English audio, with annotated in-domain training data, the best reported F1 for
detecting action items in meetings is approximately **43**. The task addressed in this
project is harder along every axis: the input is code-switched, no labelled corpus exists,
and the required distinction is finer, since an obligation ("submit the Chapter 5 analysis by
Friday") must be separated from a suggestion ("please read Chapter 5") — a separation that
action item detection collapses into a single positive class. Any system design for this
problem that assumes near-perfect extraction is therefore contradicted by the literature, and
this finding is the principal justification for the human verification stage described in
Chapter 3.

### 2.2.3 Large language models for information and event extraction

The methodological landscape for extraction has shifted substantially with the arrival of
generative models. Xu et al. [6] survey this shift comprehensively, categorising the
literature by information extraction subtask — named entity recognition, relation extraction
and event extraction — and by technique, covering zero-shot, few-shot, fine-tuned and
distilled approaches. Their synthesis establishes that generative LLMs now address every
information extraction subtask, while noting that specialised supervised models retain an
advantage on certain established benchmarks. For this project the survey supplies framing
rather than a target figure, and it supports the architectural decision to treat an
LLM-based extractor as the primary approach, with pattern matching and named-entity
recognition retained as comparison baselines rather than as sequential pipeline stages.

Because no labelled corpus of annotated Indian lecture transcripts exists, the operative
regime for this project is zero-shot extraction, which makes the work of Parekh et al. [7]
directly relevant. Their DiCoRe framework decomposes zero-shot event detection into three
stages: a *Dreamer* performing open-ended reasoning to maximise recall, a *Grounder* applying
finite-state-machine constrained decoding to align free-form output with the task schema, and
an *LLM-Judge* that verifies candidates to restore precision. Evaluated across six datasets
spanning five domains with nine different LLMs, the approach achieved average F1 gains of
**4–7%** over zero-shot, transfer-learning and reasoning baselines. The architectural lesson —
that a high-recall generative pass should be followed by an explicit precision-restoring
verification stage — transfers directly to the design adopted here. What does not transfer is
the evaluation setting: none of the five domains is education, and none of the input is
spontaneous or code-switched speech.

### 2.2.4 Grounded delivery in educational settings

The final seam concerns how extracted information reaches students without introducing the
fabrication risk that accompanies generative models. Li et al. [8] provide a systematic survey
of retrieval-augmented generation (RAG) in education, reviewing interactive learning systems,
the generation and assessment of educational content, and large-scale deployment across
educational ecosystems. They identify hallucination, static internal knowledge, the
completeness and timeliness of retrieved material, and computational cost as the open
challenges facing the field.

The pattern common to the systems they survey is the decisive one for this project: in each
case, the knowledge base is assembled from **material that an instructor has uploaded**. The
retrieval corpus is a set of documents, and its existence presupposes deliberate effort by
faculty. No surveyed system constructs its knowledge base from what was said in class. This
observation identifies the gap on the delivery side of the problem as cleanly as [3]
identifies it on the recognition side.

## 2.3 Comparative summary

Table 2.1 summarises the reviewed literature against the criteria that determine each work's
relevance to this project.

**Table 2.1** Comparison of reviewed literature

| # | Author, Year, Venue | Problem addressed | Dataset | Method | Reported result | Limitation for the present work |
|---|---|---|---|---|---|---|
| [1] | Diwan et al., 2021, Interspeech | ASR benchmark for Indian languages including code-switching | ~600 h, 7 languages; Hi–En, Bn–En code-switched subsets | Multilingual and code-switching baseline recipes | WER 32.45% (code-switching); 30.73% (multilingual) | Stops at the transcript; no downstream interpretation task |
| [2] | Jain & Bhowmick, 2024, *Applied Acoustics* | Accent-diverse Hindi–English corpus and ASR benchmark | VITB-HEBiC: 7.5 h, 3,590 utterances, 27 states | Whisper, Wav2Vec2.0, XLSR-53, W2V2-BERT, IndicWav2Vec | Whisper-medium WER 15.7%; W2V2-BERT CER 6.4% | Read speech, not spontaneous lecture speech; optimistic bound |
| [3] | Agro et al., 2025, arXiv:2507.07741 | Systematic review of code-switching ASR | 127 peer-reviewed papers, 2018–2024; 35 pairs, 38 datasets | Manual annotation of languages, data, metrics, models | Mandarin–En ≈55%; **Hindi–En ≈11%**; ~77% accessible data | Review only; names data scarcity and inconsistent evaluation as open gaps |
| [4] | Murray & Renals, 2008, MLMI (LNCS 5237) | Action item detection in spontaneous speech | AMI corpus, 138 scenario meetings, 20 test | Logistic regression over prosodic, lexical, structural, speaker features | AUROC 0.91 (manual); **0.93 (ASR @ 38.9% WER)** | Monolingual English business meetings; ranking metric conceals precision difficulty |
| [5] | Liu et al., 2023, IEEE ICASSP | Supervised action item detection with pre-trained models | 101 AMI meetings / 381 action items; releases AMC-A (424 meetings) | StructBERT + Context-Drop + lightweight model ensemble | AMI positive F1 **38.67 → 43.12**; AMC-A 67.84 → 70.82 | Best analogue result is ~43 F1 *with* training data; obligation vs. suggestion not distinguished |
| [6] | Xu et al., 2024, *Frontiers of Computer Science* | Survey of LLM-based generative information extraction | Survey of the generative IE literature | Taxonomy by subtask (NER, RE, EE) and technique | LLMs now span all IE subtasks; supervised specialists still lead some benchmarks | Survey; written-text benchmarks, no speech and no educational domain |
| [7] | Parekh et al., 2025, EMNLP | Zero-shot event detection without labelled data | 6 datasets, 5 domains, 9 LLMs | Dreamer → Grounder (constrained decoding) → LLM-Judge | **4–7% average F1 gain** over zero-shot and transfer baselines | No educational domain; written text, not code-switched speech |
| [8] | Li et al., 2025, *Computers and Education: AI* | Systematic survey of RAG in education | Survey of educational RAG systems | Review of learning systems, content generation, deployment | Hallucination, static knowledge, retrieval completeness, cost named as open challenges | Every system grounds in **faculty-uploaded documents**; none builds its corpus from classroom speech |

## 2.4 Research gap

Reading Table 2.1 across rows rather than down columns, three conclusions follow.

First, **transcription of code-switched Hindi–English speech is a managed risk rather than a
blocking constraint.** The WER trajectory from 32.45% [1] to 15.7% [2] is favourable, and
Murray and Renals [4] demonstrate that commitment detection is substantially robust to
recognition error, holding at 0.93 AUROC over transcripts carrying 38.9% WER. Recognition
quality must be measured and reported, but it does not need to be solved first.

Second, **the extraction problem is genuinely unsolved, and the literature's honest figure is
low.** The strongest reported supervised result on the closest analogue task is approximately
43 F1 [5], obtained under conditions more favourable than those of this project in every
respect. This is a finding about task difficulty, not about method quality, and a system
design that tolerates imperfect extraction is therefore the response the literature supports.

Third, **the four literatures reviewed here have not been joined.** Agro et al. [3] measured
that Hindi–English constitutes approximately 11% of a 127-paper code-switching literature
that treats the transcript as its output. Murray and Renals [4] and Liu et al. [5] extract
commitments, but from monolingual English business meetings. Xu et al. [6] and Parekh et al.
[7] establish that generative and zero-shot extraction are viable, on written text in
non-educational domains. Li et al. [8] show that grounded educational question answering
depends on a document corpus that faculty must supply.

Accordingly, the gap is stated as follows:

> We identified no published work that extracts structured academic commitments —
> assignments, submission deadlines and examination topics — from code-switched
> Hindi–English classroom speech, and no evaluation set exists for that task. The adjacent
> literatures each address one component of the problem: code-switched ASR terminates at the
> transcript, action item detection operates on monolingual English business speech, and
> educational RAG presupposes an uploaded document corpus.

The claim is deliberately expressed as an absence of located evidence rather than as a claim
of priority, which the scope of any feasible search cannot support.

## 2.5 Problem statement

Arising directly from the gap identified in Section 2.4:

> **How accurately can structured academic events — assignments, submission deadlines,
> examination topics and announcements — be extracted from code-switched Hindi–English
> classroom speech; and which combination of techniques, among pattern matching, named-entity
> recognition and LLM-based classification, yields the highest precision under realistic
> classroom conditions?**

Two properties of this formulation follow from the literature reviewed above. Because the
best published result on the nearest analogue task is approximately 43 F1 [5], the system
architecture must assume that extraction will be imperfect and must place a human
verification stage between extraction and any student-facing output; this is developed in
Chapter 3. And because the comparison of techniques is itself the contribution, a negative
result — for instance, that a well-prompted LLM outperforms a multi-stage pipeline —
constitutes a valid finding to be reported rather than a failure to be concealed.

---

## Chapter summary

This chapter reviewed eight works across four areas bearing on the automatic extraction of
academic commitments from classroom speech. Code-switched ASR for Hindi–English has improved
markedly but remains under-represented in the literature and stops at the transcript.
Detection of commitments in spontaneous speech is established and demonstrably robust to
recognition error, yet the strongest reported result on the nearest analogue task remains
approximately 43 F1 on monolingual English. LLM-based extraction, including in the zero-shot
regime that applies here, is viable but has been evaluated on written text in non-educational
domains. Grounded delivery of answers in education presupposes a document corpus supplied by
faculty. The gap lies at the intersection of these four areas, and Section 2.5 derives the
problem statement from it. Chapter 3 presents the methodology and implementation adopted in
response.

---

## Outstanding work on this chapter

Recorded here for the authors; to be removed before submission.

1. **Reference count.** Annexure A.8 requires a minimum of 15 references in Section 2.1 and
   at least 10 good journal or conference papers discussed in Section 2.2. This draft has 8.
   Seven or more must be added, and `Projects/classmind/.knowledge/literature-survey.md`
   § 5 names the specific areas: temporal expression extraction and normalisation, spoken
   language understanding on disfluent speech, AI4Bharat / IndicNLP resources,
   human-in-the-loop verification, and DPDP Act 2023 consent obligations for classroom
   recording.
2. **Serial citation ordering.** A.8 asks that Section 2.2 proceed "preferably starting from
   reference 1 to 15 ... serially." The current ordering already satisfies this for [1]–[8];
   it must be preserved when the additional references are inserted, which means inserting
   them in reading order rather than appending them to the reference list.
3. **Library verification.** The full texts of [2] and [8] are behind ScienceDirect and could
   not be retrieved directly. Volume and page numbers should be confirmed through the college
   library before final submission.
