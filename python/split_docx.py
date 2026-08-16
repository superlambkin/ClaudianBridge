"""Word 文書（.docx）を「見出し単位」で分割する。

入力 Markdown 内で H1/H2/H3（`# `/`## `/`### `）をセクション境界とみなす。
出力ディレクトリに ``01.md``, ``02.md`` ... と連番で書き出す。
"""
from __future__ import annotations

import re
from pathlib import Path


SECTION_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*$", re.MULTILINE)


def split_md(md_text: str, src_path: str, output_dir: str) -> list[str]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    matches = list(SECTION_RE.finditer(md_text))
    if not matches:
        # 見出しが無い場合は 1 ファイルにフォールバック
        target = out_dir / f"{Path(src_path).stem}.md"
        target.write_text(md_text, encoding="utf-8")
        return [str(target)]

    outputs: list[str] = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md_text)
        chunk = md_text[start:end].strip()
        # H1 セクションタイトル先頭に ``# タイトル`` のみを持つヘッダ行を残す
        title = m.group(2).strip()
        body = f"# {title}\n\n{chunk}\n"
        target = out_dir / f"{i + 1:02d}.md"
        target.write_text(body, encoding="utf-8")
        outputs.append(str(target))

    return outputs


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 4:
        print("usage: split_docx.py <md_file> <src_docx> <out_dir>", file=sys.stderr)
        sys.exit(2)
    md_path, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    md_text = Path(md_path).read_text(encoding="utf-8")
    print("\n".join(split_md(md_text, src, out)))
