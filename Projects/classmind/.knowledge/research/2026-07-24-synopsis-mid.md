# CAPSTONE PROJECT SYNOPSIS

# ClassMind
## An AI-Powered Academic Event Extraction Pipeline for Indian Classroom Speech

---

## 1. ABSTRACT

Students in Indian colleges face a critical challenge: important academic information—assignments, deadlines, exam topics, and faculty announcements—is communicated verbally during lectures but remains fragmented across recordings, notes, and informal channels. Current lecture capture systems (Panopto, Echo360) record and transcribe lectures but fail to extract structured academic information. AI transcription tools (Otter.ai, Fireflies.ai) convert speech to text but treat lectures as undifferentiated content, unable to distinguish between casual discussion and formal assignments.

**ClassMind** proposes an AI-powered platform that automatically extracts, organizes, and verifies structured academic events from classroom speech using a tiered extraction pipeline combining pattern matching, named entity recognition, and large language model confidence scoring.

**Key innovation**: **First system designed to extract academic events from code-switched Indian classroom speech**, where Hindi-English mixing, colloquial language, and informal speech patterns complicate standard NLP approaches.

The platform enables students to access deadline calendars, assignment lists, exam topics, and semantic search over course materials through intelligent dashboards. Faculty dashboards support review, approval, and continuous refinement of extracted information.

---

## 2. PROBLEM STATEMENT

### Existing Solutions and Their Limitations

**Lecture Capture Systems** (Panopto, Echo360, Microsoft Stream, Kaltura, YuJa):
- 13+ million users globally; widely deployed in institutions
- Provide recording, transcription, and full-text search
- Cannot distinguish between casual discussion and formal assignments
- Do not extract deadline information or requirements
- Do not identify exam-important topics
- Require manual effort to organize extracted information
- No understanding of academic context

**AI Transcription Tools** (Otter.ai, Fireflies.ai, Happy Scribe):
- Accurate speech-to-text conversion across multiple languages
- Provide generic summarization and action item extraction
- Treat lectures as undifferentiated content (same as meetings)
- Cannot classify statements as assignments vs. suggestions
- No capability to identify deadlines or deadline changes
- No concept of exam importance or course structure

**RAG-Based Educational Systems** (Copenhagen Business Academy case study, 2025):
- Demonstrate effectiveness when faculty manually pre-process materials
- Significantly increase student engagement and faculty interest
- Require substantial setup and maintenance burden
- Do not automatically capture real-time classroom announcements
- Lack understanding of classroom discourse patterns
- Require explicit knowledge base population by faculty

### Market Context

**Indian Higher Education**:
- 1.4 million college students (2025)
- 50,000+ colleges requiring academic management solutions
- Post-pandemic continuation of lecture recording adoption
- Cost sensitivity: Current solutions (Panopto, Echo360) cost ₹3,000-8,000 per student per year
- Most institutions cannot afford institutional lecture capture platforms

**Language and Context Challenges**:
- Teachers mix Hindi and English mid-sentence ("यह बहुत important concept है")
- Speech is colloquial and informal, deviating from textbook language
- Multiple regional languages used (Hindi, Marathi, Tamil, Telugu, Kannada)
- Accent variation and code-switching patterns are unpredictable
- Generic ASR systems (even Sarvam AI at baseline) achieve 88-92% accuracy on code-switched speech

### Research Gap

No unified system automatically extracts structured academic events (assignments, deadlines, exam topics) from code-switched Indian classroom speech while maintaining high precision and providing traceability to source material.

**Existing research** addresses:
- Event extraction (ACL 2025, EMNLP 2025): news events, scientific events, socio-political events — NOT academic events from lectures
- Code-switching in ASR (Microsoft Research, VIT Bhopal VITB-HEBiC corpus): Shows ASR degrades 10-20% on code-switched speech — NOT applied to semantic understanding
- Instruction following (IFEval, 25 instruction types, 500 prompts): Frontier models fail 20-40% of instructions — NOT applied to lecture verification

**The gap**: No system combines pattern matching + NER + LLM confidence scoring specifically for academic event extraction from code-switched Indian classroom speech.

---

## 3. PROPOSED SOLUTION

### Architecture Overview

ClassMind operates as a continuous intelligence pipeline:
- **Audio Capture**: Classroom speech recorded at 16kHz mono
- **Transcription**: Sarvam AI (22 Indian languages, code-switching aware) with Whisper fallback
- **Tiered Extraction**: Four-level pipeline identifying academic events
- **Knowledge Base**: PostgreSQL + FAISS vector index for storage and retrieval
- **RAG System**: Answers student queries using extracted knowledge with source citations
- **Dashboards**: Student interface for deadline tracking, exam prep, semantic search; Faculty interface for review and quality control

### Tiered Extraction Pipeline

The extraction process operates through four sequential tiers, each leveraging different techniques:

**Tier 1: Pattern Matching**
- Regex-based detection of deadline patterns: "submit.*by.*[DATE]", "due.*[DATE]"
- Assignment pattern detection: "assignment [NUMBER]", "[TASK] assignment"
- Exam pattern detection: "will be on exam", "important for exam"
- Announcement patterns: "remember", "important", "note this"
- Output: Candidate events with high precision, potentially lower recall

**Tier 2: Named Entity Recognition**
- Identifies temporal expressions: "Friday", "25th July", "next week"
- Extracts assignment descriptors: "Chapter 5 analysis", "project report"
- Recognizes course topics: "thermodynamics", "database design"
- Handles informal language variations and aliases
- Links entities to candidate events from Tier 1

**Tier 3: LLM Confidence Scoring**
- Classifies extracted statements: ASSIGNMENT, DEADLINE, EXAM_TOPIC, ANNOUNCEMENT, or NONE
- Differentiates: Required vs. suggested, Explicit vs. tentative, Certain vs. uncertain
- Assigns confidence scores (0.0-1.0) based on linguistic cues and context
- Justifies each classification with extracted reasoning

**Tier 4: Multi-Lecture Tracking**
- Cross-references events across multiple lectures within a course
- Detects deadline modifications and updates
- Maintains event version history
- Resolves conflicts when information changes
- Links related events (assignment mentioned in Lecture 5, deadline in Lecture 5, reminder in Lecture 8)

### Data Organization

Extracted events include:
- Event type, content, confidence score, source timestamp
- Speaker identity and lecture reference
- Faculty approval status and any corrections
- Complete version history tracking changes over semester
- Semantic embeddings for retrieval

**Knowledge Base**: PostgreSQL for structured data + FAISS for semantic similarity search enabling sub-100ms retrieval

### Student Interface Features

- Deadline calendar with auto-updated dates and course color-coding
- Assignment list with submission methods and status tracking
- Exam topics ranked by frequency and importance
- Semantic search ("Chapter 5" returns all mentions with timestamps)
- Q&A interface answering "When is assignment 3 due?" with source citations and confidence

### Faculty Interface Features

- Review extracted events with confidence scores and source links
- Approval workflow: accept, reject, or edit extractions
- Feedback collection for continuous model improvement
- Analytics on extraction accuracy and student engagement

---

## 4. RESEARCH CONTRIBUTION

### Why This Matters Academically

**Event Extraction Literature** (2024-2025):
Recent publications benchmark event extraction across multiple domains. EMNLP 2025 published "Benchmarking Multi-domain Scientific Event Extraction" with comprehensive evaluation methodology. However, all existing event extraction research focuses on news, scientific, or socio-political domains. **No published benchmark exists for academic event extraction from lectures.**

**Code-Switching and Speech Recognition** (2024-2025):
Microsoft Research documented that code-switching degrades ASR performance by 10-20% on Indian languages. VIT Bhopal created VITB-HEBiC corpus for Hindi-English code-switching. However, **no work applies code-switched speech understanding to semantic tasks like academic event extraction.**

**Instruction Following Evaluation** (2024-2025):
IFEval benchmark tests 25 instruction types with ~500 prompts. Recent work (RubricEval, The Compliance Gap) shows frontier models fail 20-40% of explicit instructions. This demonstrates instruction compliance is understudied. However, **instruction compliance checking has not been applied to classroom verification contexts.**

### Specific Research Contribution

This project contributes:

1. **First dataset for academic event extraction** from code-switched Hindi-English classroom speech, providing benchmark for future research
2. **Tiered extraction methodology** demonstrating effectiveness of combining pattern matching, NER, and LLM scoring for domain-specific extraction
3. **Analysis of code-switching impact** on downstream semantic understanding, extending prior work on code-switched ASR to comprehension tasks
4. **Evaluation framework** for instruction compliance in classroom contexts, adapting IFEval methodology to educational scenarios
5. **Practical deployment system** demonstrating feasibility of automated academic event management in Indian colleges

Results are publication-ready for EMNLP, ACL, or educational technology venues.

---

## 5. OBJECTIVES

### Primary Research Objective

Develop a tiered AI extraction pipeline that automatically identifies, extracts, and verifies structured academic events from code-switched Indian classroom speech, achieving precision ≥90% for deadline extraction and demonstrating feasibility of AI-assisted academic event management in Indian educational contexts.

### Technical Objectives

1. Integrate Sarvam AI speech recognition to handle Hindi-English code-switching and colloquial speech
2. Implement pattern-matching algorithms for deadline and assignment detection
3. Develop NER system for semantic entity extraction
4. Build LLM-based confidence scoring with explainability
5. Create multi-lecture event tracking with version management
6. Design knowledge base architecture for efficient retrieval
7. Implement RAG-based Q&A with source citations
8. Develop student and faculty dashboard interfaces
9. Evaluate pipeline on 15+ real Indian college lectures against manual ground truth
10. Analyze performance degradation specific to code-switching patterns

---

## 6. METHODOLOGY

### System Components

**Audio Processing Pipeline**:
- Sarvam AI Saaras V3 (primary ASR engine for Indian languages)
- OpenAI Whisper (fallback for reliability)
- Timestamped transcript generation with per-word confidence scores

**Event Extraction**:
- Tier 1: Regex pattern library for academic keywords and date expressions
- Tier 2: spaCy-based NER for entity recognition
- Tier 3: LLM (Llama 2 70B or Qwen) for context-aware classification and scoring
- Tier 4: Multi-lecture correlation and change tracking

**Knowledge Infrastructure**:
- PostgreSQL for structured event storage with complete metadata
- Sentence Transformers (MiniLM/MPNet) for semantic embeddings
- FAISS vector index for fast similarity-based retrieval
- LangChain for LLM workflow orchestration

**User Interfaces**:
- Next.js + React frontend for interactive dashboards
- FastAPI backend for high-performance query processing
- Real-time updates for faculty feedback incorporation

### Evaluation Approach

**Precision-Focused Metrics**:
- Deadline extraction: Precision ≥92%, Recall ≥88%, F1 ≥90% (prioritizing no false deadlines)
- Assignment extraction: Precision ≥90%, Recall ≥85%, F1 ≥87%
- Exam topic extraction: Precision ≥85%, Recall ≥80%, F1 ≥82%

**System-Level Metrics**:
- End-to-end latency for student queries
- Hallucination rate (unsupported claims in extracted events)
- Citation accuracy (source timestamp correctness)

**Ground Truth Dataset**:
- 15-20 real lectures from partner Indian colleges
- Diverse faculty (3-5 people) with varied speech patterns and accents
- Mix of 50-minute and 90-minute sessions
- Code-switched Hindi-English content
- Undergraduate and graduate level courses
- Manual annotation by trained annotators with inter-annotator agreement validation

**Performance Analysis**:
- Benchmark against manual extraction (time required, accuracy, completeness)
- Comparative evaluation across multiple lecture types
- Detailed error analysis identifying systematic failure modes
- Code-switching impact quantification

---

## 7. TECHNOLOGY STACK

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Frontend** | Next.js + React + Tailwind CSS | Production-grade performance, responsive design |
| **Backend** | FastAPI (Python) | High-performance async, native LLM integration |
| **Database** | PostgreSQL (Supabase) | ACID compliance, structured event storage |
| **Speech Recognition** | Sarvam AI (primary) + Whisper (fallback) | Best Indian language + code-switching support |
| **LLM** | Llama 2 70B or Qwen (Ollama) | Open-source, no API dependency, cost-effective |
| **Embeddings** | Sentence Transformers (MiniLM/MPNet) | Lightweight, multilingual, fast retrieval |
| **Vector Database** | FAISS or ChromaDB | In-process deployment, sub-100ms latency |
| **NLP** | spaCy | Entity recognition, tokenization |
| **LLM Framework** | LangChain | Workflow orchestration, prompt management |
| **Deployment** | Vercel (frontend), Railway/Render (backend) | Serverless, free tier suitable for MVP |

**Infrastructure Cost**: ₹0-3,000 (primarily free open-source; optional GPU compute if needed)

---

## 8. INNOVATION AND DIFFERENTIATION

### Comparison with Existing Systems

**vs. Lecture Capture** (Panopto, Echo360):
- Automatically extract structured academic information instead of requiring manual search
- Understand academic context rather than treating lectures as undifferentiated content
- Provide deadline tracking and exam preparation capabilities

**vs. AI Transcription** (Otter.ai, Fireflies.ai):
- Classify statements by academic significance rather than generic summarization
- Handle Indian classroom speech patterns including code-switching
- Link information back to source timestamps with confidence scoring

**vs. RAG-Based Systems**:
- Eliminate faculty burden of material pre-processing
- Automatically build knowledge bases from lectures
- Verify completeness and consistency of extracted information
- Provide structured event organization

### Research Novelty

1. **First academic event extraction dataset** from code-switched Hindi-English classroom speech
2. **Tiered extraction methodology** combining pattern matching, NER, and LLM scoring for domain-specific extraction
3. **Code-switching impact analysis** extending prior ASR research to semantic understanding tasks
4. **Instruction compliance framework** for classroom contexts, adapting IFEval to educational scenarios

---

## 9. FEASIBILITY AND RISK ASSESSMENT

### Technical Feasibility

All required technologies are mature with proven implementations. Sarvam AI supports 22 Indian languages with documented code-switching capabilities. Llama 2 and Qwen are open-source with established deployment patterns. FAISS and ChromaDB are widely used for production vector search.

The primary technical challenge is careful design of the tiered pipeline to balance precision and recall. Code-switching introduces variability in speech patterns that may require prompt engineering and validation against real classroom data.

### Realistic Risks

**Sarvam API Reliability**: Fallback to Whisper ensures system continues functioning. Design system to operate with either ASR engine.

**Code-Switching Accuracy Limitations**: Acknowledge that code-switching in real Indian classrooms may introduce patterns not covered in standard datasets. Document failure modes thoroughly in final evaluation.

**Ground Truth Collection**: Requires partnership with colleges for lecture access and student annotation efforts. Establish partnerships early and secure necessary approvals.

**LLM Confidence Scoring Drift**: Requires careful calibration and validation against human judgment. Use human-in-loop feedback to refine scoring thresholds.

---

## 10. EXPECTED OUTCOMES

### Technical Deliverables

- Working ClassMind application with complete extraction pipeline
- Evaluation dataset (15+ annotated lectures with ground truth)
- Performance benchmarks and comparative analysis across lecture types
- Complete technical documentation
- Research manuscript for academic publication

### Evaluation Results

Expected performance on evaluation dataset:
- Deadline extraction: 90-95% precision, 85-90% recall, 87-92% F1
- Assignment extraction: 88-92% precision, 82-88% recall, 85-90% F1
- Exam topic extraction: 82-88% precision, 78-84% recall, 80-86% F1
- Strong performance on non-code-switched content with documented degradation patterns on code-switched speech

### Real-World Impact

If deployed across Indian colleges:
- Reduce time for students to locate deadline information by 50-70%
- Improve exam preparation efficiency through automated topic identification
- Provide accessible learning support for non-English speakers
- Reduce faculty administrative burden for course material organization

---

## 11. CONCLUSION

ClassMind addresses a genuine and underserved need in Indian higher education: automatic extraction and organization of critical academic information from classroom speech. By combining Sarvam AI's language capabilities with a tiered extraction pipeline optimized for code-switched speech, the system demonstrates that high-precision academic event extraction is technically feasible even in challenging linguistic environments.

The research contribution is novel and publishable, combining three underexplored research areas (academic event extraction, code-switching in semantic tasks, instruction compliance in educational contexts). The potential impact on student learning outcomes and faculty productivity is significant, with clear pathways for deployment across India's 50,000+ colleges.

