"""
query.py — RAG Knowledge Base Interactive Query Script
"""

import json
import yaml
import logging
import os
import sys
import threading
import time as time_module
from pathlib import Path
from src.embedder import BGEEmbedder
from src.vector_store import ChromaVectorStore
from src.rag_query import RAGQuery
from openai import OpenAI

# ── Encoding fix for Windows cmd (GBK) ─────────────────────────────
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

def safe_print(*args, **kwargs):
    """Print with Unicode fallback for GBK terminals."""
    text = " ".join(str(a) for a in args)
    try:
        print(text, **kwargs)
    except UnicodeEncodeError:
        safe = text.encode(sys.stdout.encoding, errors='replace').decode(sys.stdout.encoding)
        print(safe, **kwargs)


def safe_write(text: str):
    """Write to stdout, safely handling characters the terminal can't display."""
    try:
        sys.stdout.write(text)
    except UnicodeEncodeError:
        safe = text.encode(sys.stdout.encoding, errors='replace').decode(sys.stdout.encoding)
        sys.stdout.write(safe)
    sys.stdout.flush()

# Monkey-patch print for Unicode safety on GBK terminals
_original_print = print
def print(*args, **kwargs):
    text = " ".join(str(a) for a in args)
    try:
        _original_print(text, **kwargs)
    except UnicodeEncodeError:
        safe = text.encode(sys.stdout.encoding, errors='replace').decode(sys.stdout.encoding)
        _original_print(safe, **kwargs)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ── ANSI Color / Style helpers ─────────────────────────────────────

class Style:
    """ANSI color constants for terminal output. Works on Windows Terminal,
    PowerShell, VS Code terminal, and most modern terminals."""
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    MAGENTA = "\033[35m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    UNDERLINE = "\033[4m"
    RESET = "\033[0m"

    SEPARATOR = "\033[90m"  # bright black for lines

    @staticmethod
    def blue(text): return f"{Style.BLUE}{text}{Style.RESET}"
    @staticmethod
    def green(text): return f"{Style.GREEN}{text}{Style.RESET}"
    @staticmethod
    def yellow(text): return f"{Style.YELLOW}{text}{Style.RESET}"
    @staticmethod
    def cyan(text): return f"{Style.CYAN}{text}{Style.RESET}"
    @staticmethod
    def red(text): return f"{Style.RED}{text}{Style.RESET}"
    @staticmethod
    def magenta(text): return f"{Style.MAGENTA}{text}{Style.RESET}"
    @staticmethod
    def bold(text): return f"{Style.BOLD}{text}{Style.RESET}"
    @staticmethod
    def dim(text): return f"{Style.DIM}{text}{Style.RESET}"
    @staticmethod
    def header(text): return f"{Style.HEADER}{Style.BOLD}{text}{Style.RESET}"

    @staticmethod
    def line(char="━"):  # ━
        return f"{Style.SEPARATOR}{char * 60}{Style.RESET}"

    @staticmethod
    def thin_line(char="─"):  # ─
        return f"{Style.SEPARATOR}{char * 60}{Style.RESET}"

    @staticmethod
    def tag(text, color):
        """Return a colored tag like `[1]`, `[PDF]`, etc."""
        return f"{color}{Style.BOLD}{text}{Style.RESET}"

    @staticmethod
    def score_bar(score: float, width: int = 10) -> str:
        """Render a simple bar for relevance score."""
        filled = round(score * width)
        bar = "█" * filled + "░" * (width - filled)
        if score >= 0.8:
            color = Style.GREEN
        elif score >= 0.6:
            color = Style.YELLOW
        else:
            color = Style.RED
        return f"{color}{bar}{Style.RESET}"

    @staticmethod
    def tag_doc(text):
        """Document source tag."""
        return f"{Style.YELLOW}{Style.BOLD}{text}{Style.RESET}"

    @staticmethod
    def tag_vault(text):
        """Vault source tag."""
        return f"{Style.MAGENTA}{Style.BOLD}{text}{Style.RESET}"

    @staticmethod
    def tag_web(text):
        """Web source tag with distinct color."""
        return f"{Style.CYAN}{Style.BOLD}{text}{Style.RESET}"

    @staticmethod
    def tag_kb(text):
        """Document source tag."""
        return f"{Style.YELLOW}{Style.BOLD}{text}{Style.RESET}"


# ── Helpers ────────────────────────────────────────────────────────

def format_time(ms: int) -> str:
    """Format milliseconds into a human-readable time string."""
    if ms < 1000:
        return f"{ms}ms"
    seconds = ms / 1000
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes}m{secs:02d}s"


def generate_report(history: list, config: dict) -> str:
    """Generate a structured Markdown report from conversation history.

    Args:
        history: List of {"user": ..., "assistant": ...} dicts.
        config: Config dict for metadata.

    Returns:
        Markdown report string.
    """
    from datetime import datetime

    lines = []
    lines.append(f"# RAG KnowledgeBase — Session Report")
    lines.append("")
    lines.append(f"> 📅 **Date**: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"> 📚 **Collection**: {config.get('vector_store', {}).get('collection_name', 'N/A')}")
    lines.append(f"> 🧠 **Model**: {config.get('llm', {}).get('model', 'N/A')}")
    ws = config.get("web_search", {})
    lines.append(f"> 🌐 **Web Search**: {'ON' if ws.get('enabled') else 'OFF'}")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 💬 Conversation Log")
    lines.append("")

    for i, turn in enumerate(history, 1):
        lines.append(f"### Q{i}: {turn['user']}")
        lines.append("")
        lines.append(f"{turn['assistant']}")
        lines.append("")
        lines.append("---")
        lines.append("")

    lines.append(f"*Report generated automatically — {len(history)} Q&A turns*")
    return "\n".join(lines)


# ── Spinner Animation ──────────────────────────────────────────────

class Spinner:
    """Terminal spinner that runs in a background thread."""

    FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    # Alternative sets:
    # FRAMES = ["◜", "◠", "◝", "◞", "◡", "◟"]
    # FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"]

    def __init__(self, text: str = ""):
        self.text = text
        self._running = False
        self._thread: threading.Thread | None = None

    def _spin(self):
        i = 0
        while self._running:
            frame = self.FRAMES[i % len(self.FRAMES)]
            safe_write(f"\r  {Style.cyan(frame)} {Style.dim(self.text)}")
            time_module.sleep(0.08)
            i += 1

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._spin, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(0.5)
        safe_write("\r" + " " * 80 + "\r")


# ── Answer Parser ──────────────────────────────────────────────────

def parse_llm_answer(raw: str) -> dict:
    """Parse LLM response into thinking and answer sections.

    Looks for '## Thinking' and '## Answer' markers.
    Strips any trailing '## References' or '※' blocks from the answer.
    Strips <think>...</think> reasoning blocks (MiniMax-M3 style).
    Falls back to treating everything as answer if markers are missing.
    """
    import re

    # Strip <think>...</think> reasoning blocks first (MiniMax-M3 style)
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

    thinking = ""
    answer = raw

    # Try to split by ## Answer (most reliable)
    if "## Answer" in raw:
        parts = raw.split("## Answer", 1)
        answer = parts[1].strip()
        before = parts[0]
        if "## Thinking" in before:
            thinking = before.split("## Thinking", 1)[1].strip()
        else:
            thinking = before.strip()
    elif "## Thinking" in raw:
        parts = raw.split("## Thinking", 1)
        remaining = parts[1].strip()
        if "\n\n" in remaining:
            split_pos = remaining.index("\n\n")
            thinking = remaining[:split_pos].strip()
            answer = remaining[split_pos:].strip()
        else:
            thinking = remaining
            answer = ""

    # Strip trailing References section from answer
    # Look for ## References or ## Reference or 参考文献
    for marker in ["## References", "## Reference", "## 参考文献", "## 참고"]:
        if marker in answer:
            answer = answer.split(marker, 1)[0].strip()
            break

    # Strip trailing ※ numbered reference lines
    lines = answer.split("\n")
    clean_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("※") and any(kw in stripped for kw in ["Source:", "Content:"]):
            break
        clean_lines.append(line)
    answer = "\n".join(clean_lines).strip()

    return {"thinking": thinking, "answer": answer}


class RAGQuerier:
    """RAG KnowledgeBase Query Executor"""

    def __init__(self, config_path: str = "config.yaml"):
        config_file = Path(config_path)
        if not config_file.exists():
            config_file = Path(__file__).parent / config_path

        with open(config_file, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f)

        self.embedder = BGEEmbedder(
            self.config["embedding"]["model"],
            local_model_dir=self.config["embedding"].get("local_model_dir"),
        )
        self.vector_store = ChromaVectorStore(
            persist_dir=self.config["vector_store"]["persist_dir"],
            collection_name=self.config["vector_store"]["collection_name"],
        )

        # Setup multi-model config (must happen BEFORE llm_client creation)
        llm_config = self.config.get("llm", {})
        self.llm_models = llm_config.get("models", {})
        self.current_model_key = llm_config.get("default", "minimax")
        current_info = self.llm_models.get(self.current_model_key, {})
        self.current_model_info = current_info

        # Create LLM client with current model credentials
        self.llm_client = OpenAI(
            api_key=current_info.get("api_key", ""),
            base_url=current_info.get("base_url", ""),
        )

        self.rag = RAGQuery(
            vector_store=self.vector_store,
            embedder=self.embedder,
            llm_client=self.llm_client,
            llm_model=current_info.get("model", "MiniMax-M3"),
            config=self.config,
        )

        count = self.vector_store.get_count()
        logger.info(f"Knowledge base loaded: {count} chunks")

    # ── Checkbox-style source picker ──────────────────────────────

    def _checkbox_picker(self, items: list, title: str = "", multi: bool = True, control_prefix: str = "[") -> list:
        """Terminal checkbox / radio picker.

        Args:
            items: list of (label, value) tuples
            title: header text
            multi: True → ☐/☑ checkboxes, False → ○/● radio buttons
            control_prefix: Items starting with this prefix are control items (not affected by ESC all/none)

        Returns:
            list of selected values
        """
        if not items:
            return []

        selected = [False] * len(items)
        cursor = 0

        # Identify control items (like [FINISH], [All], etc.) — these should not be toggled by ESC
        is_control = [label.startswith(control_prefix) for label, _ in items]

        def render():
            os.system("cls" if os.name == "nt" else "clear")
            print("═" * 60)
            print(f"  {title}")
            print("═" * 60)
            if multi:
                print("  [SPACE] Toggle  [↑/↓] Move  [ENTER] Confirm  [ESC] All/None (folders only)")
            else:
                print("  [↑/↓] Move  [ENTER] Confirm  [ESC] All/None")
            print("─" * 60)
            for i, (label, _) in enumerate(items):
                if multi:
                    cb = "☑" if selected[i] else "☐"
                else:
                    cb = "●" if selected[i] else "○"
                line = f"  {cb} {label}"
                if i == cursor:
                    print(f"  ▸ {line[2:]}")
                else:
                    print(f"    {line[2:]}")
            print("─" * 60)
            cnt = sum(selected)
            if multi:
                print(f"  Selected: {cnt}/{len(items)}")
            print("═" * 60)

        if os.name == "nt":
            import msvcrt

            while True:
                render()
                key = msvcrt.getch()
                if key == b"\xe0":
                    key2 = msvcrt.getch()
                    if key2 == b"H":
                        cursor = (cursor - 1) % len(items)
                    elif key2 == b"P":
                        cursor = (cursor + 1) % len(items)
                elif key == b" ":
                    if multi:
                        selected[cursor] = not selected[cursor]
                    else:
                        selected = [False] * len(items)
                        selected[cursor] = True
                elif key == b"\r":
                    break
                elif key == b"\x1b":
                    # ESC: toggle all/none but ONLY for non-control items
                    non_control_indices = [i for i, ctrl in enumerate(is_control) if not ctrl]
                    if not non_control_indices:
                        continue
                    non_control_selected = sum(selected[i] for i in non_control_indices)
                    if non_control_selected == len(non_control_indices):
                        # All non-control selected → deselect all
                        for i in non_control_indices:
                            selected[i] = False
                    else:
                        # Not all selected → select all non-control
                        for i in non_control_indices:
                            selected[i] = True
        else:
            render()
            try:
                choice = input("\n  Numbers (comma-separated, e.g. 1,3,5): ").strip()
                if choice:
                    for part in choice.split(","):
                        idx = int(part.strip()) - 1
                        if 0 <= idx < len(items):
                            selected[idx] = True
            except (ValueError, EOFError):
                pass

        render()
        return [items[i][1] for i, s in enumerate(selected) if s]

    def _pick_source_init(self) -> str | list | None:
        """Launch-time document picker (checkbox / multi-select)."""
        try:
            all_data = self.vector_store.collection.get(limit=10000)
        except Exception:
            return None

        sources = sorted(set(m.get("source", "unknown") for m in all_data["metadatas"]))
        if not sources:
            return None

        items = [("All documents", None), ("[SKIP Document selection]", "skip")] + [(s, s) for s in sources]
        picked = self._checkbox_picker(items, title="Select documents to search (SPACE to toggle, ESC=All, 'SKIP' to skip)", multi=True)

        if not picked or "skip" in picked:
            return None
        # If "All documents" is in selection, return None (no filter)
        if None in picked:
            return None
        return picked

    def _vault_folder_picker(self, vault_root: Path, max_depth: int = 2, max_select: int = 5) -> list:
        """Tree-style folder picker with expand/collapse, max 2 levels, max 5 selections.

        Controls:
        - SPACE: toggle selection (max 5 folders)
        - ENTER: expand/collapse folder or confirm selection
        - ↑/↓: navigate
        - ESC: finish selection
        """
        selected = []  # list of relative paths (max 5)
        expanded = set()  # set of expanded folder paths

        def get_subdirs(path: Path) -> list[Path]:
            """Get sorted subdirectories of a path."""
            try:
                return sorted([p for p in path.iterdir() if p.is_dir() and not p.name.startswith(".")])
            except PermissionError:
                return []

        def build_tree_items(path: Path, level: int = 0, prefix: str = "") -> list:
            """Build tree items recursively for display."""
            items = []
            if level > max_depth:
                return items

            subdirs = get_subdirs(path)
            for p in subdirs:
                rel = p.relative_to(vault_root).as_posix()
                has_sub = len(get_subdirs(p)) > 0
                is_expanded = rel in expanded
                is_selected = rel in selected

                # Build label with tree prefix
                if level == 0:
                    label_prefix = ""
                else:
                    label_prefix = "  " * level + "├─ "

                # Expand/collapse indicator
                if has_sub:
                    indicator = "▼ " if is_expanded else "▶ "
                else:
                    indicator = "  "

                # Selection checkbox
                checkbox = "☑ " if is_selected else "☐ "

                label = f"{label_prefix}{indicator}{checkbox}📁 {p.name}"
                items.append((label, rel, p, has_sub, level))

                # Add children if expanded
                if has_sub and is_expanded and level < max_depth:
                    items.extend(build_tree_items(p, level + 1, rel))

            return items

        def render():
            """Render the tree picker."""
            os.system("cls" if os.name == "nt" else "clear")
            print("═" * 70)
            print(f"  📓 Vault Folder Selection (max {max_select} folders, {max_depth} levels)")
            print("═" * 70)
            print("  [SPACE] Toggle  [ENTER] Expand/Confirm  [↑/↓] Move  [ESC] Finish")
            print("─" * 70)

            items = build_tree_items(vault_root)

            # Add control items at the end
            items.append(("[All Vault folders]", "__all__", None, False, -1))
            items.append(("[FINISH — confirm selection]", "__finish__", None, False, -1))

            for i, (label, value, path, has_sub, level) in enumerate(items):
                if i == cursor:
                    print(f"  ▸ {label}")
                else:
                    print(f"    {label}")

            print("─" * 70)
            print(f"  Selected: {len(selected)}/{max_select}  {selected if selected else '(none)'}")
            print("═" * 70)
            return items

        cursor = 0

        if os.name == "nt":
            import msvcrt

            while True:
                items = render()
                if not items:
                    break

                key = msvcrt.getch()
                if key == b"\xe0":
                    key2 = msvcrt.getch()
                    if key2 == b"H":  # Up
                        cursor = (cursor - 1) % len(items)
                    elif key2 == b"P":  # Down
                        cursor = (cursor + 1) % len(items)
                elif key == b" ":  # SPACE — toggle selection
                    if cursor < len(items) - 2:  # Not a control item
                        label, rel, path, has_sub, level = items[cursor]
                        if rel in selected:
                            selected.remove(rel)
                        elif len(selected) < max_select:
                            selected.append(rel)
                        else:
                            print(f"\n  {Style.yellow('⚠')} {Style.dim(f'Max {max_select} folders allowed!')}")
                            time_module.sleep(1)
                elif key == b"\r":  # ENTER — expand/collapse or confirm
                    if cursor >= len(items) - 2:  # Control item
                        label, value, _, _, _ = items[cursor]
                        if value == "__finish__":
                            break
                        elif value == "__all__":
                            selected = []
                            self.rag.vault_enabled = True
                            self.rag.vault_subdirs = None
                            print(f"  {Style.blue('◉')} {Style.bold('All Vault folders selected')}")
                            return []
                    else:
                        label, rel, path, has_sub, level = items[cursor]
                        if has_sub:
                            # Toggle expand/collapse
                            if rel in expanded:
                                expanded.remove(rel)
                            else:
                                expanded.add(rel)
                        else:
                            # Leaf folder — toggle selection
                            if rel in selected:
                                selected.remove(rel)
                            elif len(selected) < max_select:
                                selected.append(rel)
                elif key == b"\x1b":  # ESC — finish
                    break
        else:
            # Fallback for non-Windows
            items = build_tree_items(vault_root)
            print("\n  📓 Vault Folder Selection")
            for i, (label, rel, _, _, _) in enumerate(items, 1):
                print(f"  {i}. {label}")
            try:
                choice = input("\n  Numbers (comma-separated): ").strip()
                for part in choice.split(","):
                    idx = int(part.strip()) - 1
                    if 0 <= idx < len(items):
                        rel = items[idx][1]
                        if rel not in selected and len(selected) < max_select:
                            selected.append(rel)
            except (ValueError, EOFError):
                pass

        if selected:
            self.rag.vault_enabled = True
            self.rag.vault_subdirs = selected
            print(f"  {Style.blue('◉')} {Style.bold(f'Vault folders selected: {selected}')}")
        else:
            self.rag.vault_enabled = False
            self.rag.vault_subdirs = None
            print(f"  {Style.blue('◉')} {Style.dim('Vault selection skipped')}")

        return selected

    # ── Query ────────────────────────────────────────────────────

    _question_counter: int = 0  # tracks question number across turns
    _last_answer: str = ""  # stores last answer text for copy

    def _scope_text(self, source: str | list | None) -> str:
        """Format scope for display."""
        if source is None:
            return ""
        if isinstance(source, str):
            return f" [{source}]"
        return f" [{', '.join(source)}]"

    def ask(self, question: str, top_k: int = 5, source: str | list | None = None, vault_subdirs: list | None = None) -> dict:
        """Ask a question to the KnowledgeBase with colorful formatted output."""
        self._question_counter += 1
        qnum = self._question_counter

        # ── Spinner while querying ────────────────────────────
        has_web = self.rag.web_search_enabled or (not self.rag.web_search_enabled and self.rag.web_fallback)
        # Determine if we should skip KB (vault-only mode: vault selected but no DOC selected)
        skip_kb = vault_subdirs is not None and len(vault_subdirs) > 0 and source is None
        spinner_text = "Querying Vault" if skip_kb else f"Querying KB{', web' if has_web else ''}"
        spinner = Spinner(f"{spinner_text}...")
        spinner.start()
        try:
            # In vault-only mode, disable web search (vault search is the target)
            web_search_param = False if skip_kb else None
            result = self.rag.query(question, top_k=top_k, source_filter=source, vault_subdirs=vault_subdirs, skip_kb=skip_kb, web_search=web_search_param)
        finally:
            spinner.stop()

        scope = Style.dim(self._scope_text(source))

        # ── Parse thinking / answer ───────────────────────────
        parsed = parse_llm_answer(result["answer"])
        thinking = parsed["thinking"]
        answer_text = parsed["answer"]

        has_kb = bool(result["sources"])
        has_web_result = bool(result.get("web_sources", []))

        # ═══════════════════════════════════════════════════════
        #  QUESTION HEADER
        # ═══════════════════════════════════════════════════════
        print()
        print(Style.line("━"))
        header = f"  {Style.magenta('📝')} {Style.bold(f'Question ({qnum})')}{scope}"
        # Add source type badges
        badges = []
        if has_kb:
            badges.append(f"{Style.tag_doc(' DOC ')}")
        if has_web_result:
            badges.append(f"{Style.tag_web(' WEB ')}")
        # Vault badge from result
        if result.get("vault_sources"):
            badges.append(f"{Style.tag_vault(' VAULT ')}")
        if badges:
            header += "  " + " ".join(badges)
        print(header)
        print(Style.line("━"))
        print(f"  {Style.cyan(question)}")
        print()

        # ═══════════════════════════════════════════════════════
        #  THINKING
        # ═══════════════════════════════════════════════════════
        if thinking:
            print(f"  {Style.yellow('🤔')} {Style.bold('Thinking')}")
            print(Style.thin_line("┄"))
            for line in thinking.split("\n"):
                line = line.strip()
                if line:
                    print(f"  {Style.dim(line)}")
            print()

        # ═══════════════════════════════════════════════════════
        #  ANSWER
        # ═══════════════════════════════════════════════════════
        print(f"  {Style.green('💡')} {Style.bold('Answer')}")
        print(Style.thin_line("┄"))
        # Render answer with color highlighting (KB-only = enhanced)
        has_web = bool(result.get("web_sources", []))
        rendered = []
        prev_blank = False
        for raw_line in answer_text.split("\n"):
            stripped = raw_line.strip()
            if not stripped:
                if prev_blank:
                    continue  # skip consecutive blank lines
                rendered.append("")
                prev_blank = True
                continue
            prev_blank = False

            # Apply color based on line content
            if stripped.startswith("✅"):
                line = Style.green(stripped)
            elif stripped.startswith("❌"):
                line = Style.red(stripped)
            elif stripped.startswith("📌") or stripped.startswith("⚠️"):
                line = Style.yellow(stripped)
            elif stripped.startswith("🎯") or stripped.startswith("💡"):
                line = Style.cyan(stripped)
            elif stripped.startswith("🔹") or stripped.startswith("▸") or stripped.startswith("-"):
                line = f"{Style.blue(stripped)}"
            elif stripped[0].isdigit() and "." in stripped[:4]:
                line = f"{Style.bold(stripped)}"
            elif not has_web and len(stripped) > 20:
                # KB-only mode: highlight key terms
                for kw in ["重要", "注意", "設定", "必要", "方法", "手順", "可能", "接続"]:
                    stripped = stripped.replace(kw, f"{Style.yellow(kw)}{Style.RESET}")
                    stripped = stripped.replace(kw.upper(), f"{Style.yellow(kw.upper())}{Style.RESET}")
                line = stripped
            else:
                line = stripped

            rendered.append(f"  {line}")
        print("\n".join(rendered))
        print()

        # ═══════════════════════════════════════════════════════
        #  SOURCES — Document (yellow) + Web (cyan) side by side
        # ═══════════════════════════════════════════════════════
        sources = result["sources"]
        web_sources = result.get("web_sources", [])

        if sources:
            print(f"  {Style.yellow('📚')} {Style.bold(f'Document Sources ({len(sources)})')}")
            print(Style.thin_line("┄"))
            for i, src in enumerate(sources, 1):
                filename = src.get("source", "?")
                page = src.get("page", "?")
                score = src.get("score", 0)
                bar = Style.score_bar(score)
                tag = Style.tag(f"[{i}]", Style.YELLOW)
                print(f"  {tag} {Style.dim(filename)}  p.{page}  {bar}  {Style.dim(f'{score:.2f}')}")
            print()

        if web_sources:
            print(f"  {Style.cyan('🌐')} {Style.bold(f'Web Results ({len(web_sources)})')}")
            print(Style.thin_line("┄"))
            for i, ws in enumerate(web_sources, 1):
                title = ws.get("title", "?")
                url = ws.get("url", "?")
                snippet = ws.get("snippet", "")
                tag = Style.tag(f"[{i}]", Style.CYAN)
                print(f"  {tag} {Style.bold(title)}")
                print(f"    {Style.dim(url)}")
                if snippet:
                    short_snippet = snippet[:120] + ("..." if len(snippet) > 120 else "")
                    print(f"    {Style.dim(short_snippet)}")
            print()

        # Vault sources display
        vault_sources = result.get("vault_sources", [])
        if vault_sources:
            print(f"  {Style.magenta('📓')} {Style.bold(f'Vault Sources ({len(vault_sources)})')}")
            print(Style.thin_line("┄"))
            for i, vs in enumerate(vault_sources, 1):
                title = vs.get("title", "?")
                score = vs.get("score", 0)
                tag = Style.tag(f"[{i}]", Style.MAGENTA)
                print(f"  {tag} {Style.bold(title)}  {Style.dim(f'(score: {score})')}")
            print()

        # ═══════════════════════════════════════════════════════
        #  STATS FOOTER
        # ═══════════════════════════════════════════════════════
        search_time = result.get("search_time_ms", 0)
        pt = result.get("prompt_tokens", 0)
        ct = result.get("completion_tokens", 0)
        tpt = result.get("total_prompt_tokens", 0)
        tct = result.get("total_completion_tokens", 0)
        time_str = format_time(search_time)
        mem_limit = self.rag.MAX_HISTORY_TOKENS
        mem_breakdown = {"Q_input": 0, "Thinking": 0, "Answer_show": 0, "References": 0, "other": 0}
        mem_usage = 0
        for h in self.rag.conversation_history:
            u = h.get("user", "")
            a = h.get("assistant", "")
            mem_usage += len(u) + len(a)
            mem_breakdown["Q_input"] += len(u)
            # Rough breakdown of assistant content
            a_text = a
            if "## Thinking" in a_text:
                mem_breakdown["Thinking"] += a_text.count("## Thinking") * 10
            if "## Answer" in a_text:
                mem_breakdown["Answer_show"] += a_text.count("## Answer") * 10
            if "## References" in a_text or "※" in a_text:
                mem_breakdown["References"] += 1
            mem_breakdown["other"] += len(a_text)
        mem_pct = min(100, int(mem_usage / mem_limit * 100))

        # Build mem bar visualization
        mem_bar_w = 16
        filled = round(mem_pct / 100 * mem_bar_w)
        if filled > mem_bar_w: filled = mem_bar_w
        bar = "█" * filled + "░" * (mem_bar_w - filled)
        if mem_pct >= 80:
            bar_color = Style.YELLOW
        elif mem_pct >= 60:
            bar_color = Style.CYAN
        else:
            bar_color = Style.GREEN
        mem_bar = f"{bar_color}{bar}{Style.RESET}"

        # Show compression warning if triggered
        mem_display = f"Mem: {mem_bar} {mem_pct}%"
        if getattr(self.rag, '_compressed', False):
            mem_display = f"Mem: {mem_bar} {mem_pct}% (📦 compressed)"

        # Build status tags for Web/Vault
        ws_on = self.rag.web_search_enabled or (self.rag.web_fallback and not sources)
        ws_tag = Style.green(" WEB ") if ws_on else Style.dim(" WEB ")
        vs_tag = Style.magenta(" VAULT ") if self.rag.vault_enabled and self.rag.vault_path else Style.dim(" VAULT ")

        print(Style.line())
        self._last_answer = answer_text  # save for copy

        # ── Status bar ────────────────────────────────────────────
        status_items = []
        status_items.append(f"{Style.dim('⚡')} {Style.dim(time_str)}")
        status_items.append(f"{Style.dim('📥')} {Style.dim(f'{pt}+{ct} tok')}")
        status_items.append(f"{Style.dim('📊')} {Style.dim(f'Σ {tpt}+{tct} tok')}")
        status_items.append(f"{Style.dim('🧠')} {Style.dim(mem_display)}")
        print("  " + "  ".join(status_items))

        # ── Status badges line ──────────────────────────────────────
        print(f"  {ws_tag}  {vs_tag}")
        print()
        return result
        return result

    def _apply_model(self, key: str) -> None:
        """Switch LLM client to the given model key."""
        info = self.llm_models.get(key)
        if not info:
            print(f"  {Style.red('✗')} {Style.dim(f'Unknown model: {key}')}")
            return
        self.current_model_key = key
        self.current_model_info = info
        from openai import OpenAI
        self.llm_client = OpenAI(
            api_key=info.get("api_key", ""),
            base_url=info.get("base_url", ""),
        )
        if hasattr(self, "rag") and self.rag is not None:
            self.rag.llm_client = self.llm_client
            self.rag.llm_model = info.get("model", "MiniMax-M3")
        logger.info(f"Switched to model: {key} ({info.get('model')})")

    def _switch_model(self) -> None:
        """Interactive model switch via picker."""
        model_keys = list(self.llm_models.keys())
        if not model_keys:
            print(f"  {Style.red('✗')} {Style.dim('No models configured in config.yaml')}")
            return
        items = [(f"🤖 {k} ({self.llm_models[k].get('model','?')})", k) for k in model_keys]
        # Mark current
        picked = self._checkbox_picker(items, title="Select LLM model (SPACE to select)", multi=False)
        if picked:
            self._apply_model(picked[0])
            print(f"  {Style.green('✓')} {Style.bold(f'Switched to: {picked[0]}')}")

    def _list_sources(self) -> None:
        """List all documents in the KnowledgeBase with colors."""
        try:
            all_data = self.vector_store.collection.get(limit=10000)
            sources = set()
            for m in all_data["metadatas"]:
                sources.add(m.get("source", "unknown"))
            print(f"\n  {Style.yellow('📄')} {Style.bold(f'Documents ({len(sources)})')}:")
            for s in sorted(sources):
                print(f"    {Style.cyan('•')} {Style.dim(s)}")
        except Exception as e:
            print(f"  {Style.red('Error:')} {e}")

    def _copy_last_answer(self) -> None:
        """Copy last answer text to clipboard."""
        if not self._last_answer:
            print(f"  {Style.red('✗')} {Style.dim('No answer to copy.')}")
            return
        try:
            import subprocess
            # Windows: clip command
            proc = subprocess.Popen(["clip"], stdin=subprocess.PIPE, shell=True)
            proc.communicate(self._last_answer.encode("utf-8"))
            print(f"  {Style.green('📋')} {Style.bold('Answer copied to clipboard!')}")
        except Exception as e:
            print(f"  {Style.red('✗')} {Style.dim(f'Copy failed: {e}')}")
            # Fallback: just print the answer
            print(f"  {Style.dim(self._last_answer)}")

    def _show_history(self) -> None:
        """Display recent conversation history with colors."""
        history = self.rag.conversation_history
        if not history:
            print(f"  {Style.dim('No conversation history yet.')}")
            return

        print(f"\n  {Style.magenta('💬')} {Style.bold(f'Conversation History ({len(history)} turns)')}")
        print(Style.thin_line())
        for i, turn in enumerate(history, 1):
            user_q = turn["user"][:120] + ("..." if len(turn["user"]) > 120 else "")
            answer_preview = turn["assistant"][:150] + ("..." if len(turn["assistant"]) > 150 else "")
            print(f"  {Style.cyan(f'#{i}')} {Style.bold('Q:')} {Style.yellow(user_q)}")
            print(f"     {Style.bold('A:')} {Style.dim(answer_preview)}")
            print()

    def _export_report(self) -> None:
        """Export conversation history as a Markdown report to the Report/ folder."""
        from datetime import datetime

        history = self.rag.conversation_history
        if not history:
            print(f"  {Style.red('✗')} {Style.dim('No conversation to export.')}")
            return

        # Ensure Report/ directory exists
        report_dir = Path("Report")
        report_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename with timestamp
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = report_dir / f"rag_answer_{ts}.md"

        # Generate report content
        content = generate_report(history, self.config)

        filename.write_text(content, encoding="utf-8")
        print(f"  {Style.green('✅')} {Style.bold('Report saved:')} {Style.cyan(str(filename))}")

    def _show_mem_detail(self) -> None:
        """Display detailed memory usage breakdown."""
        if not self.rag.conversation_history:
            print(f"  {Style.dim('No conversation yet.')}")
            return

        mem_limit = self.rag.MAX_HISTORY_TOKENS
        total_chars = sum(len(h.get("user","")) + len(h.get("assistant","")) for h in self.rag.conversation_history)
        n_turns = len(self.rag.conversation_history)
        compressed = getattr(self.rag, '_compressed', False)

        print()
        print(f"  {Style.magenta('🧠')} {Style.bold(f'Memory Usage ({n_turns} turns)')}")
        print(Style.thin_line("┄"))

        # Per-turn breakdown
        for i, h in enumerate(self.rag.conversation_history, 1):
            u_len = len(h.get("user", ""))
            a_len = len(h.get("assistant", ""))
            total = u_len + a_len
            pct = total / mem_limit * 100
            # Visual bar per turn
            bar_w = round(total / mem_limit * 30) if total > 0 else 1
            bar_w = min(bar_w, 30)
            bar_str = "█" * bar_w + "░" * (30 - bar_w)

            label = h.get("user", "?")[:40]
            if "(Compressed" in label or "compressed" in label.lower():
                tag = Style.yellow("📦")
                print(f"  {tag} {Style.dim(label)}  {bar_str} {pct:.1f}%")
            else:
                print(f"  {Style.cyan(f'#{i}')} {Style.dim(label)}")
                print(f"     User: {Style.dim(f'{u_len:>5} chars')}  Answer: {Style.dim(f'{a_len:>5} chars')}  {bar_str}")

        print(Style.thin_line("┄"))
        total_pct = total_chars / mem_limit * 100
        bar_w = min(round(total_pct / 100 * 30), 30)
        bar_str = "█" * bar_w + "░" * (30 - bar_w)
        if total_pct >= 80:
            color = Style.YELLOW
        elif total_pct >= 50:
            color = Style.CYAN
        else:
            color = Style.GREEN
        print(f"  {color}Total: {Style.bold(f'{total_chars} / {mem_limit} chars')}  {bar_str} {total_pct:.0f}%{Style.RESET}")
        if compressed:
            print(f"  {Style.yellow('📦')} {Style.dim('History compressed (old entries summarized)')}")
        print()

    def _show_help(self) -> None:
        """Display all available commands and shortcuts."""
        print()
        print(f"  {Style.magenta('📖')} {Style.bold('Help — Commands & Shortcuts')}")
        print(Style.thin_line("┄"))
        print(f"  {Style.cyan('Shortcuts')}:")
        print(f"    {Style.green('1')}{Style.dim('|')}{Style.green('2')}{Style.dim('|')}{Style.green('3')}  Select suggested question")
        print(f"    {Style.green('n')}           New question")
        print(f"    {Style.green('c')}           Copy last answer")
        print(f"    {Style.green('h')}           Show this help")
        print(f"    {Style.green('r')}           Export report ({Style.green('/report')})")
        print(f"    {Style.green('0')}{Style.dim('|')}{Style.green('q')}{Style.dim('|')}{Style.green('exit')}   End session")
        print()
        print(f"  {Style.cyan('Commands')}:")
        print(f"    {Style.green('/source')} {Style.dim('<f>')}          Scope to one doc")
        print(f"    {Style.green('/multi')} {Style.dim('<a,b,c>')}      Scope to multi docs")
        print(f"    {Style.green('/all')}   {Style.dim('(a)')}           All documents")
        print(f"    {Style.green('/list')}  {Style.dim('(l)')}           List documents")
        print(f"    {Style.green('/pick')}  {Style.dim('(p)')}           Re-open picker")
        print(f"    {Style.green('/clear')} {Style.dim('(x)')}           Clear history")
        print(f"    {Style.green('/history')}{Style.dim('(h)')}          Show history")
        print(f"    {Style.green('/model')}{Style.dim('(m)')}          Switch LLM model")
        print(f"    {Style.green('/mem')}   {Style.dim('(z)')}           Memory detail")
        print(f"    {Style.green('/model')}{Style.dim('(m)')}          Switch LLM model")
        print(f"    {Style.green('/web')}   {Style.dim('(w)')}           Toggle web")
        print(f"    {Style.green('/md')}    {Style.dim('(v)')}           Select vault MD")
        print(f"    {Style.green('/md set')}                         Set vault path")
        print(f"    {Style.green('/report')}{Style.dim('(r)')}          Export report")
        print()
        print(f"  {Style.cyan('Status bar')}:")
        print(f"    {Style.dim('⚡ Time  📥 tok  📊 Σ tok  🧠 Mem%')}")
        print(f"    {Style.green(' WEB ')}  {Style.magenta(' VAULT ')}")
        print(Style.line())

    def _show_suggestions(self):
        """Generate and display follow-up question suggestions."""
        if not self.rag.conversation_history:
            return
        print(f"  {Style.magenta('💡')} {Style.bold('Suggested next questions')}:")
        print(Style.thin_line("┄"))
        suggestions = self.rag.suggest_questions(self.rag.conversation_history[-5:])
        if suggestions:
            for i, q in enumerate(suggestions, 1):
                print(f"  {Style.cyan(f'[{i}]')} {Style.bold(q)}")
        print(f"  {Style.dim('[0]')} {Style.dim('End session & export report')}")
        print()

    def interactive(self) -> None:
        """Interactive query mode with colorful formatting and conversation commands."""
        # ── Step 1: Launch-time document picker (multi-select) ──
        source = self._pick_source_init()

        # ── Step 2: Vault folder picker (multi-level) ──
        selected_vault_dirs = []
        vault_path = self.rag.vault_path or self.config.get("obsidian_vault", {}).get("path", "")
        if vault_path and Path(vault_path).exists():
            vault_root = Path(vault_path)
            print()  # spacer between two pickers
            selected_vault_dirs = self._vault_folder_picker(vault_root)
            # Sync vault_subdirs to self.rag for later use
            if selected_vault_dirs:
                self.rag.vault_subdirs = selected_vault_dirs
                self.rag.vault_enabled = True
        else:
            print()
            print(f"  {Style.yellow('⚠')} {Style.dim('Vault path not configured. Use /md set <path>')}")

        # ── Banner ──
        scope_text = self._scope_text(source)
        source_line = scope_text.lstrip(" [").rstrip("]") if scope_text else "All documents"
        ws_status = "🌐 ON" if self.rag.web_search_enabled else "🌐 OFF"
        vs_status = "📓 ON" if self.rag.vault_enabled else "📓 OFF"

        # System info
        embedder_model = self.config.get("embedding", {}).get("model", "N/A")
        llm_config = self.config.get("llm", {})
        llm_models = llm_config.get("models", {})
        current_model_key = llm_config.get("default", "minimax")
        current_model_info = llm_models.get(current_model_key, {})
        llm_model_name = current_model_info.get("model", "N/A")
        collection = self.config.get("vector_store", {}).get("collection_name", "N/A")
        chunk_count = self.vector_store.get_count()
        # Read version from VERSION file
        version = "1.0.0"
        try:
            vf = Path(__file__).parent / "VERSION"
            if vf.exists():
                version = vf.read_text(encoding="utf-8").strip()
        except Exception:
            pass

        # Feature list for this version
        features = [
            "📥 Incremental build",
            "🌐 Web search",
            "🧠 Multi-turn memory",
            "🎨 Color output",
            "📓 Vault reference",
            "💡 Question suggestions",
            "📊 Token & Mem stats",
            "📋 Copy answer",
            "📄 Report export",
        ]

        title_line = f"RAG v{version}"
        info_lines = [
            f"🧠 Embedder: {embedder_model}",
            f"🤖 LLM: {llm_model_name} ({current_model_key})",
            f"🗄️  DB: {collection} ({chunk_count} chunks)",
        ]

        # Calculate width dynamically
        left_col = max(len(title_line), len(source_line) + 4, max(len(l) for l in info_lines))
        inner_w = max(left_col, max(len(f) for f in features)) + 6
        if inner_w < 56:
            inner_w = 56

        top_border = "╔" + "═" * inner_w + "╗"
        bot_border = "╚" + "═" * inner_w + "╝"
        print()
        print(Style.header(Style.MAGENTA + top_border))
        print(Style.header(f"║  {title_line}" + " " * (inner_w - len(title_line) - 2) + "║"))
        print(Style.header(f"║  📂 {Style.dim(source_line)}" + " " * (inner_w - len(source_line) - 5) + "║"))
        for l in info_lines:
            print(f"║  {Style.dim(l)}" + " " * (inner_w - len(l) - 2) + "║")
        print(f"║  {Style.dim('─' * inner_w)}║")
        # Features as tags
        tag_line = ""
        for f in features:
            tag_line += f"  {Style.bold(f[:2])}{Style.dim(f[2:])}"
        # Show features in wrapped groups
        for i in range(0, len(features), 3):
            row_features = features[i:i+3]
            row_text = " │ ".join(row_features)
            print(f"║  {Style.dim(row_text)}" + " " * (inner_w - len(row_text) - 2) + "║")
        print(Style.header(Style.MAGENTA + bot_border))
        print(f"  {Style.dim('Web:')} {ws_status}  {Style.dim('Vault:')} {vs_status}")
        print()
        print(f"  {Style.dim('? (h:help)')}")
        print(Style.line())

        while True:
            try:
                line = input(f"\n{Style.green('?')} ").strip()

                if line.lower() in ("q", "exit"):
                    # Ask about report export before quitting
                    if self.rag.conversation_history:
                        print(f"  {Style.yellow('💾')} {Style.dim('Export report before exit? (y/n): ')}", end="")
                        resp = input().strip().lower()
                        if resp in ("y", "yes", ""):
                            self._export_report()
                    print(f"  {Style.yellow('👋')} {Style.dim('Bye!')}")
                    break

                if not line:
                    continue

                # ── Shortcuts: r=report, n=new question, c=copy, w=web ──
                if line.lower() == "r":
                    self._export_report()
                    continue
                if line.lower() == "n":
                    line = input(f"  {Style.cyan('✏️')} {Style.dim('Enter your new question: ')}").strip()
                    if not line:
                        continue
                    # Preserve vault_subdirs from rag state
                    vault_subdirs = self.rag.vault_subdirs if self.rag.vault_enabled else None
                    self.ask(line, source=source, vault_subdirs=vault_subdirs)
                    self._show_suggestions()
                    continue
                if line.lower() == "c":
                    self._copy_last_answer()
                    continue
                if line.lower() in ("w", "w on"):
                    self.rag.web_search_enabled = True
                    print(f"  {Style.blue('◉')} {Style.bold('Web search: 🌐 ON')}")
                    continue
                if line.lower() == "w off":
                    self.rag.web_search_enabled = False
                    print(f"  {Style.blue('◉')} {Style.bold('Web search: 🌐 OFF')}")

                # ── Handle suggestion shortcuts [0]/[1]/[2]/[3] ──
                if line in ("0",):
                    self._export_report()
                    print(f"  {Style.yellow('👋')} {Style.dim('Session ended. Goodbye!')}")
                    break

                if line in ("1", "2", "3") and self.rag.conversation_history:
                    suggestions = self.rag.suggest_questions(self.rag.conversation_history[-5:])
                    if int(line) <= len(suggestions):
                        question = suggestions[int(line) - 1]
                        # Preserve vault_subdirs from rag state
                        vault_subdirs = self.rag.vault_subdirs if self.rag.vault_enabled else None
                        self.ask(question, source=source, vault_subdirs=vault_subdirs)
                        self._show_suggestions()
                        continue

                if line.startswith("/"):
                    cmd = line[1:].strip()
                    if cmd.startswith("source "):
                        source = cmd.split(" ", 1)[1]
                        print(f"  {Style.blue('◉')} {Style.bold('Scope set to:')} {Style.yellow(source)}")
                    elif cmd.startswith("multi "):
                        parts = cmd.split(" ", 1)[1]
                        source = [s.strip() for s in parts.split(",") if s.strip()]
                        print(f"  {Style.blue('◉')} {Style.bold('Scope set to:')} {Style.yellow(str(source))}")
                    elif cmd == "all":
                        source = None
                        print(f"  {Style.blue('◉')} {Style.bold('Scope reset to all documents')}")
                    elif cmd == "list":
                        self._list_sources()
                    elif cmd == "pick":
                        source = self._pick_source_init()
                        tag = source if source else "all documents"
                        print(f"  {Style.blue('◉')} {Style.bold('Scope:')} {Style.yellow(str(tag))}")
                    elif cmd == "clear":
                        self.rag.clear_history()
                        print(f"  {Style.green('🗑')} {Style.bold('Conversation history cleared')}")
                    elif cmd == "history":
                        self._show_history()
                    elif cmd == "mem":
                        self._show_mem_detail()
                    elif cmd in ("web", "w"):
                        self.rag.web_search_enabled = not self.rag.web_search_enabled
                        status = "🌐 ON" if self.rag.web_search_enabled else "🌐 OFF"
                        print(f"  {Style.blue('◉')} {Style.bold(f'Web search toggled: {status}')}")
                    elif cmd in ("web on", "w on"):
                        self.rag.web_search_enabled = True
                        print(f"  {Style.blue('◉')} {Style.bold('Web search: 🌐 ON')}")
                    elif cmd in ("web off", "w off"):
                        self.rag.web_search_enabled = False
                        print(f"  {Style.blue('◉')} {Style.bold('Web search: 🌐 OFF')}")
                    elif cmd in ("report", "r"):
                        self._export_report()
                    elif cmd in ("md", "vault"):
                        # Multi-level folder picker or set path
                        if cmd.startswith("vault "):
                            prefix = "vault "
                            parts = cmd.split(" ", 2)
                            if len(parts) >= 3:
                                self.rag.vault_path = parts[2]
                                self.rag.vault_enabled = True
                                print(f"  {Style.blue('◉')} {Style.bold(f'Vault path set: {parts[2]}')}")
                        elif cmd.startswith("md set "):
                            parts = cmd.split(" ", 2)
                            if len(parts) >= 3:
                                self.rag.vault_path = parts[2]
                                self.rag.vault_enabled = True
                                print(f"  {Style.blue('◉')} {Style.bold(f'Vault path set: {parts[2]}')}")
                        else:
                            vault_path = self.rag.vault_path or self.config.get("obsidian_vault", {}).get("path", "")
                            if vault_path and Path(vault_path).exists():
                                vault_root = Path(vault_path)
                                picked = self._vault_folder_picker(vault_root)
                                if picked:
                                    self.rag.vault_enabled = True
                                    self.rag.vault_subdirs = picked
                                    print(f"  {Style.blue('◉')} {Style.bold(f'Vault folders: {picked}')}")
                                else:
                                    print(f"  {Style.yellow('⚠')} {Style.dim('No Vault folders selected')}")
                            else:
                                print(f"  {Style.yellow('⚠')} {Style.dim('Vault path not set. Use /md set <path>')}")
                    else:
                        print(f"  {Style.red('✗')} {Style.dim(f'Unknown command: {cmd}')}")
                    continue

                # ── /model: switch LLM model ──────────────────────────
                if line.lower() in ("/model", "/m"):
                    self._switch_model()
                    continue

                # ── h: show help ──────────────────────────────────
                if line.lower() == "h":
                    self._show_help()
                    continue

                self.ask(line, source=source, vault_subdirs=self.rag.vault_subdirs if self.rag.vault_enabled else None)
                self._show_suggestions()
            except KeyboardInterrupt:
                print(f"\n  {Style.yellow('👋')} {Style.dim('Bye!')}")
                break


def print_usage():
    print("Usage:")
    print("  python query.py config.yaml                  Interactive mode (with picker)")
    print("  python query.py config.yaml --ask 'question'  One-shot mode")
    print("  python query.py config.yaml --list-sources    List documents")
    print("  python query.py config.yaml --source doc.pdf --ask 'question'  Filtered one-shot")


def main():
    import sys
    argv = sys.argv

    config_path = argv[1] if len(argv) > 1 else "config.yaml"

    source = None
    if "--source" in argv:
        idx = argv.index("--source")
        if idx + 1 < len(argv):
            source = argv[idx + 1]

    if "--list-sources" in argv:
        querier = RAGQuerier(config_path)
        querier._list_sources()
        return

    if "--json" in argv and len(argv) >= 3 and "--ask" in argv:
        ask_idx = argv.index("--ask")
        question = argv[ask_idx + 1] if ask_idx + 1 < len(argv) else None
        if not question:
            print(json.dumps({"ok": False, "answer": "質問文が指定されていません"}, ensure_ascii=False))
            return
        import io
        from contextlib import redirect_stdout

        buf = io.StringIO()
        try:
            # ask() は画面出力するため --json 時は stdout を一時的に退避
            querier = RAGQuerier(config_path)
            with redirect_stdout(buf):
                result = querier.ask(question, source=source)
            answer = result.get("answer", "")
            sources = [
                {"source": s.get("source", "?"), "page": s.get("page", None), "score": s.get("score", 0)}
                for s in result.get("sources", [])
            ]
            print(json.dumps({"ok": True, "answer": answer, "sources": sources}, ensure_ascii=False))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "answer": str(e)}, ensure_ascii=False))
        return

    if len(argv) >= 3 and argv[2] == "--ask":
        question = argv[3] if len(argv) > 3 else None
        if question:
            querier = RAGQuerier(config_path)
            querier.ask(question, source=source)
        else:
            print("Usage: python query.py config.yaml --ask \"question\"")
    elif len(argv) >= 2 and argv[1] in ("-h", "--help"):
        print_usage()
    else:
        querier = RAGQuerier(config_path)
        querier.interactive()


if __name__ == "__main__":
    main()
