---
type: research
audience: capstone ideation
status: complete
date_created: 2026-07-24
last_modified: 2026-07-24
source: Web research, competitive analysis, academic literature
---

# ClassMind: Research Findings & Competitive Analysis
## Project 1 Viability Assessment

---

## Executive Summary

**Verdict**: ClassMind is a **viable and research-worthy capstone project**, but ONLY if positioned correctly around a specific research gap. As currently framed (integrating existing tools), it would score poorly on NMIMS rubrics.

**Strong positioning**: Focus on **"Academic Event Extraction from Code-Switched Classroom Speech"** — a genuine, under-researched gap in Indian educational AI.

---

## 1. Competitive Landscape Analysis

### 1.1 Lecture Capture Systems (Mature Market)

| Platform | Strength | What's Missing |
|---|---|---|
| **Panopto** | #1 institutional platform. AI-powered Smart Search, ASR in 20+ languages, 13M users | No academic event extraction. Focuses on video organization, not semantic understanding |
| **Echo360** | Active learning features (in-video polls, quizzes, confusion flags) | Requires faculty to create interactive elements manually. No auto-extraction of assignments/deadlines |
| **Kaltura** | Video management + analytics | Generic video platform, not academic context-aware |
| **YuJa** | Similar to Panopto/Kaltura | Same limitations |
| **Microsoft Stream** | Free/cheap. Microsoft ecosystem integration | Limited AI features. No academic intelligence |

**Key Insight**: These platforms record and index videos but do NOT understand academic context (what's an assignment vs. discussion?).

---

### 1.2 AI Note-Taking & Transcription Tools (Growing Market)

| Platform | Strength | What's Missing |
|---|---|---|
| **Otter.ai** | Automatic summaries, action items, slide capture, multilingual | No academic event extraction. Treats lectures like meetings |
| **Fireflies.ai** | Searchable transcripts, AskFred Q&A assistant, 100+ languages | Generic Q&A, not lecture-aware. No deadline/assignment tracking |
| **Notion AI** | Organization, summarization, document Q&A | Requires manual input. Not designed for lecture capture |
| **Jamworks** | AI-powered learning from lecture recordings | Limited to K-12, not college level |
| **Happy Scribe** | Transcription accuracy | No AI features beyond transcription |

**Key Insight**: These tools transcribe and search but don't extract STRUCTURED academic information (due dates, assignments, exam topics).

---

### 1.3 RAG-Based Educational Chatbots (Hot Emerging Area)

**2025 Survey Finding**: "Retrieval-Augmented Generation (RAG) Chatbots for Education: A Survey of Applications" documents growing use of RAG in education.

**Real-world example**: Copenhagen Business Academy deployed RAG chatbots for course-specific AI assistants (International Marketing, Business Ethics) → increased student participation, strong faculty interest.

**What they do**: Pull answers from course documents, grounding responses in verifiable source material.

**What's missing**: 
- Not designed for extracting information FROM lectures
- Require faculty to pre-process and upload course materials
- No automatic capture of real-time classroom announcements
- Don't understand Indian classroom speech patterns

**Key Insight**: RAG is proven in education but requires manual setup. ClassMind would automate the knowledge base creation.

---

### 1.4 Indian EdTech Platforms

| Platform | Focus | Relevant? |
|---|---|---|
| **BYJU'S** | K-12 prep, adaptive learning | Insolvent since July 2024 (now under CCI probe). Not relevant. |
| **Unacademy** | Competitive exam prep, live classes | Acquired by upGrad (March 2026), valuation down 85%. Focus on exam prep, not college academics |
| **Vedantu** | Online tutoring, live interactive classes | Focuses on 1-on-1 tutoring, not lecture capture |
| **PhysicsWallah** | YouTube-based content, low cost | Not a platform for colleges |
| **Allen Digital** | JEE/NEET prep | Same as above |

**Key Insight**: Indian EdTech is focused on exam prep (K-12), not college-level academic management. No player has built lecture-to-intelligence pipeline.

---

## 2. Sarvam AI & Indian Language Processing

### 2.1 Sarvam AI's Capabilities

- **Speech Recognition**: Saaras V3 covers 22 Indian languages (widest coverage in India)
- **LLM**: Sarvam-30B and Sarvam-105B (unveiled Feb 2026) with multilingual support
- **Valuation**: Hit $1.5B in June 2026 (backed by HCLTech $150M)
- **Education Focus**: Officially positioning itself as "engine of education"

**What Sarvam Can Do**:
- Convert classroom speech to text in Hindi, English, Marathi, Tamil, Telugu, Kannada, etc.
- Handle code-switching (Hinglish, Tamish, etc.)
- Generate content in Indian languages

**What Sarvam CANNOT Do**:
- Understand classroom context (doesn't know what's an assignment)
- Extract structured academic events
- Track assignments across a semester
- This is YOUR research opportunity

---

### 2.2 Code-Switching Challenge (Real Research Gap)

**What is Code-Switching**: Teachers in India mix Hindi + English mid-sentence: "यह बहुत important concept है जो आपको exam में आएगा."

**Why It's Hard**:
- Unpredictable language switches at any position
- Phoneme mixing from different languages complicates acoustic models
- Varied accents of non-native speakers
- Limited training data for code-switched speech

**Recent Research (2024-2025)**:
- VITB-HEBiC corpus (VIT Bhopal) for Hindi-English code-switching
- Transfer learning from monolingual corpora
- Synthetic data generation via TTS + phrase-mixing
- Semi-supervised training approaches

**Why This Matters for ClassMind**:
- Indian classroom speech is inherently code-switched
- Generic ASR (even Sarvam) struggles with unpredictable code-switching
- Building robust extraction on top of code-switched speech is a research problem
- NO existing system has tackled academic event extraction in this context

---

## 3. Academic Event Extraction (The Research Gap)

### 3.1 General Event Extraction Research (Active Field)

Recent publications (2024-2025):
- **ACL 2025**: "Benchmarking Multi-domain Scientific Event Extraction"
- **EMNLP 2025**: Document-level event extraction
- **arXiv 2024-2025**: 10+ papers on event extraction with LLMs

**What researchers study**: Extracting news events, scientific events, socio-political events from text.

**What's NOT studied**: Academic events (assignments, deadlines, exam topics) from lecture transcripts.

### 3.2 The Specific Gap: Academic Event Extraction from Lectures

**No existing research specifically addresses**:
- ❌ Extracting assignments from classroom speech
- ❌ Identifying deadline announcements vs. informal discussion
- ❌ Detecting exam-important topics in code-switched speech
- ❌ Handling syllabus changes mid-semester
- ❌ Distinguishing "please read chapter 5" (suggested) from "submit assignment 3" (required)

**Why it's hard**:
- Classroom speech is informal ("students को read karna chahiye" vs "submit by Friday")
- Deadlines mentioned casually, then changed
- Multiple conflicting cues (faculty says "by next class" vs. "25th July")
- Code-switching makes pattern matching fragile

---

## 4. Market Opportunity Analysis

### 4.1 Indian College Market

- **1.4 million college students** in India (2025)
- **50,000+ colleges** in India
- **Pandemic legacy**: Post-COVID, demand for lecture recording/automation remains high
- **Cost-sensitive**: Colleges can't afford Panopto ($60-150/student/year)
- **Language diversity**: Most platforms only English; Indian platform could dominate

### 4.2 Unmet Needs

1. **Automatic assignment tracking** - Faculty manually update LMS; students miss deadlines
2. **Exam preparation** - Students rewatch full lectures to find exam topics
3. **Inclusive learning** - Non-English speakers struggle with English lecture capture
4. **Faculty efficiency** - Faculty spend hours organizing course materials

---

## 5. What Existing Systems Do (and Don't Do)

```
┌─────────────────────────────────────────────────────────────────┐
│ Lecture Capture (Panopto, Echo360)                              │
│ ✓ Records and transcribes                                       │
│ ✓ Full-text search of transcripts                               │
│ ✗ Doesn't extract assignments                                   │
│ ✗ Doesn't track deadlines                                       │
│ ✗ Doesn't identify exam topics                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ AI Transcription (Otter.ai, Fireflies)                          │
│ ✓ Accurate speech-to-text                                       │
│ ✓ Summarization                                                 │
│ ✗ No academic context understanding                             │
│ ✗ Treats lectures like meetings                                 │
│ ✗ No structured event extraction                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ RAG Chatbots (Copenhagen Business Academy model)                │
│ ✓ Grounds answers in course documents                           │
│ ✓ Reduces hallucinations                                        │
│ ✗ Requires manual knowledge base setup                          │
│ ✗ Doesn't auto-extract from lectures                            │
│ ✗ Faculty burden to organize materials                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ ClassMind (Proposed)                                            │
│ ✓ Captures classroom audio                                      │
│ ✓ Transcribes in Indian languages (Sarvam)                      │
│ ✓ EXTRACTS academic events automatically                        │
│ ✓ Builds RAG knowledge base without faculty work                │
│ ✓ Tracks assignments, deadlines, exam topics                    │
│ ✓ Indian classroom context-aware                                │
│ ✓ Handles code-switched speech                                  │
│ ✓ Natural language Q&A with source citations                    │
│ = FILLS THE GAP                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Recommended Research Angle

### **"Academic Event Extraction from Code-Switched Indian Classroom Speech: A Pipeline Approach"**

#### Research Question
> How can we accurately extract structured academic events (assignments, deadlines, exam topics) from code-switched classroom speech, and what combination of techniques (pattern matching, NER, LLM confidence scoring) achieves optimal precision while handling real classroom discourse patterns?

#### Why This Fills a Gap
1. **Specific**: Not "we built an app" but "we solved a problem"
2. **Novel**: No existing system, no published benchmarks
3. **Measurable**: Precision, recall, F1-score metrics
4. **Feasible**: Can use Sarvam API + LLMs locally
5. **Publishable**: Conference paper material (EdTech + NLP track)
6. **Real-world**: Solves genuine Indian college problem

#### Evaluation Strategy
- **Dataset**: 15-20 real lectures from Indian colleges
- **Ground truth**: Manual annotation by students
- **Metrics**:
  - Deadline extraction: ≥92% precision, ≥88% recall
  - Assignment extraction: ≥90% precision, ≥85% recall
  - Exam topic extraction: ≥85% precision, ≥80% recall
- **Baseline**: Manual search through recordings (how long to find info?)
- **Error analysis**: Where does code-switching break the pipeline?

---

## 7. NMIMS Rubric Alignment

### Does ClassMind satisfy NMIMS CO1-CO5?

| CO | Requirement | ClassMind Score |
|---|---|---|
| **CO1** | "Select appropriate problem after reviewing literature and identifying research gaps" | ⭐⭐⭐⭐⭐ YES. Research gap in academic event extraction is genuine and documented. |
| **CO2** | "Formulate a feasible design model" | ⭐⭐⭐⭐ YES. Tiered extraction pipeline is feasible with 3-4 person team. |
| **CO3** | "Implement prototype, test and validate results" | ⭐⭐⭐⭐⭐ YES. Can demo working system + precision/recall metrics. |
| **CO4** | "Work efficiently in team environment" | ⭐⭐⭐⭐ YES. Clear module division (audio, extraction, RAG, frontend). |
| **CO5** | "Summarize findings into technical report" | ⭐⭐⭐⭐⭐ YES. Clear evaluation section, literature review, design documentation. |

### Rubric Scoring (Estimated)

| Review | Aspect | Score | Why |
|---|---|---|---|
| **1st Review** | Problem clarity | 9/10 | Clear gap + feasibility |
| **1st Review** | Feasibility | 8/10 | Tech stack ready, minor unknowns |
| **2nd Review** | Literature | 8/10 | Can cite event extraction + education papers |
| **2nd Review** | Design | 8/10 | Tiered pipeline is well-specified |
| **2nd Review** | Implementation | 8/10 | Working extraction on sample lectures |
| **3rd Review** | Final demo | 9/10 | Working dashboard + Q&A is impressive |
| **3rd Review** | Evaluation | 9/10 | Precision/recall metrics on benchmark |
| **Overall** | **Estimated** | **~42-46 / 50** | Strong B+ or A- capstone |

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Sarvam API reliability | Medium | Use Whisper as fallback. Local Sarvam model if possible. |
| Code-switching accuracy | High | This IS the research gap. Document failure modes. |
| Ground truth dataset | High | Get college partnership for 15-20 real lectures + manual annotation |
| LLM hallucination | Medium | Implement confidence scoring + citation tracking |
| Faculty adoption (for real deployment) | Low (for capstone) | Build proof-of-concept; don't need mass adoption |
| Timeline (8-10 months) | Medium | Start with 3-lecture prototype in Month 2; scale to 20 by Month 7 |

---

## 9. Differentiators vs. Competitors

| vs. Panopto | ClassMind extracts assignments automatically; Panopto requires manual entry |
| vs. Otter.ai | ClassMind understands academic context; Otter treats lectures like meetings |
| vs. RAG platforms | ClassMind builds knowledge base automatically from lectures; others require faculty setup |
| vs. Indian EdTech | ClassMind serves colleges; others serve exam prep market |
| vs. Notion/OneNote | ClassMind is proactive (auto-extracts); others are reactive (manual organization) |

---

## 10. Recommendation

### ✅ PROCEED with ClassMind as Project 1

**But with specific positioning:**

1. **Rename focus**: "Academic Event Extraction Pipeline" (not just "lecture recording app")
2. **Lead with research**: "We investigate how to extract academic events from code-switched classroom speech"
3. **Emphasize novel contribution**: Tiered extraction pipeline specific to Indian classrooms
4. **Plan evaluation**: 15-20 lectures + precision/recall metrics
5. **Position for paper**: Target EdTech or NLP conference

### Research Contribution Statement (for your synopsis)

> "While existing lecture capture systems (Panopto, Echo360) and AI transcription tools (Otter.ai, Fireflies) excel at recording and searching lectures, they fail to extract structured academic information (assignments, deadlines, exam topics). The research gap is acute in Indian classrooms where code-switching between Hindi and English adds complexity. We propose **ClassMind**, an academic event extraction pipeline that combines pattern-based extraction, NER, and LLM confidence scoring to automatically identify academic events from code-switched classroom speech. Through evaluation on 15+ real Indian college lectures, we benchmark precision and recall against manual baselines and analyze failure modes specific to code-switching scenarios."

---

## 11. Next Steps for Synopsis Rewrite

1. **Add Section "Research Gap"**: Cite 3-4 papers showing event extraction is active field but not applied to academic events
2. **Add competitive analysis table**: Show what Panopto, Otter, RAG platforms do vs. don't do
3. **Specify evaluation metrics**: Precision, recall, F1 for each event type
4. **Ground truth plan**: How you'll collect and annotate lectures
5. **Code-switching angle**: Mention this specific technical challenge
6. **Modify "Innovation"**: Change from "we integrate tools" to "we solve the academic event extraction problem"

---

## Sources & References

### Speech Recognition & Code-Switching
- [Multilingual and code-switching ASR challenges for low resource Indian languages](https://arxiv.org/abs/2104.00235) — Microsoft Research
- [Code-Switching in End-to-End Automatic Speech Recognition: A Systematic Literature Review](https://arxiv.org/pdf/2507.07741)
- [Analyzing code-switching scenarios in India's diverse linguistic landscape](https://www.sciencedirect.com/science/article/abs/pii/S0045790624009030) — ScienceDirect

### Event Extraction
- [Benchmarking Multi-domain Scientific Event Extraction](https://aclanthology.org/2025.emnlp-main.871.pdf) — EMNLP 2025
- [Event Extraction in Large Language Model](https://arxiv.org/pdf/2512.19537)
- [Closed-Domain Event Extraction Literature Review January 2025](https://www.turing.ac.uk/sites/default/files/2025-07/arc_event_extraction_lit_review.pdf) — Turing Institute

### RAG in Education
- [Retrieval-Augmented Generation (RAG) Chatbots for Education: A Survey of Applications](https://www.mdpi.com/2076-3417/15/8/4234/notes) — Applied Sciences, 2025
- [Designing a Local RAG-Based Intelligent Tutoring System for Domain-Specific Education](https://link.springer.com/chapter/10.1007/978-981-92-2891-1_13) — Springer

### Lecture Capture & Transcription
- [5 Best Lecture Capture Software (2026)](https://www.softwaresuggest.com/blog/best-software-for-recording-lectures/)
- [10 Best AI Note Takers We Tried in 2026](https://www.jotme.io/blog/best-ai-notetaker)
- [Otter vs Fireflies vs Notion AI (2026): Which Is Best?](https://www.umevo.ai/blogs/ume-all-posts/otter-vs-fireflies-vs-notion-ai-which-meeting-transcription-tool-is-best-in-2026)

### Sarvam AI & Indian EdTech
- [Sarvam AI In Education: Benefits & Challenges 2026](https://bostoninstituteofanalytics.org/blog/sarvam-ai-in-education-benefits-and-challenges-2026/)
- [From Language To Learning: Sarvam AI Becomes The New Engine Of Education](https://www.entrepreneurindia.com/blog/en/news/from-language-to-learning-sarvam-ai-becomes-the-new-engine-of-education.59333)
- [Sarvam AI Hits $1.5 Billion Valuation](https://www.techtimes.com/articles/318603/20260618/sarvam-ai-hits-1-5-billion-valuation-hcltech-bets-150-million-india-sovereign-ai.htm)
- [Top 22 EdTech Companies in India in 2026](https://decentro.tech/blog/edtech-companies/)

### Intelligent Tutoring & Learning Analytics
- [AI-enabled predictive analytics in education: Enhancing student success](https://www.researchgate.net/publication/403624782_AI-enabled_predictive_analytics_in_education_Enhancing_student_success_and_retention_through_intelligent_tutoring_systems)
- [The impact of artificial intelligence-based learning tools in academic innovation](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2025.1689205/full)
- [EdTech Trends in 2026: How Intelligence will Redefine Learning Systems](https://www.tcs.com/what-we-do/industries/education/article/edtech-trends-2026-intelligence-redefining-learning-systems)

---

## Conclusion

ClassMind is positioned at the intersection of three active research areas:
1. **Event extraction** (NLP conference track)
2. **Educational AI** (EdTech conference track)
3. **Multilingual/code-switched ASR** (Speech conference track)

The research gap is genuine. The market opportunity is real. The technical challenge is appropriate for a capstone. NMIMS rubrics will be satisfied.

**Proceed to synopsis rewrite with the "Academic Event Extraction" research angle.**
