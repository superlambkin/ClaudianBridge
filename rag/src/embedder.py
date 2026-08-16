"""
embedder.py — ベクトル化モジュール
使用モデル: BGE-m3（多言語対応、1024次元）
TDD実装: テストファーストで構築
"""

import os
from pathlib import Path
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class BGEEmbedder:
    """BGE-m3 ベクトル化器"""

    def __init__(
        self,
        model_name: str = "BAAI/bge-m3",
        local_model_dir: Optional[str] = None,
    ):
        """
        Args:
            model_name: HuggingFace モデル名
            local_model_dir: ローカルモデル保存ディレクトリ（指定時はここから読み込み/保存）
        """
        if local_model_dir:
            model_path = Path(local_model_dir) / model_name.replace("/", "_")
            model_path.mkdir(parents=True, exist_ok=True)

            # モデルが既にローカルにあるか確認
            if model_path.exists() and any(model_path.iterdir()):
                logger.info(f"ローカルモデルを検出: {model_path}")
                self.model = SentenceTransformer(str(model_path))
            else:
                logger.info(f"ローカルモデルが見つかりません。ダウンロード中: {model_name}")
                self.model = SentenceTransformer(model_name)
                logger.info(f"モデルを保存中: {model_path}")
                self.model.save(str(model_path))
                logger.info(f"モデル保存完了: {model_path}")
        else:
            logger.info(f"モデルロード中: {model_name}")
            self.model = SentenceTransformer(model_name)

        self.dimension = self.model.get_embedding_dimension()
        logger.info(f"埋め込み次元: {self.dimension}")

    def encode(self, texts: List[str], batch_size: int = 32) -> np.ndarray:
        """
        テキストリスト → ベクトル配列

        Args:
            texts: エンコードするテキストのリスト
            batch_size: バッチサイズ

        Returns:
            numpy.ndarray: (n, dimension) のベクトル配列
        """
        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=True,
            normalize_embeddings=True,
        )
        return embeddings

    def encode_documents(
        self, documents: List[Dict], batch_size: int = 32
    ) -> List[Dict]:
        """ドキュメントリストに埋め込みベクトルを追加"""
        texts = [doc["content"] for doc in documents]

        logger.info(f"ベクトル化中: {len(texts)} 文書...")
        embeddings = self.encode(texts, batch_size=batch_size)

        for doc, emb in zip(documents, embeddings):
            doc["embedding"] = emb

        return documents
