"""
RAG Evaluation Metrics
======================
Context Metrics (retrieval quality):
  Precision@k  — fraction of top-k retrieved chunks that are relevant
  Recall@k     — fraction of all relevant corpus chunks that appear in top-k results

Generation Metrics (answer quality, all use Claude structured outputs):
  Faithfulness       — is the answer grounded in the retrieved context?
  Answer Relevance   — does the answer address the question asked?
  Answer Correctness — how correct is the answer compared to ground truth?

Relevance is determined via keyword matching against per-question
`relevant_keywords` lists defined in data/eval_questions.json.
This is a standard proxy metric used in RAG evaluation frameworks (e.g. RAGAS).
"""
import os
import json
import logging
from typing import List, Dict
from pathlib import Path

import anthropic
from pydantic import BaseModel, Field

from .generator import generate_answer, format_context

logger = logging.getLogger(__name__)

MODEL = "claude-opus-4-6"

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


# ── Pydantic schemas for structured outputs ──────────────────────────────────

class FaithfulnessResult(BaseModel):
    score: float = Field(ge=0.0, le=1.0, description="0 = unfaithful, 1 = fully faithful")
    explanation: str = Field(description="One or two sentence justification")
    unsupported_claims: List[str] = Field(
        default_factory=list,
        description="Claims in the answer NOT supported by context",
    )


class ContextRelevanceResult(BaseModel):
    score: float = Field(ge=0.0, le=1.0, description="0 = irrelevant, 1 = highly relevant")
    explanation: str


class AnswerRelevanceResult(BaseModel):
    score: float = Field(ge=0.0, le=1.0, description="0 = answer does not address question, 1 = answer fully addresses question")
    explanation: str


class AnswerCorrectnessResult(BaseModel):
    score: float = Field(ge=0.0, le=1.0, description="0 = completely wrong, 1 = fully correct compared to ground truth")
    explanation: str


# ── Retrieval metrics ─────────────────────────────────────────────────────────

def _is_relevant(text: str, keywords: List[str]) -> bool:
    """True if ANY keyword appears in the chunk (case-insensitive)."""
    lower = text.lower()
    return any(kw.lower() in lower for kw in keywords)


def precision_at_k(retrieved: List[Dict], keywords: List[str], k: int) -> float:
    """
    Precision@k = |relevant ∩ top-k| / k
    """
    top_k = retrieved[:k]
    if not top_k:
        return 0.0
    hits = sum(1 for chunk in top_k if _is_relevant(chunk["text"], keywords))
    return hits / len(top_k)


def recall_at_k(
    retrieved: List[Dict],
    all_chunks: List[Dict],
    keywords: List[str],
    k: int,
) -> float:
    """
    Recall@k = |relevant ∩ top-k| / |all relevant in corpus|

    `all_chunks` is the complete corpus — needed to compute the denominator.
    """
    all_relevant = [c for c in all_chunks if _is_relevant(c["text"], keywords)]
    if not all_relevant:
        return 0.0
    retrieved_ids_k = {c["id"] for c in retrieved[:k]}
    hits = sum(1 for c in all_relevant if c["id"] in retrieved_ids_k)
    return hits / len(all_relevant)


# ── Generation quality metrics ────────────────────────────────────────────────

def evaluate_faithfulness(answer: str, context: str) -> Dict:
    """
    Uses Claude with structured output to score answer faithfulness against context.
    Returns: score (0–1), explanation, unsupported_claims list.
    """
    client = _get_client()

    prompt = (
        "You are a RAG evaluation assistant. Determine whether the answer below "
        "is faithful to the provided context.\n\n"
        "FAITHFULNESS means: every factual claim in the answer is directly "
        "supported by the context. Answers that add facts not present in the "
        "context are unfaithful.\n\n"
        f"CONTEXT:\n{context[:4000]}\n\n"
        f"ANSWER:\n{answer}\n\n"
        "Score the faithfulness, explain briefly, and list any claims in the answer "
        "that are NOT supported by the context."
    )

    response = client.messages.parse(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
        output_format=FaithfulnessResult,
    )

    r = response.parsed_output
    return {
        "score": r.score,
        "explanation": r.explanation,
        "unsupported_claims": r.unsupported_claims,
    }


def evaluate_context_relevance(query: str, chunks: List[Dict]) -> float:
    """
    Uses Claude to score how relevant the retrieved context is for the query.
    Returns a float in [0, 1].
    """
    client = _get_client()

    snippet = "\n\n---\n\n".join(
        f"Chunk {i + 1}:\n{c['text'][:400]}" for i, c in enumerate(chunks)
    )

    prompt = (
        "Rate how useful the retrieved context chunks are for answering the question.\n\n"
        f"QUESTION: {query}\n\n"
        f"RETRIEVED CONTEXT:\n{snippet}\n\n"
        "A score of 1.0 means the context directly and fully answers the question. "
        "A score of 0.0 means the context is completely irrelevant."
    )

    response = client.messages.parse(
        model=MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
        output_format=ContextRelevanceResult,
    )
    return response.parsed_output.score


def evaluate_answer_relevance(question: str, answer: str) -> Dict:
    """
    Uses Claude to score how well the generated answer addresses the question.
    Returns: score (0–1) and explanation.
    """
    client = _get_client()

    prompt = (
        "You are a RAG evaluation assistant. Score how well the answer addresses the question.\n\n"
        "ANSWER RELEVANCE means: the answer directly responds to what was asked, "
        "without going off-topic or omitting the core request.\n\n"
        f"QUESTION: {question}\n\n"
        f"ANSWER: {answer}\n\n"
        "Score 1.0 if the answer fully and directly addresses the question. "
        "Score 0.0 if the answer is completely off-topic or does not engage with the question."
    )

    response = client.messages.parse(
        model=MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
        output_format=AnswerRelevanceResult,
    )
    r = response.parsed_output
    return {"score": r.score, "explanation": r.explanation}


def evaluate_answer_correctness(answer: str, ground_truth: str) -> Dict:
    """
    Uses Claude to score how correct the generated answer is vs. ground truth.
    Returns: score (0–1) and explanation.
    """
    client = _get_client()

    prompt = (
        "You are a RAG evaluation assistant. Score how factually correct the generated answer is "
        "compared to the ground truth.\n\n"
        "ANSWER CORRECTNESS means: the generated answer conveys the same key facts and conclusions "
        "as the ground truth, without significant errors or omissions.\n\n"
        f"GROUND TRUTH: {ground_truth}\n\n"
        f"GENERATED ANSWER: {answer}\n\n"
        "Score 1.0 if the generated answer is fully correct and consistent with the ground truth. "
        "Score 0.0 if the generated answer is factually wrong or contradicts the ground truth."
    )

    response = client.messages.parse(
        model=MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
        output_format=AnswerCorrectnessResult,
    )
    r = response.parsed_output
    return {"score": r.score, "explanation": r.explanation}


# ── Full evaluation run ───────────────────────────────────────────────────────

def load_eval_questions(path: str | None = None) -> List[Dict]:
    if path is None:
        path = Path(__file__).parent.parent.parent / "data" / "eval_questions.json"
    with open(path) as f:
        return json.load(f)


def run_evaluation(
    eval_questions: List[Dict],
    retriever,
    all_chunks: List[Dict],
    k_values: List[int] = (1, 3, 5),
    score_faithfulness: bool = True,
    progress_callback=None,
) -> Dict:
    """
    Runs the full evaluation suite over `eval_questions`.

    Args:
        eval_questions:     List of dicts with keys: id, question, ground_truth,
                            relevant_keywords, category.
        retriever:          Retriever instance.
        all_chunks:         All corpus chunks (for recall denominator).
        k_values:           k values for Precision@k / Recall@k.
        score_faithfulness: Whether to call Claude for faithfulness scoring
                            (adds API cost per question).
        progress_callback:  Optional callable(current_idx, total) for progress reporting.

    Returns:
        {
          "aggregated": {mean_precision@k, mean_recall@k, mean_faithfulness, ...},
          "per_question": [per-question result dicts],
          "num_questions": int,
        }
    """
    k_max = max(k_values)
    per_question = []

    for idx, q in enumerate(eval_questions):
        if progress_callback:
            progress_callback(idx, len(eval_questions))

        logger.info(f"Evaluating [{idx + 1}/{len(eval_questions)}]: {q['question'][:60]}")

        retrieved = retriever.retrieve(q["question"], k=k_max)
        context = format_context(retrieved)
        gen = generate_answer(q["question"], retrieved)

        result: Dict = {
            "question_id": q["id"],
            "question": q["question"],
            "category": q.get("category", ""),
            "generated_answer": gen["answer"],
            "ground_truth": q["ground_truth"],
            "retrieved_chunks": [
                {
                    "text": c["text"][:250],
                    "url": c["metadata"].get("url", ""),
                    "score": round(c["score"], 4),
                }
                for c in retrieved
            ],
        }

        for k in k_values:
            result[f"precision@{k}"] = round(
                precision_at_k(retrieved, q["relevant_keywords"], k), 4
            )
            result[f"recall@{k}"] = round(
                recall_at_k(retrieved, all_chunks, q["relevant_keywords"], k), 4
            )

        if score_faithfulness:
            faith = evaluate_faithfulness(gen["answer"], context)
            result["faithfulness_score"] = round(faith["score"], 4)
            result["faithfulness_explanation"] = faith["explanation"]
            result["unsupported_claims"] = faith["unsupported_claims"]

            relevance = evaluate_answer_relevance(q["question"], gen["answer"])
            result["answer_relevance_score"] = round(relevance["score"], 4)
            result["answer_relevance_explanation"] = relevance["explanation"]

            correctness = evaluate_answer_correctness(gen["answer"], q["ground_truth"])
            result["answer_correctness_score"] = round(correctness["score"], 4)
            result["answer_correctness_explanation"] = correctness["explanation"]
        else:
            result["faithfulness_score"] = None
            result["answer_relevance_score"] = None
            result["answer_correctness_score"] = None

        per_question.append(result)

    # Aggregate
    aggregated: Dict = {}
    for k in k_values:
        p_vals = [r[f"precision@{k}"] for r in per_question]
        r_vals = [r[f"recall@{k}"] for r in per_question]
        aggregated[f"mean_precision@{k}"] = round(sum(p_vals) / len(p_vals), 4)
        aggregated[f"mean_recall@{k}"] = round(sum(r_vals) / len(r_vals), 4)

    faith_vals = [r["faithfulness_score"] for r in per_question if r["faithfulness_score"] is not None]
    aggregated["mean_faithfulness"] = round(sum(faith_vals) / len(faith_vals), 4) if faith_vals else None

    rel_vals = [r["answer_relevance_score"] for r in per_question if r["answer_relevance_score"] is not None]
    aggregated["mean_answer_relevance"] = round(sum(rel_vals) / len(rel_vals), 4) if rel_vals else None

    corr_vals = [r["answer_correctness_score"] for r in per_question if r["answer_correctness_score"] is not None]
    aggregated["mean_answer_correctness"] = round(sum(corr_vals) / len(corr_vals), 4) if corr_vals else None

    # F1@k
    for k in k_values:
        p = aggregated[f"mean_precision@{k}"]
        r = aggregated[f"mean_recall@{k}"]
        denom = p + r
        aggregated[f"mean_f1@{k}"] = round(2 * p * r / denom, 4) if denom > 0 else 0.0

    return {
        "aggregated": aggregated,
        "per_question": per_question,
        "num_questions": len(per_question),
    }
