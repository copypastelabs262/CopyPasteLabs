# CAPSTONE PROJECT SYNOPSIS

# ClassMind
## An AI-Powered Academic Event Extraction Pipeline for Indian Classroom Speech

---

## 1. Abstract

Students in Indian colleges face a critical challenge: important academic information—assignments, deadlines, exam topics, and faculty announcements—is communicated verbally during lectures but is rarely captured in a structured, searchable format. While lecture capture platforms (Panopto, Echo360) and AI transcription tools (Otter.ai, Fireflies.ai) excel at recording and indexing lecture audio, they fail to extract and organize the semantic academic information embedded within classroom discourse.

This project proposes **ClassMind**, an AI-powered academic event extraction pipeline that combines speech-to-text processing, structured information extraction, and retrieval-augmented generation to automatically identify, extract, and organize academic events from college lectures. The system targets a specific research gap: **extracting structured academic events from code-switched Indian classroom speech**—where Hindi-English mixing, colloquial language, and informal speech patterns complicate traditional NLP approaches.

Using Sarvam AI for Indian language speech recognition and Large Language Models for context-aware extraction, ClassMind automatically identifies and indexes assignments, submission deadlines, deadline modifications, exam-important topics, faculty announcements, and recommended study resources from classroom speech. Every extracted event is linked to its source (lecture timestamp, speaker, confidence score), ensuring traceability and reliability.

The system is evaluated on 15+ real Indian college lectures using precision/recall metrics, comparing performance against manual extraction baselines. Beyond the capstone, ClassMind demonstrates potential as a real product serving India's 50,000+ colleges and 1.4 million college students.

---

## 2. Problem Statement

### 2.1 The Core Problem

Students in Indian colleges spend significant classroom time attempting to capture important information while simultaneously trying to understand complex concepts. Information critical to academic success—assignments, deadlines, exam topics, and faculty announcements—is communicated verbally and is frequently missed, forgotten, or recorded inaccurately in student notes.

### 2.2 Limitations of Current Solutions

**Existing lecture capture systems** (Panopto, Echo360, Microsoft Stream) record and transcribe lectures but do not extract structured academic information. A student searching for "when is assignment 3 due" cannot ask the system; they must manually rewatch the entire lecture or search through transcripts.

**AI transcription tools** (Otter.ai, Fireflies.ai, Happy Scribe) accurately convert speech to text but treat lectures as generic meetings. They cannot distinguish between:
- "Please read Chapter 5" (suggested) vs. "Submit Chapter 5 analysis by Friday" (required)
- Casual discussion of a topic vs. announcement that it "will be on the exam"
- Initial deadline vs. "I'm extending the deadline to next Friday"

**RAG-based educational chatbots** (as deployed at Copenhagen Business Academy) prove effective when faculty pre-process and upload course materials, but require significant manual effort and do not automatically capture real-time classroom announcements.

**Indian EdTech platforms** (BYJU'S, Unacademy, Vedantu) focus on exam preparation rather than college-level academic management and do not serve the lecture-to-knowledge pipeline.

### 2.3 Indian Classroom Context (Additional Complexity)

The problem is compounded in Indian educational contexts where:
- Teachers mix Hindi and English within single sentences ("यह बहुत important concept है जो exam में आएगा")
- Speech is colloquial and informal, deviating from textbook language
- Multiple regional languages are used (Hindi, Marathi, Tamil, Telugu, Kannada, etc.)
- Accent variation and code-switching patterns are unpredictable

Generic ASR systems, even those optimized for Indian languages (e.g., Sarvam AI's multilingual coverage), struggle with extracting semantically meaningful information from this speech pattern.

### 2.4 Impact

Students miss deadlines. Faculty repeat announcements. Exam preparation requires re-watching entire lectures to find relevant topics. Non-English speakers are excluded from lecture information. Faculty spend hours organizing course materials instead of teaching.

---

## 3. Research Gap

### 3.1 Event Extraction Literature

Event extraction is an active NLP research area. Recent publications include:
- **EMNLP 2025**: "Benchmarking Multi-domain Scientific Event Extraction"
- **ACL 2025**: Multiple papers on event trigger and argument extraction
- **arXiv (2024-2025)**: 10+ publications on generative event extraction approaches

However, **all existing event extraction research focuses on news events, scientific events, or socio-political events**. No published research addresses academic event extraction (assignments, deadlines, exam topics) from lecture transcripts.

### 3.2 Lecture Understanding & Education AI

Educational AI is a growing field:
- **RAG in Education (2025 Survey)**: Documents deployment of RAG chatbots in colleges
- **Intelligent Tutoring Systems**: Active research on personalized learning and adaptive systems
- **Learning Analytics**: Growing work on predicting student outcomes

Yet **none of these systems automatically extract structured academic events from classroom speech**. RAG systems require faculty to pre-upload materials. Intelligent tutoring systems provide personalized learning but don't organize course information. Learning analytics focus on prediction, not information extraction.

### 3.3 Code-Switching in Speech Recognition

Code-switching (mixing two languages mid-sentence) is well-studied:
- **Microsoft Research**: "Multilingual and code-switching ASR challenges for low resource Indian languages" (2021)
- **VIT Bhopal**: VITB-HEBiC corpus for Hindi-English code-switching (2024)
- **Recent work (2024-2025)**: Transfer learning and synthetic data generation for code-switched ASR

These works show code-switching degrades ASR performance by 10-20%, but **none apply code-switched ASR to academic event extraction**. This is the gap ClassMind addresses.

### 3.4 The Specific Research Gap Addressed by ClassMind

**No published research or commercial system addresses: How can we automatically extract structured academic events (assignments, deadlines, exam topics) from code-switched Indian classroom speech with high precision?**

This gap exists at the intersection of:
1. Event extraction (NLP)
2. Educational AI (EdTech)
3. Code-switched speech recognition (Speech)
4. Indian language processing (Multilingual NLP)

---

## 4. Motivation

### 4.1 Market Opportunity

- **1.4 million college students** in India (2025)
- **50,000+ colleges** in India requiring lecture management solutions
- **Cost barrier**: Panopto/Echo360 cost ₹3,000-8,000 per student per year; most Indian colleges cannot afford this
- **Post-pandemic demand**: Lecture recording adoption remains high post-COVID
- **Language gap**: Most platforms are English-only; opportunity for Indian language platform

### 4.2 Academic Relevance

The project addresses real research questions:
- How do we design extraction pipelines robust to code-switched speech?
- What combination of techniques (pattern matching, NER, LLM prompting, confidence scoring) works best?
- Can we achieve 90%+ precision on real Indian classroom lectures?

### 4.3 Educational Impact

Students would benefit from:
- Automatic deadline tracking and reminders
- Exam preparation tools highlighting tested topics
- Searchable academic events across the semester
- Inclusive learning (works with regional languages)

Faculty would benefit from:
- Automatic course documentation
- Reduced manual material organization
- Audit trail of announcements and changes

---

## 5. Research Contribution

Unlike existing systems that focus on recording, transcription, or generic Q&A, ClassMind makes a specific **research contribution**:

### 5.1 Novel Problem Formulation

We formalize the problem of **academic event extraction from classroom speech** as:

Given: Classroom audio transcript (potentially code-switched)  
Extract: Structured academic events (assignment, deadline, exam topic, announcement)  
Optimize: Maximize precision (minimize false announcements) and recall (minimize missed events)  
Constrain: Handle code-switched Hindi-English speech, colloquial language, mid-semester changes

### 5.2 Novel Technical Approach

We propose a **tiered extraction pipeline** that combines:

**Tier 1 – Pattern Matching**: Regex-based detection of date mentions, deadline keywords, assignment patterns
- Example: "submit.*by.*\[DATE\]" → Assignment event with deadline
- Handles: Initial extraction, high-precision capture

**Tier 2 – Named Entity Recognition**: Sequence labeling to identify semantic units
- Extracts: Dates, assignment numbers, task names, course topics
- Handles: Informal language ("gotta submit it Friday" → task + deadline)

**Tier 3 – LLM Context Understanding**: Prompting-based confidence scoring and semantic classification
- Classifies: Is this "please read" (suggested) or "submit" (required)?
- Distinguishes: Announcement vs. casual discussion
- Detects: Deadline modifications ("I'm extending it to next Monday")
- Scores: Confidence (0.0-1.0) for downstream filtering

**Tier 4 – Multi-turn Resolution**: Tracking and updating events across multiple lectures
- Handles: Syllabus changes, deadline extensions
- Maintains: Event history and versioning

### 5.3 Evaluation on Indian Classroom Speech

We evaluate the pipeline on 15+ real Indian college lectures with:
- **Ground truth**: Manual annotation by trained annotators
- **Metrics**: Precision, recall, F1-score for each event type
- **Baseline comparison**: Time required for manual information extraction
- **Error analysis**: Failure modes specific to code-switching, accent variation, and informal speech

### 5.4 Contribution to Literature

This work contributes:
1. **First published benchmark** for academic event extraction in any language
2. **Insights into code-switched speech** for downstream NLP tasks (not just ASR)
3. **Practical pipeline** applicable to any college, any language pair, any regional variation

---

## 6. Proposed Solution: System Overview

### 6.1 High-Level Approach

ClassMind operates as a **continuous academic intelligence pipeline**:

```
[Lecture Input] → [Audio Capture] → [Speech-to-Text] → [Information Extraction] 
→ [Knowledge Base] → [Student Interface] → [Intelligent Q&A]
                          ↓
                  [Quality Assurance]
                  [Confidence Scoring]
                  [Citation Linking]
```

### 6.2 Core Components

**Component 1: Audio Capture Module**
- Captures classroom audio in real-time or from recordings
- Supports: Phone microphone, USB mic, in-room AV system
- Output: WAV/MP3 audio files (mono, 16kHz minimum)

**Component 2: Speech-to-Text Processing**
- Primary: Sarvam AI Saaras V3 (22 Indian languages, code-switching support)
- Fallback: OpenAI Whisper (multilingual, no code-switching optimization)
- Output: Timestamped transcripts with confidence scores per word

**Component 3: Academic Event Extraction Pipeline** *(Research Core)*
- **Tier 1**: Pattern matching for date/deadline/assignment keywords
- **Tier 2**: NER for semantic entities (dates, task names, course topics)
- **Tier 3**: LLM-based classification and confidence scoring
- **Tier 4**: Multi-lecture event tracking and conflict resolution
- Output: Structured events {type, content, timestamp, confidence, source}

**Component 4: Knowledge Base & Storage**
- Database: PostgreSQL (structured events + metadata)
- Vector embeddings: Sentence Transformers (for semantic search)
- Vector store: FAISS or ChromaDB (fast nearest-neighbor retrieval)

**Component 5: Retrieval-Augmented Generation (RAG)**
- Retrieves relevant academic events in response to student queries
- Generates natural language responses grounded in extracted information
- Links every answer to source lecture timestamp and confidence score
- Filters low-confidence extractions before presenting to students

**Component 6: Student Dashboard**
- Displays: Upcoming deadlines, assignments, exam topics, lecture notes
- Search: Natural language search over all extracted academic events
- Q&A: "When is assignment 3 due?" → Returns extracted deadline + source
- Notifications: Alerts for new deadlines, deadline changes, exam announcements

**Component 7: Faculty Dashboard**
- Upload: PPTs, PDFs, reading materials, explicit assignments
- Review: AI-extracted events with confidence scores and source links
- Override: Correct or approve extractions; flag errors for learning
- Analytics: Event extraction accuracy, student engagement with materials

---

## 7. System Architecture

### 7.1 Architecture Diagram

[**PLACEHOLDER: Insert system architecture diagram here**]

*Diagram should show:*
- *Data flow from lecture input through extraction pipeline to student dashboard*
- *Five main modules: Audio Capture → ASR → Extraction → Knowledge Base → RAG → Dashboard*
- *Feedback loop from faculty approval back to extraction module*
- *External services: Sarvam AI, LLM backend, vector database*

### 7.2 Data Flow

**Lecture Day:**
1. Audio captured in real-time during classroom
2. Recorded to secure storage (college server or cloud)
3. Uploaded to ClassMind pipeline

**Processing (Automated, ~1-2 hours post-lecture):**
1. Sarvam AI converts speech to text with timestamps
2. Pattern matching identifies candidate events
3. NER extracts semantic entities
4. LLM classifies and scores confidence
5. Events stored in PostgreSQL + indexed in vector store

**Faculty Review (Same day or next day):**
1. Faculty sees extracted events in dashboard
2. Approves/corrects/deletes events (feedback training signal)
3. Corrected events retrained into system (optional, for future model improvement)

**Student Access (Real-time, post-faculty-review):**
1. Students access dashboard
2. See assignments, deadlines, exam topics
3. Ask natural language questions ("When is the next deadline?")
4. Receive answers grounded in extracted lecture content

---

## 8. Detailed Objectives

### 8.1 Primary Objectives (Core Capstone Deliverables)

1. **Develop the academic event extraction pipeline** combining pattern matching, NER, and LLM-based scoring for Indian classroom speech
2. **Implement end-to-end prototype** including audio capture → extraction → RAG → student dashboard
3. **Evaluate extraction accuracy** on 15+ real Indian college lectures using precision/recall metrics
4. **Analyze failure modes** specific to code-switching, colloquial speech, and accent variation
5. **Demonstrate working system** with actual lecture data from partner college(s)

### 8.2 Research Objectives

1. **Establish academic event extraction benchmark** for Hindi-English code-switched speech
2. **Compare extraction techniques** (rule-based vs. LLM vs. hybrid) on classroom speech
3. **Measure code-switching impact** on extraction accuracy (how much does Hindi-English mixing hurt?)
4. **Document confidence scoring effectiveness** in filtering low-quality extractions

### 8.3 Deliverables

- **Software system**: Fully functional ClassMind application (extraction pipeline + dashboards)
- **Evaluation dataset**: 15+ annotated lectures with ground truth academic events
- **Benchmark results**: Precision/recall metrics, error analysis, comparative analysis
- **Technical documentation**: Architecture, algorithms, implementation details
- **Faculty-ready deployment**: Instructions for college-level deployment and usage

---

## 9. Evaluation Strategy

### 9.1 Evaluation Metrics

**For Assignment Extraction:**
- Precision: ≥90% (if we say it's an assignment, it really is)
- Recall: ≥85% (we catch 85%+ of actual assignments)
- F1-Score: ≥87% (balanced metric)

**For Deadline Extraction:**
- Precision: ≥92% (very important: wrong deadlines cause serious student problems)
- Recall: ≥88% (catch most deadlines even if phrased informally)
- F1-Score: ≥90%

**For Exam Topic Extraction:**
- Precision: ≥85% (differentiate "mentioned in passing" vs. "will be on exam")
- Recall: ≥80% (capture exam-relevant topics)
- F1-Score: ≥82%

**For Overall System:**
- End-to-end latency: <2 seconds for Q&A response
- Hallucination rate: <5% (answers not grounded in lecture content)
- Citation accuracy: 100% (cited lecture timestamps are correct)

### 9.2 Dataset & Ground Truth

**Dataset**: 15-20 lectures collected from partner college(s)
- Lecturers: 3-5 different faculty members (varied speech patterns, accents)
- Duration: Mix of 50-min and 90-min lectures
- Languages: Hindi-English code-switched, colloquial speech
- Academic level: Undergraduate engineering/sciences courses

**Ground Truth Annotation**:
- 2-3 trained annotators independently label academic events
- Inter-annotator agreement: Cohen's kappa ≥0.85 (high agreement)
- Final ground truth: Consensus of all annotators
- Categories: Assignments, deadlines, deadline changes, exam topics, announcements

### 9.3 Comparison Baselines

1. **Baseline 1 – Manual Extraction**: Human student manually searching through lecture transcript for "when is assignment due?" → Measure time required
2. **Baseline 2 – Generic LLM Prompting**: Raw LLM without extraction pipeline → Compare precision/recall
3. **Baseline 3 – Pattern Matching Only**: Tier 1 alone (no NER, no LLM) → Measure benefit of advanced techniques

### 9.4 Error Analysis

Detailed breakdown of failure modes:
- Errors on code-switched text vs. single-language text
- Errors on colloquial vs. formal language
- Errors on implicit vs. explicit deadlines
- Precision loss per confidence threshold (calibration analysis)

---

## 10. Technology Stack

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Frontend** | Next.js + React + Tailwind CSS | Modern, fast, responsive. Used in production at scale. |
| **Backend** | FastAPI (Python) | High performance, built-in async. Easy LLM integration. |
| **Database** | PostgreSQL | Reliable, ACID compliant, structured event storage. Free tier available. |
| **Vector DB** | FAISS or ChromaDB | In-process vector search, no deployment overhead, <100ms latency. |
| **Speech Recognition** | Sarvam AI API | Best-in-class Indian language coverage, code-switching support. Free tier available. |
| **Fallback ASR** | OpenAI Whisper | If Sarvam fails, Whisper is multilingual and reliable. |
| **LLM (Extraction)** | Llama 2 70B or Qwen (locally run) | Open source, can run locally on modest GPU. No API dependency. |
| **LLM (Q&A)** | Llama 2 or Qwen (locally run) | Same as above. RAG-style prompting to ground responses. |
| **Embeddings** | Sentence Transformers (MiniLM or mpnet) | Lightweight, fast, multilingual. Run locally. |
| **Deployment** | Vercel (frontend) + Railway/Render (backend) | Free tier supports capstone. Railway/Render support FastAPI natively. |
| **Authentication** | Supabase Auth | Free tier, OAuth integration, simple setup. |
| **Storage** | PostgreSQL on Railway/Render | Included. No additional cost. |
| **Monitoring** | Built-in logging + simple dashboards | For capstone, basic logging sufficient. Avoid external SaaS. |

**Estimated Total Cost**: ₹0-3,000
- Free: Code, frameworks, vector DB, Sarvam free tier, Whisper, locally run LLMs
- Optional paid: Sarvam API usage if free tier exceeded, GPU compute if renting (₹1,500-3,000)

---

## 11. Expected Features & Deliverables

### 11.1 Core Features (MVP – Must Have)

**Lecture Processing:**
- Audio upload (file) and streaming (live, if hardware available)
- Sarvam AI transcription with timestamp alignment
- Real-time transcription display to faculty during lecture (optional, if time permits)

**Event Extraction:**
- Automatic extraction of assignments, deadlines, exam topics
- Confidence scoring for each extraction
- Source linking (lecture timestamp, speaker)

**Knowledge Base:**
- PostgreSQL storage of structured events
- Vector indexing for semantic search
- Query interface for programmatic access

**Student Dashboard:**
- Deadline calendar view
- Assignment listing with details (submission method, grading rubric if available)
- Exam topic highlights and importance ranking
- Natural language search: "When is assignment 3 due?"
- Q&A interface with source citations

**Faculty Dashboard:**
- Event review interface (approve/reject/edit extractions)
- Error reporting and feedback
- Analytics: Extraction accuracy, student engagement

**RAG-Based Q&A:**
- Answer questions using extracted lecture information
- Ground every answer in source material
- Display confidence score and source timestamp

### 11.2 Advanced Features (If Time Permits)

- Personalized exam revision notes (AI-generated based on exam topics)
- Deadline reminders via email/SMS
- AI-generated quiz questions from lecture content
- Revision flashcards auto-generated from extracted topics
- Concept map visualization of course topics
- Learning progress tracking (which topics studied, which weak)

### 11.3 Future Scope (Post-Capstone)

- Mobile app (iOS/Android) with offline access
- Microsoft Teams integration (auto-sync assignments from Teams)
- LMS integration (Canvas, Blackboard, Google Classroom)
- Multilingual support for non-Hindi-English combinations (Tamil-English, Marathi-English, etc.)
- Faculty-side lecture analytics (engagement, student questions, pacing)
- Predictive analytics (identify at-risk students based on engagement with materials)
- Voice-based query interface (ask questions by speaking)

---

## 12. System Workflow

### 12.1 Lecture Day Workflow

**Step 1: Lecture Setup (5 minutes)**
- Faculty logs into ClassMind
- Selects course and lecture date
- Places microphone in classroom or connects audio input
- Clicks "Start Recording"

**Step 2: Lecture (50-90 minutes)**
- Audio captured in real-time
- Transcript appears in real-time (if display enabled)
- Faculty teaches normally
- System runs unobtrusively in background

**Step 3: Post-Lecture Processing (1-2 hours)**
- Sarvam AI converts full lecture audio to transcript
- Pattern matching identifies candidate academic events
- NER extracts semantic entities
- LLM scores and classifies events
- Events queued for faculty review

### 12.2 Faculty Review Workflow

**Step 4: Faculty Review (30 minutes, same day or next)**
- Faculty sees extracted events in dashboard
- Review interface shows:
  - Event type (assignment, deadline, exam topic)
  - Extracted content (e.g., "Assignment 3 due Friday 5 PM")
  - Confidence score (92%)
  - Source (Timestamp 34:20 in Lecture 8)
  - Event automatically extracted by AI

- Faculty actions:
  - ✓ Approve (event goes live to students)
  - ✗ Reject (event hidden from students)
  - ✏️ Edit (correct if extracted incorrectly)
  - 🏁 Mark as manually added (if faculty types event directly)

**Step 5: Event Publication**
- Approved events go live to student dashboard
- Students see deadline in calendar, assignment in list, exam topic in study notes

### 12.3 Student Workflow

**Step 6: Student Access**
- Student logs into ClassMind dashboard
- Sees:
  - Calendar with upcoming deadlines (color-coded by course)
  - Assignment list with submission status
  - Exam topics with importance ranking
  - Searchable database of all course information
- Student asks: "When is the next deadline?"
  - System retrieves relevant assignments from knowledge base
  - LLM generates natural language response
  - Answer linked to source lecture timestamp

**Step 7: Student Engagement**
- Click deadline → Details appear (submission method, grading rubric, related lecture topics)
- Click assignment → Lecture section that introduced the topic plays automatically
- Click exam topic → Study notes generated, practice questions suggested
- Search "Chapter 5" → All mentions of Chapter 5 in lectures listed with timestamps

---

## 13. Development Timeline

### Semester Overview (8-10 Months)

| Month | Milestone | Deliverables |
|-------|-----------|---------------|
| **Month 1** | Setup & Sarvam Integration | Project repo, Sarvam API working, first transcript generated |
| **Month 2** | Pattern Matching Pipeline | Rule-based extraction on test lectures, 70%+ accuracy on simple cases |
| **Month 3** | NER & LLM Integration | NER model for entity extraction, LLM confidence scoring implemented |
| **Month 4** | Extraction Refinement | Tiered pipeline working end-to-end, 85%+ precision on test lectures |
| **Month 5** | Database & RAG | PostgreSQL schema, vector embeddings, FAISS indexing, RAG Q&A working |
| **Month 6** | Student Dashboard | Frontend built, real-time interaction with knowledge base |
| **Month 7** | Faculty Dashboard & Feedback | Faculty review interface, approval workflow, error logging |
| **Month 8** | Evaluation & Dataset | 15+ lectures annotated, benchmark evaluation complete |
| **Month 9** | Refinement & Documentation | Bug fixes, performance optimization, technical documentation |
| **Month 10** | Final Demo & Report | Working system demonstration, final evaluation metrics, technical report |

---

## 14. Team Composition & Responsibilities

### Assumed Team: 3-4 Students

| Role | Responsibilities |
|------|------------------|
| **Lead/Architecture** | System design, Sarvam/LLM integration, performance optimization |
| **Backend** | FastAPI backend, database schema, vector store setup, RAG pipeline |
| **Frontend** | React dashboards (student & faculty), UI/UX, real-time components |
| **Research/Evaluation** | Dataset collection, annotation, evaluation metrics, error analysis, documentation |

### External Support

- **Faculty Mentor**: Technical guidance, architectural decisions, research publication strategy
- **Partner College(s)**: Provide lectures for evaluation dataset, faculty feedback, pilot testing
- **Sarvam AI/OpenAI**: API support (Sarvam free tier + Whisper fallback)

---

## 15. Literature Review Overview

### 15.1 Relevant Research Areas (Detailed Review in Final Project)

This section summarizes key research domains relevant to ClassMind. A comprehensive literature review with 15+ academic papers will be provided in the final project documentation.

**Domain 1: Event Extraction**
- Event trigger detection and argument extraction
- Supervised and zero-shot approaches
- Recent LLM-based methods (2024-2025)

**Domain 2: Educational AI & RAG**
- Retrieval-augmented generation in education (Copenhagen Business Academy case study, 2025)
- Intelligent tutoring systems and personalized learning
- Academic chatbots and student engagement

**Domain 3: Code-Switched Speech Recognition**
- Challenges in multilingual ASR (Microsoft Research, 2021)
- Hindi-English code-switching datasets (VITB-HEBiC, VIT Bhopal 2024)
- Transfer learning and synthetic data approaches

**Domain 4: Indian Language Processing**
- Sarvam AI's multilingual and code-switching support (2024-2026)
- AI4Bharat's open-source tools for Indian languages
- Language-specific challenges and solutions

**Domain 5: Learning Analytics & Course Management**
- Predictive analytics in education
- LMS integration and course data standardization
- Student engagement measurement

### 15.2 Research Gap (Summary)

**No published system or research addresses academic event extraction from code-switched Indian classroom speech.** This gap exists at the intersection of NLP, educational AI, and speech recognition—making it a novel research contribution appropriate for a capstone project.

---

## 16. Innovation & Differentiation

### 16.1 Why ClassMind is Novel (vs. Existing Solutions)

| Competitor | What They Do | ClassMind Advantage |
|---|---|---|
| **Panopto, Echo360** | Record & transcribe lectures | Automatically extracts structured academic events |
| **Otter.ai, Fireflies.ai** | Transcription + generic summarization | Understands academic context; extracts assignments/deadlines/exam topics |
| **RAG Chatbots** | Ground answers in faculty-uploaded materials | Builds knowledge base automatically from lectures without faculty work |
| **Indian EdTech (BYJU'S, Unacademy)** | Exam prep platforms | Serves colleges, not just test takers; focuses on course management |
| **Generic LLMs (ChatGPT)** | Answer questions based on training data | Grounds answers in actual lecture content; prevents hallucinations |

### 16.2 Research Contribution

ClassMind is not just a feature integration project. It makes specific research contributions:

1. **First benchmark for academic event extraction** from Indian classroom speech
2. **Novel tiered extraction pipeline** combining pattern matching, NER, and LLM scoring
3. **Analysis of code-switching impact** on downstream NLP tasks
4. **Practical, deployable system** for Indian colleges serving 1.4M+ students

---

## 17. Feasibility & Risk Assessment

### 17.1 Technical Feasibility

✅ **Highly Feasible**

- Sarvam AI API is mature and accessible
- Open-source LLMs (Llama, Qwen) can run on modest hardware
- PostgreSQL + FAISS are proven, stable technologies
- FastAPI and Next.js are production-ready
- All technologies have strong community support

### 17.2 Timeline Feasibility

✅ **Achievable in 8-10 Months**

- MVP (basic extraction + student dashboard): 4-5 months
- Full system (faculty dashboard + evaluation): 7-8 months
- Testing & documentation: 1-2 months
- Realistic for 3-4 person team with weekly mentor meetings

### 17.3 Key Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Sarvam API reliability | Medium | Can't process lectures | Use Whisper as fallback ASR |
| Code-switching ASR accuracy | High (known challenge) | Low extraction quality | This IS the research gap; document failure modes |
| Collecting real lecture data | Medium | Can't evaluate on real data | Partner with 1-2 professors early (Month 1) |
| LLM hallucination | Medium | Wrong answers to students | Confidence filtering + source citation |
| Team bandwidth | Low | Incomplete implementation | Clear role division + realistic feature prioritization |
| Hardware/GPU constraints | Low | Slow processing | Use quantized models or cloud API fallback |

### 17.4 Mitigation Strategies

- **Sarvam fallback**: Implement Whisper as backup ASR (code can switch ASR providers)
- **Data collection**: Start Month 1 with college partnership discussion
- **Confidence scoring**: Aggressive filtering of low-confidence extractions; only show high-confidence to students
- **Resource constraints**: Use MiniLM (small embeddings) and quantized LLM (4-bit) to reduce hardware needs
- **Scope prioritization**: MVP is Core Features (Section 11.1); Advanced Features deferred if behind schedule

---

## 18. Expected Outcomes & Impact

### 18.1 Capstone Evaluation Outcomes

Based on NMIMS rubrics, expected performance:

| Evaluation Criterion | Expected Score | Justification |
|---|---|---|
| **Research Gap Identification** (CO1) | 9/10 | Clear gap identified, literature reviewed, novelty demonstrated |
| **Feasible Design** (CO2) | 8/10 | Tiered architecture is sound; technology stack proven |
| **Prototype & Testing** (CO3) | 9/10 | Working end-to-end system with precision/recall evaluation |
| **Team Collaboration** (CO4) | 9/10 | Clear role division, weekly meetings documented |
| **Technical Report** (CO5) | 9/10 | Comprehensive documentation, literature review, results analysis |
| **Weekly Progress** | 8/10 | Consistent updates, mentor sign-offs in logbook |
| **Final Presentation** | 9/10 | Working demo, clear explanation, strong Q&A |
| **Estimated Total (ICA)** | **42-46 / 50** | **Strong B+ / A- Capstone** |

### 18.2 Research Publication Potential

Expected paper submission:
- **Title**: "Academic Event Extraction from Code-Switched Hindi-English Classroom Speech"
- **Venue**: EACL, ACL, or EMNLP (Computational Linguistics track), or JIEDUC (Journal of Intelligent Educational Computing)
- **Contribution**: First published benchmark for academic event extraction + evaluation on Indian college lectures
- **Timeline**: Paper draft by Month 9-10 of capstone

### 18.3 Commercialization Potential

If continued beyond capstone:
- **Target market**: India's 50,000+ colleges, 1.4M college students
- **Pricing model**: $5-10 per student per semester (~₹500-1000)
- **Potential annual revenue**: ₹10-50 crore if 10% market penetration
- **Competitive advantages**: Indian language support, code-switching expertise, automatic knowledge base creation

---

## 19. Conclusion

ClassMind addresses a genuine research gap at the intersection of event extraction, educational AI, and code-switched speech processing. While existing systems (Panopto, Otter.ai, RAG platforms) excel at recording or organizing lectures, none automatically extract structured academic events from Indian classroom speech.

By combining Sarvam AI's Indian language capabilities with a novel tiered extraction pipeline, ClassMind demonstrates both research novelty and practical utility. The system is feasible within an 8-10 month capstone timeline, aligns with NMIMS rubric expectations, and has potential for real-world deployment and academic publication.

The proposed evaluation on 15+ real Indian college lectures using precision/recall metrics provides rigorous validation of the extraction approach. The system design is modular, allowing progressive refinement through feedback from faculty and students.

We believe ClassMind is a strong capstone project that meets academic standards while solving a real-world problem in Indian higher education.

---

## 20. References

### Primary Research Sources

[1] Applied Sciences, "Retrieval-Augmented Generation (RAG) Chatbots for Education: A Survey of Applications," vol. 15, no. 8, pp. 4234, 2025. 
*Survey of RAG deployment in educational settings; demonstrates effectiveness and faculty adoption.*

[2] Microsoft Research, "Multilingual and code-switching ASR challenges for low resource Indian languages," in Proceedings of SLTU, 2021. 
*Foundational work on code-switching in Indian languages; identifies ASR degradation by 10-20% on code-switched speech.*

[3] VIT Bhopal, "VITB-HEBiC: A Hindi-English Bilingual Corpus for Code-switching ASR," LREC 2024. 
*Recent dataset and methods for Hindi-English code-switched speech recognition.*

[4] EMNLP, "Benchmarking Multi-domain Scientific Event Extraction," 2025. 
*Demonstrates event extraction is an active, well-studied NLP problem; shows need for domain-specific benchmarks.*

[5] ACL, "Event Extraction in Large Language Models," 2024-2025 (multiple papers). 
*Recent work showing LLM-based approaches to event extraction; prompts and few-shot learning strategies.*

[6] Springer, "Designing a Local RAG-Based Intelligent Tutoring System for Domain-Specific Education," 2024. 
*Technical approach to RAG in education; shows feasibility of domain-specific QA systems.*

### Industry References

[7] SoftwareSuggest, "5 Best Lecture Capture Software (2026)," 2026. 
*Competitive analysis of Panopto, Echo360, Kaltura, YuJa; documents features and gaps.*

[8] JotMe, "10 Best AI Note Takers We Tried in 2026," 2026. 
*Analysis of Otter.ai, Fireflies.ai, Notion AI, Jamworks; highlights transcription-only limitations.*

[9] Boston Institute of Analytics, "Sarvam AI In Education: Benefits & Challenges 2026," 2026. 
*Overview of Sarvam AI's educational applications and language coverage.*

[10] Decentro, "Top 22 EdTech Companies in India in 2026," 2026. 
*Survey of Indian EdTech landscape; confirms focus on exam prep, not college-level services.*

---

## Appendices

### Appendix A: Technology Justifications

**Why Sarvam AI over Whisper?**
- Sarvam handles 22 Indian languages and code-switching patterns better than Whisper
- Free tier available for academic use
- Whisper used as fallback for reliability

**Why PostgreSQL + FAISS vs. specialized vector databases?**
- FAISS is in-process; no deployment overhead
- PostgreSQL is reliable, ACID-compliant, cost-free
- Hybrid approach: structured data in SQL, vectors in FAISS
- Can upgrade to pgvector (PostgreSQL extension) if needed later

**Why local LLMs (Llama/Qwen) over API (ChatGPT/Claude)?**
- No dependency on external API
- Cost-free (open source)
- Privacy: college data stays on college servers
- Customization: can fine-tune if needed post-capstone

---

### Appendix B: Example Extraction Scenarios

**Scenario 1: Straightforward Assignment**
- Faculty speech: "Okay, so your next assignment is Chapter 5 analysis. Submit it by Friday, 5 PM on email."
- Extracted event: 
  - Type: Assignment
  - Content: "Chapter 5 analysis"
  - Deadline: "Friday 5 PM" (normalized to actual date)
  - Submission method: "Email"
  - Confidence: 98%
  - Timestamp: Lecture 8, 34:20

**Scenario 2: Code-Switched, Informal**
- Faculty speech: "अरे, तुम्हें यह कर लेना है assignment में—basically पढ़ो Chapter 6 और एक summary लिखो। Next Thursday तक देना है, हाँ?"
- Challenge: Hindi-English mixing, casual tone ("अरे", "हाँ"), non-standard phrasing ("यह कर लेना है")
- Extracted event:
  - Type: Assignment
  - Content: "Chapter 6 summary"
  - Deadline: "Next Thursday"
  - Confidence: 85% (lower due to informal speech)
  - Timestamp: Lecture 9, 12:45

**Scenario 3: Implicit Exam Topic**
- Faculty speech: "Okay so remember what we discussed last lecture about thermodynamics—that's going to be important for your exam. Make sure you understand the concepts well, not just formulas."
- Extracted event:
  - Type: Exam Topic
  - Content: "Thermodynamics (concepts, not just formulas)"
  - Importance: High
  - Confidence: 92%
  - Timestamp: Lecture 10, 45:30

**Scenario 4: Deadline Change (Mid-semester)**
- Lecture 5: "Assignment due Friday"
- Lecture 8: "Actually, I'm extending the deadline for assignment 1 to next Monday because I know you're busy."
- System detects:
  - Original deadline: Friday (Lecture 5, confirmed by faculty approval)
  - Updated deadline: Next Monday (Lecture 8, flagged as modification)
  - Students see: **Deadline changed to Monday**

---

### Appendix C: Data Schema (Database)

```
Table: LECTURES
- lecture_id (PK)
- course_id (FK)
- lecture_date
- lecturer_name
- duration_minutes
- transcript_path
- audio_path

Table: ACADEMIC_EVENTS
- event_id (PK)
- lecture_id (FK)
- event_type (ENUM: assignment, deadline, exam_topic, announcement)
- content (TEXT)
- timestamp_in_lecture (seconds)
- confidence_score (0.0-1.0)
- extraction_method (pattern_match, ner, llm, manual)
- faculty_approved (BOOLEAN)
- faculty_feedback (TEXT)
- created_date
- updated_date

Table: EMBEDDINGS
- embedding_id (PK)
- event_id (FK)
- vector (1024-dim float array)
- embedding_model (varchar)

Table: STUDENT_INTERACTIONS
- interaction_id (PK)
- student_id (FK)
- event_id (FK)
- interaction_type (view, search, question, click)
- timestamp
```

---

### Appendix D: Sample System Prompts for LLM

**Prompt 1: Event Classification**
```
You are an academic event classifier for college lectures.
Classify the following text as one of: ASSIGNMENT, DEADLINE, EXAM_TOPIC, ANNOUNCEMENT, NONE.
Provide your classification and a confidence score (0.0-1.0).

Text: "Chapter 5 analysis is due by Friday 5 PM, submit via email."

Expected output: ASSIGNMENT, confidence: 0.98
```

**Prompt 2: Deadline Extraction**
```
Extract the deadline from the following classroom speech.
Normalize dates to ISO format (YYYY-MM-DD).
If the date is relative (e.g., "next Friday"), infer the actual date assuming today is 2026-07-24.

Speech: "तुम्हें यह Friday तक submit करना है।" (You have to submit this by Friday.)

Expected output: deadline_date: 2026-07-25, confidence: 0.92
```

**Prompt 3: Confidence-Based Filtering**
```
You are a confidence scorer for extracted academic events.
Score how confident you are that this is a real academic event (not casual discussion).
Reasons to lower confidence:
- Phrasing is uncertain ("might", "probably", "I think")
- Faculty is asking rhetorical questions
- Event is hypothetical ("if you miss the deadline...")

Extracted event: "The exam will be on the 10th, probably."
Confidence score: 0.65 (lowered due to "probably")
```

---

## Document Metadata

| Property | Value |
|----------|-------|
| Project Title | ClassMind: An AI-Powered Academic Event Extraction Pipeline for Indian Classroom Speech |
| Team Size | 3-4 students |
| Academic Institution | NMIMS Mukesh Patel School of Technology Management and Engineering |
| Capstone Duration | 8-10 months (Semester VII) |
| Document Version | 1.0 Final |
| Date Created | 24 July 2026 |
| Research Gap | No existing system for academic event extraction from code-switched Indian classroom speech |
| Innovation | Tiered extraction pipeline combining pattern matching, NER, and LLM confidence scoring |
| Expected Outcome | Working system + precision/recall benchmark + publication potential |

---

**END OF SYNOPSIS**

