"""Excel（.xlsx）を Sheet 単位で分割する。

markitdown は ``<!-- sheet: <名前> -->`` 形式のコメントを付与するため、それを境界にする。
"""
from __future__ import annotations

import re
from pathlib import Path


SHEET_RE = re.compile(r"<!--\s*sheet:\s*(.+?)\s*-->", re.IGNORECASE)


def split_md(md_text: str, src_path: str, output_dir: str) -> list[str]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    matches = list(SHEET_RE.finditer(md_text))
    if not matches:
        # sheet マーカーが無ければ 1 ファイル保存
        target = out_dir / f"{Path(src_path).stem}.md"
        target.write_text(md_text, encoding="utf-8")
        return [str(target)]

    outputs: list[str] = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md_text)
        chunk = md_text[start:end].strip()
        sheet_name = m.group(1).strip()
        body = f"# {sheet_name}\n\n{chunk}\n"
        target = out_dir / f"sheet-{i + 1:02d}-{_safe(sheet_name)}.md"
        target.write_text(body, encoding="utf-8")
        outputs.append(str(target))

    return outputs


def _safe(name: str) -> str:
    return re.sub(r"[\\/:*?\"<>| ]", "_", name).strip("_") or "sheet"


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 4:
        print("usage: split_xlsx.py <md_file> <src_xlsx> <out_dir>", file=sys.stderr)
        sys.exit(2)
    md_path, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    md_text = Path(md_path).read_text(encoding="utf-8")
    print("\n".join(split_md(md_text, src, out)))