"""
Generates grounded answers using Claude Haiku 4.5 with adaptive thinking.

Answers are strictly grounded in retrieved context — Claude is instructed
not to rely on its parametric knowledge beyond what is provided.
"""
import os
from typing import List, Dict
import anthropic

MODEL = "claude-haiku-4-5-20251001"

SYSTEM_PROMPT = (
    "You are a precise technical assistant specialising in the Stripe API. "
    "Answer questions using ONLY the provided documentation context. "
    "If the context does not contain enough information to answer fully, "
    'say "The provided context does not cover this in sufficient detail." '
    "Include relevant endpoint paths, parameter names, and short code examples "
    "where present in the context. Be concise but complete."
)

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def format_context(chunks: List[Dict]) -> str:
    """Formats retrieved chunks into a numbered context block."""
    parts = []
    for i, chunk in enumerate(chunks, 1):
        url = chunk.get("metadata", {}).get("url", "Stripe Docs")
        title = chunk.get("metadata", {}).get("title", "")
        header = f"[{i}] {title} — {url}" if title else f"[{i}] {url}"
        parts.append(f"{header}\n{chunk['text']}")
    return "\n\n" + ("-" * 60 + "\n\n").join(parts)


def generate_answer(query: str, chunks: List[Dict]) -> Dict:
    """
    Generates an answer to `query` grounded in `chunks`.

    Uses adaptive thinking so Claude can reason through complex
    API questions before producing its final answer.

    Returns:
        answer:        Generated answer text
        input_tokens:  Tokens consumed by the prompt
        output_tokens: Tokens consumed by the answer
    """
    context = format_context(chunks)

    system = SYSTEM_PROMPT

    user = (
        f"Documentation context:\n{context}\n\n"
        f"Question: {query}\n\n"
        "Answer based solely on the context above:"
    )

    client = _get_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user}],
    )

    # Extract the text block (skip thinking blocks)
    answer = next(
        (block.text for block in response.content if hasattr(block, "text")),
        "",
    )

    return {
        "answer": answer,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
