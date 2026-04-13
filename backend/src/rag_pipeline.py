"""
End-to-end RAG pipeline: retrieval → generation.
"""
import os
from typing import List, Dict
from dotenv import load_dotenv

from .retriever import Retriever
from .generator import generate_answer, format_context

load_dotenv()


class RAGPipeline:
    """
    Thin orchestration layer combining retrieval and generation.

    The Retriever lazy-loads on first query so the pipeline is cheap to
    instantiate (important for Streamlit's @st.cache_resource).
    """

    def __init__(self, default_k: int = 5):
        self.default_k = default_k
        self._retriever = Retriever()

    @property
    def retriever(self) -> Retriever:
        return self._retriever

    def query(self, question: str, k: int | None = None) -> Dict:
        """
        Full RAG query.

        Returns:
            question:         Input question
            retrieved_chunks: List of chunk dicts (id, text, metadata, score)
            context:          Formatted context string passed to Claude
            answer:           Generated answer
            usage:            Token usage dict
        """
        k = k or self.default_k
        chunks = self._retriever.retrieve(question, k=k)
        gen = generate_answer(question, chunks)

        return {
            "question": question,
            "retrieved_chunks": chunks,
            "context": format_context(chunks),
            "answer": gen["answer"],
            "usage": {
                "input_tokens": gen["input_tokens"],
                "output_tokens": gen["output_tokens"],
            },
        }

    def is_ready(self) -> bool:
        """True if the knowledge base has been ingested."""
        return self._retriever.is_ready()

    def stats(self) -> Dict:
        return {"total_chunks": self._retriever.count()}
