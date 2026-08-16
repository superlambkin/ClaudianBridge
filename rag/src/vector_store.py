"""
vector_store.py — ChromaDB ベクトルデータベース管理
TDD実装: テストファーストで構築
"""

import chromadb
from chromadb.config import Settings
from pathlib import Path
from typing import List, Dict, Optional, Union
import logging

logger = logging.getLogger(__name__)


class ChromaVectorStore:
    """ChromaDB ベクトルデータベース"""

    def __init__(
        self,
        persist_dir: str = "./data/chroma_db",
        collection_name: str = "word_pdf_rag_kb",
    ):
        """
        Args:
            persist_dir: 永続化ディレクトリ
            collection_name: コレクション名
        """
        self.persist_dir = Path(persist_dir)
        self.persist_dir.mkdir(parents=True, exist_ok=True)

        self.client = chromadb.PersistentClient(
            path=str(self.persist_dir),
            settings=Settings(anonymized_telemetry=False),
        )

        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"description": "Word/PDF RAG Knowledge Base"},
        )
        logger.info(f"Collection '{collection_name}' 初期化完了")

    def add_documents(self, documents: List[Dict]) -> None:
        """バッチで文書を追加"""
        if not documents:
            return

        ids = [doc["chunk_id"] for doc in documents]
        embeddings = [
            doc["embedding"].tolist()
            if hasattr(doc["embedding"], "tolist")
            else doc["embedding"]
            for doc in documents
        ]
        documents_text = [doc["content"] for doc in documents]
        metadatas = [
            {
                "source": doc["source"],
                "page": doc.get("page", 1),
                "type": doc.get("type", "unknown"),
                "doc_hash": doc.get("doc_hash", ""),
            }
            for doc in documents
        ]

        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents_text,
            metadatas=metadatas,
        )
        logger.info(f"{len(documents)} 文書を追加")

    def query(
        self, query_embedding: List[float], top_k: int = 5, where: Optional[Dict] = None
    ) -> Dict:
        """ベクトル類似検索（オプションで metadata フィルター対応）"""
        query_kwargs = {
            "query_embeddings": [query_embedding],
            "n_results": top_k,
        }
        if where is not None:
            query_kwargs["where"] = where
        results = self.collection.query(**query_kwargs)
        return results

    def search(
        self,
        query_text: str,
        query_embedding: List[float],
        top_k: int = 5,
        where: Optional[Dict] = None,
    ) -> List[Dict]:
        """整形済み検索結果を返す（オプションで metadata フィルター対応）"""
        results = self.query(query_embedding, top_k, where=where)

        formatted = []
        for i in range(len(results["documents"][0])):
            formatted.append({
                "content": results["documents"][0][i],
                "source": results["metadatas"][0][i].get("source", "unknown"),
                "page": results["metadatas"][0][i].get("page", 1),
                "type": results["metadatas"][0][i].get("type", "unknown"),
                "score": results["distances"][0][i],
            })

        return formatted

    def get_existing_sources(self) -> set:
        """Return set of source filenames already stored in the collection."""
        all_metadatas = self.collection.get(include=["metadatas"])
        if not all_metadatas or not all_metadatas.get("metadatas"):
            return set()
        return {m["source"] for m in all_metadatas["metadatas"] if "source" in m}

    def get_source_hash(self, source: str) -> Optional[str]:
        """Return the stored doc_hash for a source, or None if not found."""
        results = self.collection.get(
            where={"source": source},
            include=["metadatas"],
        )
        if results and results.get("metadatas"):
            return results["metadatas"][0].get("doc_hash")
        return None

    def document_exists(self, source: str, chunk_id: str) -> bool:
        """Check if a specific chunk already exists."""
        results = self.collection.get(ids=[chunk_id])
        return bool(results and results.get("ids") and len(results["ids"]) > 0)

    def delete_by_source(self, source: str) -> None:
        """Delete all chunks belonging to a given source file."""
        results = self.collection.get(where={"source": source}, include=[])
        if results and results.get("ids"):
            self.collection.delete(ids=results["ids"])
            logger.info(f"削除: {source} ({len(results['ids'])} チャンク)")

    def delete_collection(self) -> None:
        """コレクションを削除"""
        self.client.delete_collection(self.collection.name)
        logger.info(f"Collection '{self.collection.name}' 削除完了")

    def get_count(self) -> int:
        """コレクション内の文書数を取得"""
        return self.collection.count()
