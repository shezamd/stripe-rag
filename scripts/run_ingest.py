#!/usr/bin/env python3
"""
Run the Stripe docs ingestion pipeline.

Usage:
    python scripts/run_ingest.py                # include live scrape + static docs
    python scripts/run_ingest.py --static-only  # only use bundled static content
    python scripts/run_ingest.py --force        # re-ingest from scratch
"""
import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from dotenv import load_dotenv
load_dotenv()

from src.ingest import run_ingestion


def main():
    parser = argparse.ArgumentParser(description="Ingest Stripe docs into ChromaDB")
    parser.add_argument(
        "--static-only",
        action="store_true",
        help="Skip live scraping, use only bundled static content",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Clear existing collection before ingesting",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Stripe RAG — Document Ingestion")
    print("=" * 60)

    result = run_ingestion(
        scrape_live=not args.static_only,
        force=args.force,
    )

    print()
    print("Results:")
    print(f"  Pages processed : {result['pages_processed']}")
    print(f"  New chunks added: {result['chunks_added']}")
    print(f"  Total in store  : {result['total_chunks']}")
    print()
    print("Done. Start the backend with:")
    print("  uv run uvicorn backend.main:app --reload --port 8000")


if __name__ == "__main__":
    main()
