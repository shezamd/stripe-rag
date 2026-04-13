# Stripe RAG — Retrieval-Augmented Generation with Evaluation

A full-stack RAG pipeline built over the Stripe API documentation, with a Next.js evaluation dashboard measuring **Precision@k**, **Recall@k**, **Faithfulness**, **Answer Relevance**, and **Answer Correctness**.

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js)
![Claude](https://img.shields.io/badge/LLM-Claude_Haiku_4.5-8A2BE2)
![ChromaDB](https://img.shields.io/badge/Vector_Store-ChromaDB-orange)
![FastAPI](https://img.shields.io/badge/API-FastAPI-009688?logo=fastapi)

---

## What This Is

Most RAG tutorials stop at "retrieve chunks, call an LLM". This project goes further:

- **Real document corpus** — scraped and chunked Stripe API docs (17 live pages + curated static content)
- **Semantic retrieval** — sentence-transformer embeddings indexed in ChromaDB with HNSW (cosine similarity)
- **Grounded generation** — Claude Haiku 4.5 with adaptive thinking, instructed to cite sources and not hallucinate
- **5-metric evaluation suite** — keyword-based Precision@k / Recall@k plus LLM-judged Faithfulness, Answer Relevance, and Answer Correctness over 20 ground-truth Q&A pairs
- **Full-stack dashboard** — Next.js + Tailwind frontend with four views: Ask, Evaluate, Corpus, and Inspector

---

## Architecture

```
┌────────────────���──────────────────────────────────┐
│  INGESTION                                          │
│  Stripe Docs → chunk (800 chars, 150 overlap)       │
│             → embed (all-MiniLM-L6-v2, 384-dim)     │
│             → store (ChromaDB / HNSW cosine)        │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  RETRIEVAL                                          │
│  Query → embed → cosine search → top-k chunks       │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  GENERATION                                         │
│  Chunks + query → Claude Haiku 4.5 → answer         │
│  (adaptive thinking · cite sources · no halluc)     │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  EVALUATION                                         │
│  Precision@k  — relevant chunks in top-k / k        │
│  Recall@k     — relevant chunks captured / total    │
│  Faithfulness — is the answer grounded in context?  │
│  Relevance    — does the answer address the query?  │
│  Correctness  — does the answer match ground truth? │
│  (scored by Claude Opus 4.6 via structured outputs) │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Generation LLM | Claude Haiku 4.5 (adaptive thinking) |
| Evaluation LLM | Claude Opus 4.6 (Pydantic structured outputs) |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` (384-dim) |
| Vector store | ChromaDB with HNSW index (cosine space) |
| Backend API | FastAPI + Uvicorn |
| Frontend | Next.js 14, React 18, Tailwind CSS, TypeScript |
| Web scraping | `requests` + `BeautifulSoup` |

---

## Project Structure

```
stripe-rag/
├── backend/
│   ├── main.py               # FastAPI server (query, evaluate, corpus endpoints)
│   └── src/
│       ├── ingest.py          # Scrape → chunk → embed → store
│       ├── retriever.py       # Cosine similarity search over ChromaDB
│       ├── generator.py       # Claude answer generation with source citations
│       ├── evaluator.py       # Precision@k, Recall@k, faithfulness, relevance, correctness
│       └── rag_pipeline.py    # Orchestration layer
├── frontend/
│   ├── app/
│   │   └── page.tsx           # Main dashboard (4 tabs)
│   ├── components/            # QueryCard, AnswerCard, InspectorPanel, MetricCard, etc.
│   └── lib/
│       └── api.ts             # Typed API client
├── scripts/
│   └── run_ingest.py          # CLI ingestion entry point
└── data/
    └── eval_questions.json    # 20 ground-truth Q&A pairs across 11 categories
```

---

## Quickstart

### 1. Clone and install

```bash
git clone https://github.com/your-username/stripe-rag
cd stripe-rag

# Backend (requires uv — https://docs.astral.sh/uv/)
uv sync

# Frontend
cd frontend && npm install && cd ..
```

### 2. Set your API key

```bash
cp .env.example .env
# add your Anthropic API key to .env
```

### 3. Ingest the Stripe docs

```bash
uv run python scripts/run_ingest.py
```

This scrapes the Stripe API docs, chunks and embeds them, and persists everything to `data/chroma_db/`. Takes ~1–2 minutes.

Options:
```bash
uv run python scripts/run_ingest.py --static-only  # skip live scraping
uv run python scripts/run_ingest.py --force         # wipe and re-ingest
```

### 4. Start the backend

```bash
uv run uvicorn backend.main:app --reload --port 8000
```

### 5. Start the frontend

```bash
cd frontend
npm run dev
```

Opens at `http://localhost:3000`. The backend API runs on `http://localhost:8000`.

---

## Dashboard

### Ask
Interactive Q&A over the ingested documentation. Shows retrieved chunks with similarity scores, retrieval/generation latency, and real-time retrieval quality metrics (mean similarity, score spread, chunks above threshold).
<img width="2174" height="1602" alt="image" src="https://github.com/user-attachments/assets/55405382-2bf4-409d-8645-4bcf885888db" />


### Evaluate
Run the full evaluation suite over ground-truth questions. Produces:
- Aggregate Precision@k, Recall@k, F1@k for configurable k values
- Faithfulness, Answer Relevance, and Answer Correctness scores (LLM-judged)
- Per-question deep-dive with retrieved chunks, generated answer, and ground truth comparison

### Corpus
Browse the knowledge base — source distribution, total chunk count, and a keyword-searchable chunk browser.

### Inspector
Deep inspection of individual queries: assembled prompt (system + user), full chunk text with relevance thresholds, token usage, and diagnostics (score gaps, low-confidence warnings, multi-source detection).

---

## Evaluation Design

**Retrieval metrics** (keyword-based, no API calls):
- `Precision@k = |relevant chunks in top-k| / k`
- `Recall@k = |relevant chunks in top-k| / |all relevant chunks in corpus|`

**Generation metrics** (LLM-judged by Claude Opus 4.6):
- **Faithfulness**: is every claim in the answer supported by the retrieved context?
- **Answer Relevance**: does the answer directly address what was asked?
- **Answer Correctness**: does the answer match the ground truth?

All three generation metrics use Pydantic structured outputs for reliable JSON extraction, returning a score (0–1) plus explanation.

The evaluation set covers 11 Stripe API categories: payment intents, subscriptions, webhooks, customers, errors, pagination, authentication, idempotency, refunds, products/prices, and rate limits.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check + knowledge base status |
| `POST` | `/api/query` | RAG query (retrieve + generate) |
| `POST` | `/api/evaluate` | Run evaluation suite |
| `GET` | `/api/corpus` | Browse knowledge base chunks |

---

## Key Design Decisions

- **Sentence-aware chunking** with overlap (800 char chunks, 150 char overlap) preserves context across chunk boundaries
- **Deduplication** via MD5 hashing prevents re-indexing unchanged content on re-runs
- **Hybrid corpus** — live scraping supplemented with curated static content guarantees coverage of core topics even if Stripe changes their docs structure
- **Adaptive thinking** on Claude allows multi-step reasoning before answering, reducing hallucination on complex API questions
- **Two-model strategy** — fast Haiku 4.5 for generation (low latency), powerful Opus 4.6 for evaluation (high accuracy)
- **Lazy loading** — embedding models and ChromaDB are loaded on first query, keeping server startup fast

---

## Requirements

- Python 3.11+
- Node.js 18+
- [Anthropic API key](https://console.anthropic.com/)
- [uv](https://docs.astral.sh/uv/) (or `pip install` the dependencies from `pyproject.toml`)
