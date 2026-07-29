# PROJECT 1: CLASSMIND
## An AI-Powered Academic Event Extraction Pipeline for Indian Classroom Speech

---

## ABSTRACT

**Problem**: Students miss assignments, deadlines, and exam topics because they're buried in hour-long lecture recordings. Existing systems (Panopto, Otter.ai) record lectures but **don't extract structured academic information**.

**Solution**: **ClassMind** automatically extracts assignments, deadlines, exam topics, and announcements from classroom speech using a **tiered extraction pipeline** (pattern matching → NER → LLM confidence scoring).

**Key Innovation**: **First system to extract academic events from code-switched Indian classroom speech** (Hindi-English mixing, colloquial language, unpredictable patterns that break standard ASR).

**Outcome**: Working dashboard for deadline tracking, exam prep, and semantic search over course materials.

---

## THE PROBLEM (Why This Matters)

| Pain Point | Current Status | ClassMind Solution |
|---|---|---|
| **Assignment tracking** | Manual LMS entry; students miss deadlines | Auto-extract from lectures |
| **Exam preparation** | Students rewatch entire lectures to find exam topics | Auto-identify exam-important topics |
| **Deadline changes** | Faculty repeat announcements; students still miss updates | Track changes across semester |
| **Non-English speakers** | Excluded from English lecture content | Support Hindi, Marathi, Tamil, etc. |
| **Manual verification** | Faculty spend hours organizing materials | Automatic knowledge base creation |

**Market**: 1.4M college students in India; 50,000+ colleges; current solutions cost ₹3,000-8,000/student/year.

---

## RESEARCH GAP

**What Exists**:
- ✅ Lecture recording (Panopto, Echo360)
- ✅ Speech-to-text (Sarvam, Whisper)
- ✅ Generic AI Q&A (RAG systems)
- ✅ Event extraction research (news/scientific events)

**What's MISSING**:
- ❌ **Academic event extraction from lectures** — No published research or commercial system
- ❌ **Code-switching handling** — Hindi-English mixing breaks ASR; nobody studied academic context
- ❌ **Instruction compliance + hallucination detection** in education domain
- ❌ **Coverage analysis** — identifying what topics were covered vs. omitted

**The Gap**: No unified system combines **requirement verification + hallucination detection + coverage analysis** specifically for **Indian classroom speech with code-switching**.

---

## PROPOSED SOLUTION

### **Tiered Extraction Pipeline** (4 Levels)

```
Lecture Audio → Sarvam ASR → Tiered Extraction → Knowledge Base → Student Dashboard
                (transcription)
                                   ↓
                            TIER 1: Pattern Matching
                            (deadline patterns, keywords)
                                   ↓
                            TIER 2: NER
                            (dates, task names, topics)
                                   ↓
                            TIER 3: LLM Scoring
                            (required vs. suggested, confidence 0-100)
                                   ↓
                            TIER 4: Multi-Lecture Tracking
                            (changes, conflicts, versioning)
```

### **5 Key Modules**

| Module | Function | Output |
|--------|----------|--------|
| **Audio Capture** | Record classroom speech | Timestamped audio |
| **Speech-to-Text** | Sarvam ASI (code-switching aware) + Whisper fallback | Transcript with confidence |
| **Event Extraction** | Pattern + NER + LLM (tiered pipeline) | Structured events {type, content, deadline, confidence} |
| **Knowledge Base** | PostgreSQL + vector embeddings (FAISS) | Searchable academic knowledge |
| **RAG Q&A** | Answer "When is assignment 3 due?" using extracted knowledge | Responses with source citations |

### **Student Dashboard**
- 📅 Deadline calendar (auto-updated)
- 📝 Assignment list with submission status
- 📚 Exam topics with importance ranking
- 🔍 Semantic search ("Chapter 5 → all mentions linked to timestamps")
- 💬 Q&A interface ("When is the next deadline?")

### **Faculty Dashboard**
- ✅ Review AI-extracted events
- ✏️ Approve/reject/edit extractions
- 📊 Analytics (extraction accuracy, student engagement)
- 🔧 Correct errors for continuous improvement

---

## OBJECTIVES

### Primary
**Develop a tiered AI pipeline that extracts academic events from code-switched Indian classroom speech with precision ≥90% for deadlines and ≥85% for assignments.**

### Specific
1. Integrate Sarvam AI for Hindi-English code-switching support
2. Implement pattern matching + NER + LLM confidence scoring (Tier 1-3)
3. Build multi-lecture event tracking (Tier 4)
4. Create PostgreSQL + vector database for knowledge storage
5. Develop RAG-based Q&A with source citations
6. Build student & faculty dashboards
7. Evaluate on 15+ real Indian college lectures
8. Analyze code-switching impact on extraction accuracy

---

## METHODOLOGY

**Phase 1-2** (Month 1-2): Sarvam ASR + pattern matching (Tier 1)  
**Phase 3** (Month 3): NER implementation (Tier 2)  
**Phase 4** (Month 4): LLM confidence scoring (Tier 3)  
**Phase 5** (Month 5): Multi-lecture tracking (Tier 4)  
**Phase 6** (Month 6-7): Dashboard + RAG integration  
**Phase 7-8** (Month 7-9): Evaluation on real lectures + refinement  
**Phase 9-10** (Month 9-10): Final demo + report

---

## TECHNOLOGY STACK

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js + React + Tailwind | Fast, production-ready, responsive |
| **Backend** | FastAPI (Python) | High-performance async, LLM-friendly |
| **Database** | PostgreSQL (Supabase) | ACID compliance, reliability |
| **Speech** | **Sarvam AI** (primary) + Whisper (fallback) | Indian languages + code-switching |
| **LLM** | Llama 2 70B (local) or Qwen | Open-source, no API dependency |
| **Embeddings** | Sentence Transformers (MiniLM) | Lightweight, multilingual |
| **Vector DB** | FAISS or ChromaDB | Fast semantic search, no extra deployment |
| **Deployment** | Vercel (frontend) + Railway (backend) | Free tier sufficient |

**Total Cost**: ₹0-3,000 (free tiers + optional GPU)

---

## EVALUATION METRICS

| Event Type | Precision | Recall | F1-Score |
|------------|-----------|--------|----------|
| **Deadline Extraction** | ≥92% | ≥88% | ≥90% |
| **Assignment Extraction** | ≥90% | ≥85% | ≥87% |
| **Exam Topic Extraction** | ≥85% | ≥80% | ≥82% |

**System Metrics**:
- End-to-end latency: <2 seconds per Q&A
- Hallucination rate: <5%
- Citation accuracy: 100%

**Evaluation Data**: 15+ real lectures from Indian colleges, manually annotated ground truth

---

## RESEARCH CONTRIBUTION

✅ **First benchmark for academic event extraction** from code-switched Hindi-English speech  
✅ **Tiered extraction pipeline** combining pattern matching + NER + LLM (novel combination)  
✅ **Analysis of code-switching impact** on downstream information extraction  
✅ **Practical deployment framework** for Indian college use  
✅ **Publication potential**: Academic paper on "Academic Event Extraction in Code-Switched Classroom Speech"

---

## CAPSTONE FIT (NMIMS Rubric)

| CO | Requirement | ClassMind | Score |
|----|----|----|----|
| **CO1** | Research gap identification | Clear gap in academic event extraction + code-switching + Indian context | 9/10 |
| **CO2** | Feasible design | Tiered pipeline is sound; tech stack proven | 8/10 |
| **CO3** | Prototype + testing | Working system with precision/recall evaluation | 9/10 |
| **CO4** | Team collaboration | Clear module division (4-5 per team member) | 9/10 |
| **CO5** | Technical documentation | Comprehensive report with literature review + methodology | 9/10 |
| **TOTAL (ICA)** | — | **42-46 / 50** | **A- / B+** |

---

## INNOVATION vs. COMPETITORS

| Competitor | What They Do | ClassMind Advantage |
|---|---|---|
| **Panopto / Echo360** | Record + transcribe lectures | **Extracts assignments automatically** |
| **Otter.ai / Fireflies** | Transcription + summarization | **Understands academic context** |
| **Notion AI / OneNote** | Manual note organization + AI | **Automatic capture from lectures** |
| **RAG Chatbots** | General Q&A over documents | **Specific to Indian classroom speech** |
| **Indian EdTech** | Exam prep platforms | **College-level academic management** |

---

## DELIVERABLES

✅ Working ClassMind web application  
✅ Sarvam ASR + extraction pipeline  
✅ Student & faculty dashboards  
✅ Evaluation dataset (15+ annotated lectures)  
✅ Precision/recall benchmarks  
✅ Technical report + research paper draft  

---

## RISKS & MITIGATION

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Sarvam API unreliability | High | Use Whisper as automatic fallback |
| Code-switching accuracy | High | This IS the research gap; document failure modes |
| Ground truth data collection | Medium | Partner with 1-2 professors (Month 1) |
| LLM hallucination | Medium | Confidence filtering + citation tracking |
| Timeline slippage | Medium | Clear phase milestones; cut non-core features if behind |

---

## FUTURE SCOPE

🚀 Multilingual expansion (Tamil-English, Marathi-English, etc.)  
🚀 Mobile app for students  
🚀 LMS integration (Canvas, Blackboard)  
🚀 Attendance tracking from classroom audio  
🚀 AI-generated quizzes from extracted topics  
🚀 Predictive analytics (identify at-risk students)  
🚀 Voice-based query interface  

---

## CONCLUSION

ClassMind solves a **real problem in Indian education**: students lose critical information to lecture fragmentation. 

By combining **Sarvam AI's code-switching capability** with a **tiered extraction pipeline**, ClassMind demonstrates that **academic event extraction from Indian classroom speech is both feasible and high-impact**.

The prototype is **achievable in 9-10 months**, has **clear research novelty** (code-switching + academic context), and **addresses a ₹50-200 crore market opportunity** if deployed across Indian colleges.

