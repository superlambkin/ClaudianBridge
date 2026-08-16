"""CSV の分割スクリプト（CSV は分割せず 1 ファイルとして出力）。"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def split_md(md_text: str, src_path: str, output_dir: str) -> list[str]:
    """1 ファイルだけ書き出す。何も分割しない。

    Parameters
    ----------
    md_text : str
        markitdown 出力を Frontmatter 適用済みの Markdown 全体。
    src_path : str
        元 CSV ファイルのパス。
    output_dir : str
        出力先ディレクトリ。
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    stem = Path(src_path).stem
    out_file = Path(output_dir) / f"{stem}.md"
    out_file.write_text(md_text, encoding="utf-8")
    return [str(out_file)]


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("usage: split_csv.py <md_file> <src_csv> <out_dir>", file=sys.stderr)
        sys.exit(2)
    md_path, src_path, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    md_text = Path(md_path).read_text(encoding="utf-8")
    print("\n".join(split_md(md_text, src_path, out_dir)))
