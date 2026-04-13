"""
Retrieves relevant document chunks from ChromaDB using cosine similarity.
"""
from pathlib import Path
from typing import List, Dict
import chromadb
from sentence_transformers import SentenceTransformer

CHROMA_PATH = str(Path(__file__).parent.parent.parent / "data" / "chroma_db")
COLLECTION_NAME = "stripe_docs"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"


class Retriever:
    """
    Wraps ChromaDB + sentence-transformers for semantic retrieval.

    Lazy-loads models on first use so imports are cheap.
    """

    def __init__(
        self,
        persist_path: str = CHROMA_PATH,
        model_name: str = EMBEDDING_MODEL,
    ):
        self._persist_path = persist_path
        self._model_name = model_name
        self._model: SentenceTransformer | None = None
        self._collection: chromadb.Collection | None = None

    def _ensure_loaded(self) -> None:
        if self._model is None:
            self._model = SentenceTransformer(self._model_name)
        if self._collection is None:
            client = chromadb.PersistentClient(path=self._persist_path)
            self._collection = client.get_collection(COLLECTION_NAME)

    def encode_query(self, query: str) -> List[float]:
        """Encode a query string into a normalised embedding vector."""
        self._ensure_loaded()
        return self._model.encode(query, normalize_embeddings=True).tolist()

    def search(self, embedding: List[float], k: int = 5) -> List[Dict]:
        """
        Search ChromaDB with a pre-computed embedding.

        Returns list of chunk dicts (id, text, metadata, score).
        """
        self._ensure_loaded()
        results = self._collection.query(
            query_embeddings=[embedding],
            n_results=min(k, self._collection.count()),
            include=["documents", "metadatas", "distances"],
        )

        chunks = []
        for i, chunk_id in enumerate(results["ids"][0]):
            chunks.append({
                "id": chunk_id,
                "text": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                # ChromaDB returns cosine *distance* (0 = identical, 2 = opposite);
                # convert to similarity in [0, 1]
                "score": 1.0 - results["distances"][0][i] / 2.0,
            })
        return chunks

    def retrieve(self, query: str, k: int = 5) -> List[Dict]:
        """
        Returns the top-k most relevant chunks for `query`.

        Each result dict contains:
          - id:       chunk ID
          - text:     chunk content
          - metadata: url, title, chunk_index
          - score:    cosine similarity (0–1, higher is better)
        """
        embedding = self.encode_query(query)
        return self.search(embedding, k=k)

    def get_all_chunks(self, limit: int = 20_000) -> List[Dict]:
        """
        Returns every chunk in the collection (used for recall calculation).
        """
        self._ensure_loaded()
        raw = self._collection.get(
            limit=limit,
            include=["documents", "metadatas"],
        )
        return [
            {
                "id": raw["ids"][i],
                "text": raw["documents"][i],
                "metadata": raw["metadatas"][i],
            }
            for i in range(len(raw["ids"]))
        ]

    def count(self) -> int:
        """Total number of chunks in the collection."""
        self._ensure_loaded()
        return self._collection.count()

    def is_ready(self) -> bool:
        """Returns True if the collection exists and has data."""
        try:
            client = chromadb.PersistentClient(path=self._persist_path)
            col = client.get_collection(COLLECTION_NAME)
            return col.count() > 0
        except Exception:
            return False
