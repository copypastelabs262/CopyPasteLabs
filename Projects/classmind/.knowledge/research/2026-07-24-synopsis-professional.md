# CAPSTONE PROJECT SYNOPSIS

# ClassMind
## An AI-Powered Academic Event Extraction Pipeline for Indian Classroom Speech

---

## 1. ABSTRACT

Students in Indian colleges face a critical challenge: important academic information—assignments, deadlines, exam topics, and faculty announcements—is communicated verbally during lectures but remains fragmented across recordings, notes, and informal channels. Current solutions (Panopto, Echo360, Otter.ai) record and transcribe lectures but fail to extract structured academic information.

This project proposes **ClassMind**, an AI-powered platform that automatically extracts, organizes, and tracks academic events from classroom speech. Using a tiered extraction pipeline combining pattern matching, named entity recognition, and large language model confidence scoring, ClassMind identifies assignments, deadlines, exam topics, and announcements from code-switched Indian classroom speech.

The system addresses a specific research gap: extracting structured academic events from Indian classrooms where Hindi-English code-switching, colloquial language, and informal speech patterns complicate standard NLP approaches. Every extracted event is linked to its source (lecture timestamp, speaker, confidence score) and made accessible through intelligent dashboards for students and faculty.

The prototype demonstrates feasibility within an 8-10 month development timeline and has potential for deployment across India's 50,000+ colleges serving 1.4 million college students.

---

## 2. PROBLEM STATEMENT

### Current State

Students spend classroom time simultaneously taking notes and understanding concepts. Critical information—assignments, deadlines, exam topics, policy changes—is communicated verbally and frequently missed or recorded inaccurately. Faculty must repeat announcements because students miss information the first time.

### Existing Solutions and Their Limitations

**Lecture Capture Systems** (Panopto, Echo360, Microsoft Stream):
- Provide recording and full-text search of transcripts
- Do not extract structured academic information
- Cannot distinguish between casual discussion and formal assignments
- Require manual effort to organize and retrieve deadline information

**AI Transcription Tools** (Otter.ai, Fireflies.ai):
- Convert speech to text accurately
- Provide generic summaries
- Treat lectures as undifferentiated content
- Cannot classify statements as assignments, deadlines, or suggestions

**RAG-Based Educational Systems**:
- Function when faculty manually pre-process and upload course materials
- Require significant setup and maintenance burden
- Do not automatically capture real-time classroom announcements
- Lack understanding of classroom context

### Indian Classroom Context

The problem is compounded in Indian educational settings where:
- Teachers mix Hindi and English within single sentences (code-switching)
- Speech is colloquial and informal, deviating from formal language models
- Multiple regional languages are used with unpredictable accent patterns
- Standard ASR systems struggle with accuracy in this linguistic environment

### Gap in Current Solutions

No unified system automatically extracts structured academic events (assignments, deadlines, exam topics) from code-switched Indian classroom speech while maintaining high precision and providing traceability to source material.

---

## 3. RESEARCH MOTIVATION

### Academic Context

Event extraction is an active research area in natural language processing, with recent publications (EMNLP 2025, ACL 2025) addressing event trigger detection and argument extraction. However, existing research focuses on news events, scientific events, and socio-political events. No published work addresses academic event extraction from lecture transcripts.

Recent research on instruction following (IFEval benchmark with ~500 prompts testing 25 instruction types) shows that frontier AI models fail 20-40% of explicit instructions. This suggests that instruction compliance checking remains an understudied problem in practical applications.

Code-switching in speech recognition has been studied by Microsoft Research and VIT Bhopal (VITB-HEBiC corpus), demonstrating that code-switching degrades ASR performance by 10-20%. However, no work applies code-switched ASR to academic event extraction.

AI trustworthiness frameworks (NIST AI RMF, EU AI Act) define multiple dimensions of trustworthy AI but lack practical operationalization for end-user verification of AI-generated content.

### Research Gap

The specific gap this project addresses: **How can we systematically extract structured academic events (assignments, deadlines, exam topics) from code-switched Indian classroom speech while maintaining high precision and providing full traceability?**

This gap exists at the intersection of three underexplored areas:
- Event extraction applied to academic domain (no existing benchmark or published dataset)
- Instruction following evaluation applied to document/lecture verification (currently benchmarked but not deployed)
- Code-switched speech processing applied to academic contexts (studied for ASR but not for semantic understanding)

---

## 4. PROPOSED SOLUTION

### System Design

ClassMind consists of an integrated pipeline that processes classroom audio, extracts academic events through a tiered verification approach, and provides structured access to course information through intelligent interfaces.

### Core Processing Pipeline

**Audio Capture and Transcription**
- Records classroom audio at 16kHz mono resolution
- Processes transcription through Sarvam AI Saaras V3 (covering 22 Indian languages with code-switching support)
- Falls back to OpenAI Whisper if primary system unavailable
- Generates timestamped, confidence-scored transcripts

**Tiered Extraction Pipeline**

The extraction pipeline employs four sequential tiers, each building on the previous stage:

**Tier 1: Pattern Matching** — Regex-based detection of deadline patterns, assignment keywords, and exam references. Output: candidate events with high precision but potentially lower recall.

**Tier 2: Named Entity Recognition** — Sequence labeling identifies dates, assignment descriptors, course topics, and other entities. Handles informal language variations and aliases.

**Tier 3: LLM Context Understanding** — Large language model prompt-based classification determines instruction type (required vs. suggested), deadline certainty (explicit vs. tentative), and assigns confidence scores (0.0-1.0).

**Tier 4: Multi-Lecture Tracking** — Cross-references events across multiple lectures, detects deadline modifications, maintains event history, and resolves conflicts.

### Data Organization

Extracted events are stored with complete metadata:
- Event type, content, source timestamp, speaker identity
- Confidence score from extraction process
- Faculty approval status and any corrections
- Version history tracking changes across semester

**Knowledge Base Architecture**
- PostgreSQL stores structured event data with full ACID compliance
- Semantic embeddings (Sentence Transformers) generate vector representations
- FAISS index enables rapid similarity-based retrieval
- Citation links maintain traceability to source material

### Student Interface

The student dashboard provides multiple access patterns to course information:
- Deadline calendar displaying all upcoming assignments with color-coded courses
- Assignment list with submission methods, status tracking, and related resources
- Exam topic highlights indicating frequency of mention and importance signals
- Semantic search enabling natural language queries ("When is the next deadline?")
- Q&A interface retrieving answers from extracted lecture content with source citations

### Faculty Interface

The faculty dashboard enables quality oversight and continuous improvement:
- Review interface displaying AI-extracted events with extraction confidence
- Approval workflow marking events as correct, requiring correction, or requiring rejection
- Edit capability allowing faculty to refine extracted information
- Feedback collection for continuous model improvement
- Analytics on extraction accuracy and student engagement patterns

---

## 5. OBJECTIVES

### Primary Research Objective

Develop a tiered AI extraction pipeline that automatically identifies, extracts, and verifies structured academic events from code-switched Indian classroom speech, achieving precision ≥90% for deadline extraction and demonstrating the feasibility of AI-assisted academic event management in Indian educational contexts.

### Specific Technical Objectives

1. Integrate Sarvam AI speech recognition to handle Hindi-English code-switching and colloquial classroom speech
2. Implement pattern-matching algorithms for deadline and assignment pattern detection
3. Develop NER system for extracting semantic entities (dates, task names, course topics)
4. Build LLM-based confidence scoring system with explainability
5. Create multi-lecture event tracking with version management
6. Design PostgreSQL schema and vector database indexing for efficient retrieval
7. Implement RAG-based Q&A system with source citation and confidence reporting
8. Develop student and faculty dashboard interfaces with complete workflow support
9. Evaluate extraction pipeline on 15+ real Indian college lectures against manual ground truth
10. Analyze performance degradation specific to code-switching and colloquial language patterns

---

## 6. METHODOLOGY

### Development Timeline

| Phase | Months | Deliverables |
|-------|--------|--------------|
| **Audio Processing & ASR** | 1-2 | Sarvam AI integration, fallback mechanism, transcript generation |
| **Pattern Matching (Tier 1)** | 2-3 | Rule-based extraction, candidate event generation, baseline accuracy measurement |
| **NER Implementation (Tier 2)** | 3-4 | Entity extraction model, handling of informal language, entity linking |
| **LLM Scoring (Tier 3)** | 4-5 | Classification pipeline, confidence scoring, explainability framework |
| **Event Tracking (Tier 4)** | 5-6 | Multi-lecture correlation, change detection, version management |
| **Database & RAG** | 6-7 | PostgreSQL schema, vector embedding, retrieval implementation, Q&A system |
| **Dashboard Development** | 7-8 | Student interface, faculty interface, analytics visualization |
| **Evaluation & Refinement** | 8-9 | Ground truth dataset creation, evaluation metrics, error analysis |
| **Documentation & Demo** | 9-10 | Technical report, research paper, capstone presentation |

### Evaluation Framework

Performance is measured across three event types with distinct evaluation criteria:

**Deadline Extraction** — Target: Precision ≥92%, Recall ≥88%, F1-Score ≥90%
Evaluated against manually annotated ground truth from lecture transcripts. Precision prioritized to avoid false deadline announcements; recall ensures most actual deadlines are captured.

**Assignment Extraction** — Target: Precision ≥90%, Recall ≥85%, F1-Score ≥87%
Distinguishes between suggested readings and formal assignments. Evaluated on specificity of assignment identification.

**Exam Topic Extraction** — Target: Precision ≥85%, Recall ≥80%, F1-Score ≥82%
Identifies statements indicating exam relevance. Challenges include implicit references and topic importance weighting.

**System-Level Metrics**
- End-to-end processing latency
- Hallucination rate (unsupported claims)
- Citation accuracy (timestamp correctness)

### Dataset and Ground Truth

Evaluation uses 15-20 real lecture recordings from partner Indian colleges:
- Diverse faculty members (3-5) representing varied speech patterns and accents
- Mix of 50-minute and 90-minute class sessions
- Code-switched Hindi-English content with colloquial speech
- Undergraduate and graduate level courses

Ground truth annotation follows inter-annotator agreement protocols with consensus-based final labels.

---

## 7. SYSTEM ARCHITECTURE

### Component Overview

```
Lecture Input
    │
    ├─► Audio Capture
    │
    ├─► Speech-to-Text (Sarvam AI + Whisper fallback)
    │
    ├─► Tiered Extraction Pipeline
    │   ├─ Tier 1: Pattern Matching
    │   ├─ Tier 2: Named Entity Recognition
    │   ├─ Tier 3: LLM Confidence Scoring
    │   └─ Tier 4: Multi-Lecture Tracking
    │
    ├─► PostgreSQL Storage + FAISS Vector Index
    │
    ├─► RAG Query Processing
    │
    └─► Dashboard Interface (Student + Faculty)
```

### Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Frontend** | Next.js + React + Tailwind CSS | Production-grade performance, responsive design, rapid development |
| **Backend** | FastAPI (Python) | High-performance async framework, native LLM integration capabilities |
| **Database** | PostgreSQL (Supabase) | ACID compliance, reliability, structured event storage |
| **Speech Recognition** | Sarvam AI (primary), Whisper (fallback) | Best coverage for Indian languages and code-switching patterns |
| **LLM** | Llama 2 70B or Qwen (locally hosted via Ollama) | Open-source, no API dependency, cost-effective at scale |
| **Embeddings** | Sentence Transformers (MiniLM or MPNet) | Lightweight, multilingual, fast semantic search |
| **Vector Database** | FAISS or ChromaDB | In-process deployment, sub-100ms retrieval latency |
| **NLP Toolkit** | spaCy | Entity recognition, tokenization, linguistic processing |
| **LLM Framework** | LangChain | Workflow orchestration, prompt management |
| **Deployment** | Vercel (frontend), Railway/Render (backend) | Serverless deployment, free tier sufficient for MVP |

**Estimated Infrastructure Cost**: ₹0-3,000 (primarily free open-source components; optional GPU compute if needed)

---

## 8. INNOVATION AND DIFFERENTIATION

### Comparison with Existing Systems

**vs. Lecture Capture Systems** (Panopto, Echo360):
- Extract structured academic events automatically rather than requiring manual search through recordings
- Understand academic context rather than treating lectures as undifferentiated content
- Provide deadline tracking and exam preparation features

**vs. Transcription Tools** (Otter.ai, Fireflies.ai):
- Classify statements by academic significance rather than generic summarization
- Handle Indian classroom speech patterns including code-switching
- Link extracted information back to source timestamps

**vs. RAG-Based Systems**:
- Eliminate faculty burden of pre-processing and uploading course materials
- Automatically build knowledge base from lectures without manual intervention
- Verify completeness and consistency of extracted information

### Research Contribution

This project contributes to the academic literature in the following ways:

1. **First dataset for academic event extraction** from code-switched Hindi-English classroom speech, providing a benchmark for future research
2. **Tiered extraction methodology** combining pattern matching, NER, and LLM scoring, demonstrating effectiveness for domain-specific information extraction
3. **Analysis of code-switching impact** on downstream semantic understanding tasks, extending prior work on code-switched ASR
4. **Evaluation of instruction compliance** in educational contexts, applying and extending IFEval methodology to classroom scenarios

Results are suitable for publication at venues including EMNLP, ACL, and domain-specific educational technology conferences.

---

## 9. DEVELOPMENT REQUIREMENTS

### Team Structure

Recommended team composition (3-4 students):

**Role 1: Audio Processing & ASR**
- Responsible for Sarvam AI integration, fallback mechanisms, transcript quality assurance
- Modules: Audio Capture, Speech-to-Text Processing

**Role 2: Event Extraction Pipeline**
- Responsible for pattern matching, NER implementation, LLM integration
- Modules: Tiers 1-3 of extraction pipeline

**Role 3: Database & Knowledge Base**
- Responsible for PostgreSQL schema design, vector indexing, retrieval optimization
- Modules: Knowledge Base, Multi-Lecture Tracking

**Role 4: Frontend & Integration**
- Responsible for dashboard development, user interface, system integration
- Modules: Student Dashboard, Faculty Dashboard, RAG Interface

### External Resources

- **Partner College**: Access to 15-20 real lectures for evaluation dataset
- **Faculty Mentor**: Technical guidance on architecture and research methodology
- **Sarvam AI**: Free tier API access for Indian language processing

---

## 10. FEASIBILITY AND RISK ASSESSMENT

### Technical Feasibility

The proposed solution is technically feasible with moderate risk. All required technologies (Sarvam AI, Whisper, LangChain, FastAPI, PostgreSQL, FAISS) are mature, well-documented, and have proven deployment patterns. The core challenge is implementation of the tiered extraction pipeline, which requires careful prompt engineering and evaluation.

### Timeline Feasibility

The 9-10 month development timeline is achievable with clear phase dependencies and milestone tracking. Critical path includes:
1. Sarvam AI integration (Month 1-2) — gates all downstream work
2. Extraction pipeline implementation (Month 2-5) — core research component
3. Evaluation and refinement (Month 7-9) — requires complete system integration

### Identified Risks and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Sarvam API reliability issues | Medium | High | Implement automatic fallback to Whisper; design system to work with either ASR engine |
| Code-switching accuracy limitations | High | High | Document failure modes thoroughly; acknowledge limitations in final report |
| Difficulty collecting real lecture data | Medium | High | Establish partnerships with partner colleges in Month 1; secure necessary approvals |
| LLM hallucination in confidence scoring | High | Medium | Implement confidence filtering; only surface high-confidence extractions to students |
| Timeline slippage | Medium | Medium | Prioritize core features; defer advanced features if behind schedule |

---

## 11. EXPECTED OUTCOMES

### Technical Deliverables

- Working ClassMind application with full extraction pipeline
- Evaluation dataset (15+ annotated lectures with ground truth)
- Performance benchmarks and comparative analysis
- Complete technical documentation
- Research manuscript suitable for academic publication

### Evaluation Results

Expected results on evaluation dataset:
- Deadline extraction: Precision 90-95%, Recall 85-90%, F1 87-92%
- Assignment extraction: Precision 88-92%, Recall 82-88%, F1 85-90%
- Exam topic extraction: Precision 82-88%, Recall 78-84%, F1 80-86%
- Overall system reliability with strong performance on non-code-switched content and documented degradation patterns on code-switched speech

### Real-World Impact

If deployed across Indian colleges:
- Reduce time required for students to locate deadline information by approximately 50-70%
- Improve exam preparation efficiency through automated topic identification
- Provide accessible learning support for non-English speakers
- Reduce faculty administrative burden for course material organization

---

## 12. FUTURE DIRECTIONS

Potential extensions beyond the current scope include:

**Multilingual Support**: Expansion to additional Indian language pairs (Tamil-English, Marathi-English, Telugu-English)

**Extended Domains**: Application to code verification, legal document analysis, healthcare report verification

**Advanced Features**: Mobile application, voice-based query interface, predictive analytics for student performance, integration with learning management systems

**Scalability**: Cloud deployment patterns supporting institution-wide use, multi-tenant architecture

---

## 13. CONCLUSION

ClassMind addresses a genuine and underserved need in Indian higher education: the automatic extraction and organization of critical academic information from classroom speech. By combining Sarvam AI's language capabilities with a carefully designed tiered extraction pipeline, the system demonstrates that high-precision academic event extraction is technically feasible even in the challenging environment of code-switched, colloquial classroom speech.

The proposed 8-10 month development timeline is realistic, the research contribution is novel and publishable, and the potential impact on student learning outcomes and faculty productivity is significant. The prototype focuses on a well-scoped, high-value use case (document intelligence verification) while leaving clear pathways for future extension and commercialization.

