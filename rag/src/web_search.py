"""
web_search.py — Internet search for RAG augmentation
Free, no API key needed. Uses duckduckgo_search with httpx+BeautifulSoup fallback.
"""

from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

try:
    from duckduckgo_search import DDGS
    HAS_DDG = True
except ImportError:
    try:
        from ddgs import DDGS
        HAS_DDG = True
    except ImportError:
        HAS_DDG = False


class WebSearch:
    """Internet search for RAG augmentation. Free, no API key needed."""

    def __init__(self, max_results: int = 5):
        self.max_results = max_results

    def search(self, query: str) -> List[Dict]:
        """Search the web and return results.

        Uses duckduckgo_search library (free, no API key).

        Returns:
            [{"title": "...", "url": "...", "snippet": "...", "content": ""}]
        """
        if not HAS_DDG:
            print(
                "\n  ⚠️  duckduckgo_search not installed.\n"
                "     Run: pip install duckduckgo_search\n"
            )
            return []

        results: List[Dict] = []
        try:
            with DDGS() as ddgs:
                for i, r in enumerate(ddgs.text(query, max_results=self.max_results)):
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("href", ""),
                        "snippet": r.get("body", ""),
                        "content": "",
                    })
            logger.info(f"Web search returned {len(results)} results for: {query[:60]}")
        except Exception as e:
            logger.error(f"Web search failed: {e}")

        return results

    def _fetch_page(self, url: str, timeout: int = 5) -> Optional[str]:
        """Fetch and extract text content from a URL using httpx + BeautifulSoup."""
        try:
            import httpx
            from bs4 import BeautifulSoup
            import re

            response = httpx.get(url, timeout=timeout, follow_redirects=True)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "lxml")

            # Remove non-content elements
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()

            text = soup.get_text(separator=" ", strip=True)
            text = re.sub(r"\s+", " ", text).strip()
            return text[:2000]  # limit content length
        except Exception as e:
            logger.debug(f"Failed to fetch page {url}: {e}")
            return None
