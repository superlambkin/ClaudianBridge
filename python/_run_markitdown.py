"""薄壁: ``python3 -m markitdown`` を呼び出して標準出力/標準エラーを取得する。

Windows 対策:
- 子プロセス（markitdown）に ``PYTHONIOENCODING=utf-8`` を渡し、
  出力を UTF-8 バイトで受け取る（``text=True`` は使わない）。
- 受け取ったバイト列を ``errors="replace"`` でデコードし、
  親側で JSON 化することでcp932/cp936 の console encoding 問題を回避する。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys


# Force UTF-8 stdout in the child even on Windows consoles whose default code
# page is cp932 (JP) or cp936 (ZH). We capture bytes (text=False), not str.
_CHILD_ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}


def _safe_decode(b: bytes) -> str:
    """Decode bytes as UTF-8 with replacement so cp932/cp936 console artifacts
    never crash the caller."""
    if b is None:
        return ""
    return b.decode("utf-8", errors="replace")


def run(src_path: str, timeout: int = 120) -> dict:
    """markitdown を実行し結果を dict で返す。

    Parameters
    ----------
    src_path : str
        変換元 Office ファイルへの絶対パス。
    timeout : int
        サブプロセス制限時間（秒）。既定 120。
    """
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "markitdown", src_path],
            capture_output=True,
            timeout=timeout,
            env=_CHILD_ENV,
        )
        return {
            "exitCode": proc.returncode,
            "stdout": _safe_decode(proc.stdout),
            "stderr": _safe_decode(proc.stderr),
        }
    except FileNotFoundError as exc:
        return {"exitCode": 127, "stdout": "", "stderr": f"python not found: {exc}"}
    except subprocess.TimeoutExpired as exc:
        return {
            "exitCode": 124,
            "stdout": _safe_decode(exc.stdout) if exc.stdout else "",
            "stderr": f"markitdown timeout after {timeout}s",
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stdout.write("usage: _run_markitdown.py <src>")
        sys.exit(2)
    result = run(sys.argv[1])
    # Emit the JSON as raw UTF-8 bytes so it survives any capture pipeline.
    sys.stdout.buffer.write(
        json.dumps(result, ensure_ascii=False).encode("utf-8") + b"\n"
    )
