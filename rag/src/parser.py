"""
parser.py — 文書解析モジュール
対応形式: PDF, Word(.docx)
TDD実装: テストファーストで構築
"""

import fitz
from docx import Document
from pathlib import Path
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)


class DocumentParser:
    """文書解析器"""

    def __init__(self, documents_dir: str):
        self.documents_dir = Path(documents_dir)

    def parse_pdf(self, file_path: Path) -> List[Dict]:
        """PDF → テキストチャンク（ページ単位）"""
        chunks = []
        try:
            doc = fitz.open(file_path)
            for page_num, page in enumerate(doc, start=1):
                text = page.get_text().strip()
                if text:
                    chunks.append({
                        "content": text,
                        "source": file_path.name,
                        "page": page_num,
                        "type": "pdf"
                    })
            doc.close()
        except Exception as e:
            logger.warning(f"PDF解析エラー: {file_path.name}, {e}")
        return chunks

    def parse_word(self, file_path: Path) -> List[Dict]:
        """Word → テキストチャンク"""
        chunks = []
        try:
            doc = Document(file_path)
            text_parts = []
            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text.strip())

            full_text = "\n".join(text_parts)
            if full_text:
                chunks.append({
                    "content": full_text,
                    "source": file_path.name,
                    "page": 1,
                    "type": "word"
                })
        except Exception as e:
            logger.warning(f"Word解析エラー: {file_path.name}, {e}")
        return chunks

    def parse_all(self) -> List[Dict]:
        """対応形式の全ファイルを解析"""
        all_chunks = []

        for f in sorted(self.documents_dir.rglob("*.pdf")):
            all_chunks.extend(self.parse_pdf(f))

        for f in sorted(self.documents_dir.rglob("*.docx")):
            all_chunks.extend(self.parse_word(f))

        logger.info(f"解析完了: {len(all_chunks)} chunks from {self.documents_dir}")
        return all_chunks
