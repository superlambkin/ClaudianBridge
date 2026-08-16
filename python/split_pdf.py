"""PDF をページ単位で分割する（markitdown の `<!-- Page number: N -->` 境界）。"""
from __future__ import annotations

import re
from pathlib import Path


PAGE_RE = re.compile(r"<!--\s*Page number:\s*\d+\s*-->", re.IGNORECASE)


def split_md(md_text: str, src_path: str, output_dir: str) -> list[str]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    matches = list(PAGE_RE.finditer(md_text))
    if not matches:
        target = out_dir / f"{Path(src_path).stem}.md"
        target.write_text(md_text, encoding="utf-8")
        return [str(target)]

    outputs: list[str] = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md_text)
        chunk = md_text[start:end].strip()
        target = out_dir / f"page-{i + 1:02d}.md"
        target.write_text(chunk + "\n", encoding="utf-8")
        outputs.append(str(target))
    return outputs


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 4:
        print("usage: split_pdf.py <md_file> <src_pdf> <out_dir>", file=sys.stderr)
        sys.exit(2)
    md_path, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    md_text = Path(md_path).read_text(encoding="utf-8")
    print("\n".join(split_md(md_text, src, out)))