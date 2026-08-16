"""
chunker.py — テキストチャンク分割モジュール
方式: スライディングウィンドウ（800 tokens / overlap 150）
TDD実装: テストファーストで構築
"""

from typing import List, Dict
import logging

logger = logging.getLogger(__name__)


class TextChunker:
    """テキストチャンク分割器"""

    def __init__(self, chunk_size: int = 800, overlap: int = 150):
        """
        Args:
            chunk_size: チャンクサイズ（tokens）
            overlap: オーバーラップ（tokens）
        """
        # 1 token ≈ 4 文字（日本語混じりの概算）
        self.chunk_size = chunk_size * 4
        self.overlap = overlap * 4

    def _chunk_by_tokens(self, text: str) -> List[str]:
        """スライディングウィンドウで文字列を分割"""
        chunks = []
        text_len = len(text)
        start = 0

        while start < text_len:
            end = min(start + self.chunk_size, text_len)
            chunk = text[start:end]

            # 句点で切れ目を調整（文の途中で切れないように）
            if end < text_len:
                last_period = max(
                    chunk.rfind("。"),
                    chunk.rfind("\n"),
                    chunk.rfind(". "),
                    chunk.rfind(".\n"),
                )
                if last_period > start + self.chunk_size // 2:
                    chunk = chunk[: last_period + 1]
                    end = start + last_period + 1

            chunks.append(chunk.strip())

            # 末尾に達したら終了（負のstartを防ぐ）
            if end >= text_len:
                break

            start = end - self.overlap
            # startが負になるのを防ぐ
            if start < 0:
                start = 0

        return [c for c in chunks if c]

    def chunk_documents(self, documents: List[Dict]) -> List[Dict]:
        """ドキュメントリストをチャンク分割"""
        chunked = []

        for doc in documents:
            text = doc.get("content", "")
            if not text:
                continue

            sub_chunks = self._chunk_by_tokens(text)
            for i, chunk_text in enumerate(sub_chunks):
                entry = {
                    "content": chunk_text,
                    "source": doc["source"],
                    "page": doc.get("page", 1),
                    "type": doc.get("type", "unknown"),
                    "chunk_id": f"{doc['source']}_p{doc.get('page', 1)}_c{i}",
                }
                if "doc_hash" in doc:
                    entry["doc_hash"] = doc["doc_hash"]
                chunked.append(entry)

        logger.info(f"チャンク分割完了: {len(chunked)} chunks")
        return chunked
