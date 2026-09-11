# Literature Survey — ClassMind

**Status:** Live. This is the source of truth for the literature review.
**Created:** 2026-09-11
**Updated:** 2026-09-11

This file exists because `research/README.md` records, as known limitation #1, that the
synopsis's novelty claims "were not re-checked against a systematic literature search, and
it is the single easiest thing for an examiner to puncture." This is that re-check.

Two rules govern this file:

1. **Every claim here was read from the paper, not from a search result.** Where a number
   appears below, it was taken from the paper's own results table. Search summaries were
   wrong twice during this survey — the ICASSP action-item paper was reported to us as "137
   meetings, 1,259 action items, F1 0.59" when the paper says 101 AMI meetings, 381 action
   items, and a best AMI F1 of 43.12. A citation nobody verified is a citation an examiner
   breaks.
2. **Claims of novelty are stated as absence of found evidence, not as fact.** "We found no
   published work on X" is defensible. "We are the first to do X" is not, and the panel only
   has to find one counter-example to sink it.

---

## 1. Why these papers

ClassMind is a pipeline, and the literature that constrains it splits along the pipeline's
own seams. The survey is organised that way rather than chronologically, because the
question each paper answers maps to a component we either build or deliberately do not.

| Layer in ClassMind | What we need to know from the literature |
|---|---|
| Speech → text (Hinglish) | How badly does code-switching degrade ASR, and what is achievable today? |
| Text → structured events | Has anyone extracted actionable commitments from spontaneous speech, and how well? |
| Extraction method | Do LLMs beat supervised extractors, and at what cost in reliability? |
| Delivery to students | How is grounded, citable answering done in education, and what fails? |

---

## 2. Comparison table

This is the table for the review presentation. Eight papers; the rubric asks for at least
five.

| # | Paper (Author, Year, Venue) | Problem addressed | Data | Method | Key reported result | Limitation / what it leaves open for us |
|---|---|---|---|---|---|---|
| 1 | Diwan et al., 2021, **Interspeech** — *Multilingual and code-switching ASR challenges for low resource Indian languages* | Benchmarking ASR for Indian languages incl. code-switched pairs | ~600 h, 7 Indian languages; Hindi–English and Bengali–English code-switched subsets | Multilingual + code-switching baseline recipes released as a challenge | **WER 32.45%** on the code-switching test set; 30.73% multilingual | Establishes that code-switched Indian speech is hard, but stops at transcription. No downstream task is attempted. |
| 2 | Jain & Bhowmick, 2024, **Applied Acoustics** (art. 110119) — *VITB-HEBiC: a bilingual corpus for evaluating ASR in diverse Indian code-switching scenarios* | A Hindi–English code-switched corpus with genuine accent diversity | 7.5 h read speech, 3,590 utterances, 58,245 words, speakers from **27 Indian states** | Benchmarks Whisper, Wav2Vec2.0, XLSR-53, W2V2-BERT, IndicWav2Vec | **Whisper-medium WER 15.7%**; W2V2-BERT best CER 6.4% | **Read speech, not classroom speech.** No lecture register, no spontaneous disfluency, no domain vocabulary. Our error rates should be expected to be worse. |
| 3 | Agro et al., 2025, **arXiv:2507.07741** — *Code-Switching in End-to-End ASR: A Systematic Literature Review* | What the code-switching ASR field has actually covered | Systematic review of **127 peer-reviewed papers, 2018–2024**; 35 language pairs, 38 datasets | Manual annotation of languages, datasets, metrics, models | Mandarin–English ≈55% of papers; **Hindi–English ≈11%**; ~77% use accessible datasets | Names data scarcity, geographic disparity, inconsistent metrics and poor reproducibility as the field's four gaps. Our strongest citation for "under-served" — and it is a *measured* claim, not ours. |
| 4 | Murray & Renals, 2008, **MLMI**, LNCS 5237, pp. 208–213 — *Detecting Action Items in Meetings* | Detecting stated commitments in spontaneous multi-party speech | AMI meeting corpus, 138 scenario meetings, 20 held out | Logistic regression over prosodic, lexical, structural and speaker features | **AUROC 0.91** on manual transcripts, **0.93 on ASR output at 38.9% WER** | The foundational result for us: commitment detection is **robust to transcription error**. Justifies not chasing perfect ASR before extracting. But AUROC on a ranking task hides how hard precision is — see #5. |
| 5 | Liu et al., 2023, **ICASSP** — *Meeting Action Item Detection with Regularized Context Modeling* | Modern supervised action item detection | 101 annotated AMI meetings / **381 action items**; releases AMC-A, 424 Chinese meetings | StructBERT + Context-Drop (contrastive local/global context) + lightweight model ensemble | **AMI positive F1: 38.67 → 43.12.** AMC-A: 67.84 → 70.82 | **The most important number in this survey.** After 15 years, the best supervised F1 on English meeting action items is ~43. The closest published analogue to our task is nowhere near solved — which is the argument *for* a human approval gate, not against the project. |
| 6 | Xu et al., 2024, **Frontiers of Computer Science** (DOI 10.1007/s11704-024-40555-y) — *Large Language Models for Generative Information Extraction: A Survey* | Taxonomy of LLM-based NER, relation and event extraction | Survey of the generative IE literature | Categorises by IE subtask and by technique (zero-shot, few-shot, fine-tuned, distilled) | Generative LLMs now cover all IE subtasks; supervised specialists still lead on some benchmarks | Confirms our 2026-07-29 deviation (LLM extractor first, patterns/NER as comparison baselines) sits with the field's direction. It is a survey, so it gives framing, not a number to beat. |
| 7 | Parekh et al., 2025, **EMNLP 2025** (2025.emnlp-main.1038) — *DiCoRe: Enhancing Zero-shot Event Detection via Divergent-Convergent LLM Reasoning* | Zero-shot event detection without labelled training data | 6 datasets, 5 domains, 9 LLMs | Dreamer (open-ended recall) → Grounder (FSM-constrained decoding) → LLM-Judge (precision) | **4–7% average F1 gain** over zero-shot, transfer-learning and reasoning baselines | Directly relevant architecture: a **high-recall pass followed by a precision-restoring verifier**. We have no labelled Hinglish lecture corpus, so zero-shot is our regime too. None of the five domains is education, and none of the speech is code-switched. |
| 8 | Li et al., 2025, **Computers and Education: AI** 8:100417 — *Retrieval-Augmented Generation for Educational Application: A Systematic Survey* | How RAG is being applied across education | Systematic survey of educational RAG systems | Reviews interactive learning systems, content generation/assessment, ecosystem deployment | Names hallucination, static knowledge, retrieval completeness/timeliness and cost as the open challenges | Every system surveyed grounds answers in **faculty-uploaded documents**. None builds the knowledge base from classroom speech. The cleanest statement of our gap on the delivery side. |
| 9 | Bhogale et al., 2023, **Interspeech** — *Vistaar: Diverse Benchmarks and Training Sets for Indian Language ASR* | Whether one benchmark can characterise Indian-language ASR | Vistaar: **59 benchmarks**; IndicWhisper fine-tuned on **10.7 K h across 12 languages** | Evaluates 3 public + 2 commercial systems; fine-tunes Whisper | IndicWhisper lowest WER on **39 of 59** benchmarks; avg reduction 4.1 WER | Their own argument works against reusing any published number for us: performance varies so much by domain that **no existing benchmark characterises lecture speech**. We must build our own. |
| 10 | Strötgen & Gertz, 2010, **SemEval** pp. 321–324 — *HeidelTime* | Rule-based temporal expression extraction and normalisation | TempEval-2 | Regex patterns for extraction; knowledge resources + linguistic cues for normalisation | Best English extraction and normalisation at TempEval-2 | Written English news with a reliable document creation time. No speech, no code-switching. |
| 11 | Chang & Manning, 2012, **LREC** — *SUTIME* | A extensible temporal tagger (ships in Stanford CoreNLP) | TempEval-2 English evaluation set | Deterministic rule-based | Extent P 0.88 / R 0.96 / **F1 0.92**; **value accuracy only 0.82** (HeidelTime1 0.85) | **The gap between 0.92 and 0.82 is the finding.** Locating a date is far easier than resolving what it denotes — and that is on clean news text with a known document date. Our deadlines are spoken, relative, and sometimes themselves code-switched ("agle Friday tak"). |
| 12 | Korthals et al., 2026, **Machine Learning and Knowledge Extraction** 8(3):74 — *Towards Reliable LLM Grading Through Self-Consistency and Selective Human Review* | Making unreliable LLM output usable via selective human review | Short-answer grading | SURE: repeated prompting for self-consistency → uncertainty-based flagging → selective human re-grading | Higher accuracy with reduced human workload | Grading, not extraction. But it is the published justification for **ordering our review queue by confidence** rather than reviewing everything equally — previously we cited nobody for that. Quantitative detail not retrieved (403); verify through the library. |

---

## 3. What the table adds up to

Read across the rows, three things hold, and each is load-bearing for the project.

**The transcription problem is real but no longer the bottleneck.** Diwan et al. put
code-switched Indian ASR at 32.45% WER in 2021; Jain & Bhowmick get 15.7% with Whisper-medium
on read Hindi–English three years later. The trajectory is good. Crucially, Murray & Renals
show commitment detection at 0.93 AUROC on ASR output with a **38.9% WER** — worse
transcription than anything we will run on — losing nothing relative to manual transcripts.
Transcription quality is therefore a risk to *manage*, not a gate to clear before starting.

**The extraction problem is unsolved, and the honest number is low.** Liu et al.'s 43.12 F1
on AMI is the strongest supervised published result on the closest analogue task — on clean
English, with annotated training data, in a domain studied since 2005. We have none of those
advantages: no labelled corpus, code-switched input, and a harder label set, because we must
separate an obligation ("submit Chapter 5 analysis by Friday") from a suggestion ("please
read Chapter 5"), which action-item detection treats as a single class. **Anyone promising
high precision here is guessing.** This is the literature's clearest instruction to us, and
it validates the architecture already chosen: nothing reaches a student without faculty
approval, so an extraction error becomes review workload rather than a wrong deadline.

**The gap is a genuine intersection, and we can now state it without overclaiming.** Agro et
al. measured that Hindi–English is ~11% of a 127-paper code-switching literature that stops
at the transcript. Liu et al. and Murray & Renals extract commitments, but from monolingual
English business meetings. Li et al. show educational RAG grounding answers in documents
faculty upload, not in what was said in class. DiCoRe gives a zero-shot recipe across five
domains, none of them education.

> **Gap statement, as it should be worded in the report and on the slide:**
> We found no published work that extracts structured academic commitments — assignments,
> deadlines, exam topics — from code-switched Hindi–English classroom speech, nor any
> evaluation set for that task. The adjacent literatures each solve one leg of it:
> code-switched ASR stops at the transcript, meeting action-item detection works on
> monolingual English business speech, and educational RAG assumes a document corpus that
> someone uploaded.

Note the form: *we found no published work*, not *we are the first*. See rule 2 at the top.

---

## 4. How this changes what we claim

Three claims in `research/2026-07-24-synopsis-full.md` do not survive this survey and must be
reworded before the report goes out. They are listed here rather than edited there, because
the research archive is frozen by design.

| Synopsis says | Problem | Replace with |
|---|---|---|
| "First benchmark for academic event extraction from Indian classroom speech" | Unfalsifiable and unnecessary; one counter-example destroys it | "The first such benchmark we are aware of; we found none in a search of the code-switching, event-extraction and educational-NLP literatures" |
| Precision targets of ≥92% / ≥90% / ≥85% | Set before any measurement. Liu et al. reach 43 F1 on an easier task *with* training data. Presenting 92% to a panel that knows the literature is the single most dangerous slide in the deck | Report measured numbers only. State the targets as design goals, with the AMI baseline named as context |
| "No published research addresses academic event extraction" (unqualified) | Absolute claim about all literature | Keep the substance, qualify the scope — as in the gap statement above |

The precision-target row is the one to act on first. It is the item most likely to be
challenged at a review, and the answer that works is: *here is the closest published result,
43 F1; here is why our architecture assumes extraction will be imperfect; here is what we
actually measured.* That answer is stronger than any number we could promise.

---

## 5. Coverage against the report requirement

The capstone guidelines (Annexure A.8, Chapter 2) require a background built from **15+
references** with **10+ papers discussed in depth**, in paragraph form in the report and in
comparative form in the presentation.

**Have:** 8 verified papers — code-switched ASR (3), commitment extraction from speech (2),
LLM-based extraction (2), educational delivery (1).

**Gap to close for the final report — 7+ more, and these are the right ones:**

- **Temporal expression extraction and normalisation** (the HeidelTime/SUTime lineage, plus
  recent LLM-based temporal grounding). "Friday 5 PM" → an absolute timestamp is a whole
  subproblem we currently hand-wave.
- **Spoken language understanding / intent detection on disfluent speech** — closer to our
  actual input than written-text IE benchmarks are.
- **AI4Bharat / IndicNLP resources** — so the Indian-language positioning rests on published
  work rather than on vendor material.
- **Two or three on human-in-the-loop verification and annotation quality** — this directly
  supports the faculty approval gate, and we currently cite nobody for the project's single
  most important design decision.
- **One on DPDP Act 2023 / classroom recording consent** — `research/README.md` limitation #3
  flags this absence, and it is still absent.

**Sources to drop:** the competitive-analysis blog posts in
`research/2026-07-24-research-findings.md` (`softwaresuggest`, `jotme.io`, `umevo.ai`,
`bostoninstituteofanalytics`, `entrepreneurindia`, `techtimes`, `decentro`). They are fine as
market evidence in a synopsis and must not appear in a literature review — a reference list
where blog posts sit beside EMNLP papers reads as padding, and invites exactly the scrutiny
we do not want.

---

## 6. References (IEEE style, as the report format requires)

[1] A. Diwan, R. Vaideeswaran, S. Shah, A. Singh, S. Raghavan, S. Khare, V. Unni, S. Vyas,
A. Rajpuria, C. Yarra, A. Mittal, P. K. Ghosh, P. Jyothi, K. Bali, V. Seshadri, S. Sitaram,
S. Bharadwaj, J. Nanavati, R. Nanavati, K. Sankaranarayanan, T. Seeram, and B. Abraham,
"Multilingual and code-switching ASR challenges for low resource Indian languages," in *Proc.
Interspeech*, 2021. arXiv:2104.00235.

[2] P. Jain and A. Bhowmick, "VITB-HEBiC: A bilingual corpus for evaluating ASR in diverse
Indian code-switching scenarios," *Applied Acoustics*, art. 110119, 2024.
doi: 10.1016/j.apacoust.2024.110119.

[3] M. T. Agro, A. Kulkarni, K. Kadaoui, Z. Talat, and H. Aldarmaki, "Code-switching in
end-to-end automatic speech recognition: A systematic literature review," arXiv:2507.07741,
2025.

[4] G. Murray and S. Renals, "Detecting action items in meetings," in *Machine Learning for
Multimodal Interaction (MLMI)*, LNCS 5237, Springer, 2008, pp. 208–213.

[5] J. Liu, C. Deng, Q. Zhang, Q. Chen, and W. Wang, "Meeting action item detection with
regularized context modeling," in *Proc. IEEE ICASSP*, Rhodes, Greece, 2023.
arXiv:2303.16763.

[6] D. Xu, W. Chen, W. Peng, C. Zhang, T. Xu, X. Zhao, X. Wu, Y. Zheng, Y. Wang, and E. Chen,
"Large language models for generative information extraction: A survey," *Frontiers of
Computer Science*, 2024. doi: 10.1007/s11704-024-40555-y.

[7] T. Parekh, K. Mehta, N. Mehrabi, K.-W. Chang, and N. Peng, "DiCoRe: Enhancing zero-shot
event detection via divergent-convergent LLM reasoning," in *Proc. EMNLP*, Suzhou, China,
2025.

[8] Z. Li, Z. Wang, W. Wang, K. Hung, H. Xie, and F. L. Wang, "Retrieval-augmented generation
for educational application: A systematic survey," *Computers and Education: Artificial
Intelligence*, vol. 8, art. 100417, 2025. doi: 10.1016/j.caeai.2025.100417.

**Verification note.** [1], [4], [5], [6], [7] were read from the paper PDF or the
publisher's abstract page directly. [2], [3], [8] were confirmed through the publisher record
and the paper's own HTML; the ScienceDirect full texts for [2] and [8] return 403 to
automated retrieval and should be pulled through the college library before the final report,
so volume and page numbers can be checked.
