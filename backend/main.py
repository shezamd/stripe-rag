"""
FastAPI wrapper around the Stripe RAG pipeline.

Run with:
    uv run uvicorn backend.main:app --reload --port 8000
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio

from src.rag_pipeline import RAGPipeline
from src.generator import generate_answer, format_context, SYSTEM_PROMPT
from src.evaluator import (
    run_evaluation,
    load_eval_questions,
)

# Lazy-loads embeddings + ChromaDB on first query
pipeline = RAGPipeline()

app = FastAPI(title="Stripe RAG API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    question: str
    k: int = 5


class EvaluateRequest(BaseModel):
    k_values: list[int] = [1, 3, 5]
    score_faithfulness: bool = True
    n_questions: int = 5


@app.get("/health")
def health():
    return {
        "status": "ok",
        "kb_ready": pipeline.is_ready(),
        "chunks": pipeline.stats()["total_chunks"] if pipeline.is_ready() else 0,
    }


@app.post("/api/query")
async def query(req: QueryRequest):
    if not pipeline.is_ready():
        raise HTTPException(
            status_code=503,
            detail="Knowledge base not initialised. Run: uv run python scripts/run_ingest.py",
        )

    loop = asyncio.get_running_loop()

    SIMILARITY_THRESHOLD = 0.7

    # ── Embedding ──────────────────────────────────────────────────────────────
    t0 = time.time()
    embedding = await loop.run_in_executor(
        None, lambda: pipeline.retriever.encode_query(req.question)
    )
    embedding_ms = int((time.time() - t0) * 1000)

    # ── Search ─────────────────────────────────────────────────────────────────
    t1 = time.time()
    chunks = await loop.run_in_executor(
        None, lambda: pipeline.retriever.search(embedding, k=req.k)
    )
    search_ms = int((time.time() - t1) * 1000)
    retrieval_ms = embedding_ms + search_ms

    # ── Generation ────────────────────────────────────────────────────────────
    t2 = time.time()
    gen = await loop.run_in_executor(None, lambda: generate_answer(req.question, chunks))
    generation_ms = int((time.time() - t2) * 1000)

    # ── Cheap retrieval signals (no API calls) ────────────────────────────────
    scores = [c["score"] for c in chunks]
    mean_similarity = sum(scores) / len(scores) if scores else 0.0
    score_spread    = (max(scores) - min(scores)) if scores else 0.0
    chunks_above    = sum(1 for s in scores if s >= SIMILARITY_THRESHOLD)

    formatted_chunks = [
        {
            "id": i + 1,
            "source": c["metadata"].get("url", "").rstrip("/").split("/")[-1] or "stripe.com",
            "section": c["metadata"].get("title", ""),
            "score": round(c["score"], 4),
        }
        for i, c in enumerate(chunks)
    ]

    # ── Inspector: full chunk details ─────────────────────────────────────────
    inspector_chunks = [
        {
            "id": i + 1,
            "text": c["text"],
            "source": c["metadata"].get("url", "").rstrip("/").split("/")[-1] or "stripe.com",
            "section": c["metadata"].get("title", ""),
            "url": c["metadata"].get("url", ""),
            "chunkIndex": c["metadata"].get("chunk_index", 0),
            "score": round(c["score"], 4),
            "aboveThreshold": c["score"] >= SIMILARITY_THRESHOLD,
        }
        for i, c in enumerate(chunks)
    ]

    # ── Inspector: assembled prompt ───────────────────────────────────────────
    context = format_context(chunks)
    user_prompt = (
        f"Documentation context:\n{context}\n\n"
        f"Question: {req.question}\n\n"
        "Answer based solely on the context above:"
    )

    # ── Inspector: diagnostics ────────────────────────────────────────────────
    diagnostics = []
    if scores:
        top_score = max(scores)
        if top_score < SIMILARITY_THRESHOLD:
            diagnostics.append({
                "type": "warning",
                "message": f"Top similarity is {top_score:.2f}, which is below the relevance threshold of {SIMILARITY_THRESHOLD:.2f} — the system fell back to a low-confidence response.",
            })
        if chunks_above == 0:
            diagnostics.append({
                "type": "warning",
                "message": "No chunks passed the relevance threshold. The answer is generated from low-confidence context.",
            })
        if len(scores) >= 2 and (scores[0] - scores[1]) > 0.2:
            diagnostics.append({
                "type": "info",
                "message": f"Large score gap between rank #1 ({scores[0]:.2f}) and #2 ({scores[1]:.2f}) — single strong match with weak supporting context.",
            })
        source_urls = set(c["metadata"].get("url", "") for c in chunks)
        if len(source_urls) > 1:
            diagnostics.append({
                "type": "info",
                "message": f"Chunks retrieved from {len(source_urls)} different source documents.",
            })

    return {
        "question":   req.question,
        "k":          req.k,
        "answerText": gen["answer"],
        "methods":    [],
        "chunks":     formatted_chunks,
        "metrics": {
            "meanSimilarity":       round(mean_similarity, 4),
            "scoreSpread":          round(score_spread, 4),
            "chunksAboveThreshold": chunks_above,
            "threshold":            SIMILARITY_THRESHOLD,
            "k":                    req.k,
        },
        "latency": {
            "retrievalMs":  retrieval_ms,
            "embeddingMs":  embedding_ms,
            "searchMs":     search_ms,
            "generationMs": generation_ms,
        },
        # ── Inspector-only fields ─────────────────────────────────────────────
        "inspectorChunks":  inspector_chunks,
        "assembledPrompt":  {"system": SYSTEM_PROMPT, "user": user_prompt},
        "tokenUsage":       {"inputTokens": gen["input_tokens"], "outputTokens": gen["output_tokens"]},
        "diagnostics":      diagnostics,
    }


@app.post("/api/evaluate")
async def evaluate(req: EvaluateRequest):
    if not pipeline.is_ready():
        raise HTTPException(status_code=503, detail="Knowledge base not initialised.")

    loop = asyncio.get_running_loop()
    eval_questions = load_eval_questions()[:req.n_questions]
    all_chunks = await loop.run_in_executor(None, pipeline.retriever.get_all_chunks)

    result = await loop.run_in_executor(
        None,
        lambda: run_evaluation(
            eval_questions=eval_questions,
            retriever=pipeline.retriever,
            all_chunks=all_chunks,
            k_values=sorted(req.k_values),
            score_faithfulness=req.score_faithfulness,
        ),
    )
    return result


@app.get("/api/corpus")
async def corpus(search: str = ""):
    if not pipeline.is_ready():
        raise HTTPException(status_code=503, detail="Knowledge base not initialised.")

    loop = asyncio.get_running_loop()
    total = pipeline.retriever.count()
    all_chunks = await loop.run_in_executor(None, pipeline.retriever.get_all_chunks)

    source_counts: dict = {}
    for chunk in all_chunks:
        url = chunk["metadata"].get("url", "unknown")
        source_counts[url] = source_counts.get(url, 0) + 1

    sources = sorted(
        [{"url": url, "chunks": count} for url, count in source_counts.items()],
        key=lambda x: -x["chunks"],
    )

    if search:
        filtered = [c for c in all_chunks if search.lower() in c["text"].lower()][:30]
    else:
        filtered = all_chunks[:30]

    return {
        "total": total,
        "sources": sources,
        "chunks": [
            {
                "id": c["id"],
                "text": c["text"][:600],
                "url": c["metadata"].get("url", ""),
                "title": c["metadata"].get("title", ""),
                "chunk_index": c["metadata"].get("chunk_index", 0),
            }
            for c in filtered
        ],
    }
