"""
rag_query.py — RAG Search & Query Module
Flow: Retrieve → Build Prompt → LLM Generate
"""

import time
from pathlib import Path
from typing import List, Dict, Optional, Union
import logging

logger = logging.getLogger(__name__)


class RAGQuery:
    """RAG Query Executor with conversation memory and optional web search / vault search"""

    def __init__(self, vector_store, embedder, llm_client, llm_model: str = "MiniMax-Text-01", config: Optional[Dict] = None):
        self.vector_store = vector_store
        self.embedder = embedder
        self.llm_client = llm_client
        self.llm_model = llm_model
        self.conversation_history: List[Dict] = []
        self.config = config or {}
        self.web_search = None  # lazy init
        self.web_search_enabled: bool = False
        self.web_fallback: bool = True
        self.vault_searcher = None  # lazy init

        # Token tracking (reset on session start)
        self.total_prompt_tokens: int = 0
        self.total_completion_tokens: int = 0

        # Read config if provided
        ws_config = self.config.get("web_search", {})
        self.web_search_enabled = ws_config.get("enabled", False)
        self.web_fallback = ws_config.get("auto_fallback", True)

        # Read vault config
        vault_config = self.config.get("obsidian_vault", {})
        self.vault_enabled: bool = vault_config.get("enabled", False)
        self.vault_path: str = vault_config.get("path", "")
        if not self.vault_path:
            # Auto-detect default vault path from config or known locations
            for guess in [
                str(Path.home() / "OneDrive" / "Edge" / "Obsidian Vault"),
                str(Path.home() / "Desktop" / "Obsidian Vault"),
                str(Path.home() / "Obsidian Vault"),
            ]:
                p = Path(guess)
                if p.exists() and any(f.suffix == ".md" for f in p.rglob("*.md")):
                    self.vault_path = guess
                    break
        self.vault_max_files: int = vault_config.get("max_files", 5)
        self.vault_subdirs: Optional[List[str]] = None  # set at runtime from picker

        # Read language config
        lang_config = self.config.get("language", {})
        self.default_lang: str = lang_config.get("default", "ja")  # ja/zh/en

    def _build_where(self, source_filter: Union[str, List[str], None]) -> Optional[Dict]:
        """Convert source_filter to ChromaDB where clause.

        Supports:
          - None            → no filter
          - "doc.pdf"       → single doc  ({$eq})
          - ["a","b"]       → multiple docs ({$in})
        """
        if source_filter is None:
            return None
        if isinstance(source_filter, str):
            return {"source": {"$eq": source_filter}}
        if len(source_filter) == 0:
            return None
        if len(source_filter) == 1:
            return {"source": {"$eq": source_filter[0]}}
        return {"source": {"$in": source_filter}}

    def retrieve(self, query: str, top_k: int = 5, source_filter: Union[str, List[str], None] = None) -> List[Dict]:
        """Retrieve relevant documents, optionally filtered by source(s)."""
        query_embedding = self.embedder.encode([query])[0].tolist()
        where = self._build_where(source_filter)
        results = self.vector_store.search(
            query_text=query,
            query_embedding=query_embedding,
            top_k=top_k,
            where=where,
        )
        return results

    def _init_web_search(self):
        """Lazy-init web search from config settings."""
        if self.web_search is None:
            from src.web_search import WebSearch
            ws_config = self.config.get("web_search", {})
            self.web_search = WebSearch(max_results=ws_config.get("max_results", 5))

    def _search_vault(self, query: str, subdirs: Optional[List[str]] = None) -> List[Dict]:
        """Search Obsidian vault for markdown files relevant to the query.

        Args:
            query: The user's question.
            subdirs: Optional list of subdirectory names to restrict search to.
        """
        if not self.vault_path or not self.vault_enabled:
            return []
        vault = Path(self.vault_path)
        if not vault.exists():
            logger.warning(f"Vault path not found: {self.vault_path}")
            return []

        results = []
        try:
            md_files = list(vault.rglob("*.md"))
            # If subdirs specified, filter to those directories
            if subdirs:
                logger.info(f"Vault filter: subdirs={subdirs}")
                logger.info(f"Vault filter: total files before filter={len(md_files)}")
                md_files = [f for f in md_files if any(s in f.relative_to(vault).as_posix() for s in subdirs)]
                logger.info(f"Vault filter: files after filter={len(md_files)}")

            # Improved matching: substring match on filename AND content
            query_lower = query.lower()
            # Split into individual characters for CJK, words for others
            query_chars = set(query_lower)
            scored = []

            for f in md_files:
                name_lower = f.stem.lower().replace("_", " ").replace("-", " ")
                # Score: filename match (high weight) + content match (lower weight)
                score = 0

                # Filename: count matching characters/words
                for char in query_chars:
                    if char in name_lower:
                        score += 2  # filename match worth more

                # Also check if query is substring of filename
                if query_lower in name_lower or name_lower in query_lower:
                    score += 5

                # Content match: read file and check
                try:
                    content = f.read_text(encoding="utf-8", errors="replace")
                    content_lower = content.lower()

                    # Content substring match
                    if query_lower in content_lower:
                        score += 3

                    # Character-level match for CJK
                    content_chars = set(content_lower)
                    matching_chars = sum(1 for c in query_chars if c in content_chars)
                    if matching_chars > len(query_chars) * 0.5:  # >50% chars match
                        score += 1

                    # Minimum score threshold: at least 5 points to be considered relevant
                    # This filters out random matches from single character overlap
                    # Score breakdown: filename char match (2/char) + substring (5) + content substring (3) + content char (1)
                    if score >= 5:
                        scored.append((score, f.name, content[:1000]))
                except Exception:
                    continue

            scored.sort(key=lambda x: -x[0])
            logger.info(f"Vault search: scored files={len(scored)}")
            for score, name, content in scored[:self.vault_max_files]:
                logger.info(f"Vault match: {name} (score={score})")
                results.append({
                    "title": name,
                    "content": content,
                    "score": score,
                })
            if results:
                logger.info(f"Vault search: {len(results)} relevant files found")
            else:
                logger.info("Vault search: no files matched")
        except Exception as e:
            logger.warning(f"Vault search error: {e}")
        return results

    MAX_HISTORY_TOKENS = 6000  # rough char budget for history context
    _compressed: bool = False  # flag: old history was compressed

    def _compress_history(self):
        """Compress old conversation entries into a summary to free budget."""
        if len(self.conversation_history) < 3:
            return  # too few entries to compress

        # Keep the last 2 entries intact, summarize everything older
        keep = self.conversation_history[-2:]
        to_summarize = self.conversation_history[:-2]

        summary_lines = []
        for entry in to_summarize:
            q = entry.get("user", "")[:80]
            a = entry.get("assistant", "")[:80]
            summary_lines.append(f"Q: {q}... A: {a}...")
        summary = " | ".join(summary_lines)

        # Truncate summary to fit budget
        max_summary_len = int(self.MAX_HISTORY_TOKENS * 0.3)  # 30% of budget
        if len(summary) > max_summary_len:
            summary = summary[:max_summary_len] + "..."

        # Replace old entries with a single compressed entry
        self.conversation_history = [
            {"user": "[Compressed earlier conversation]", "assistant": summary}
        ] + keep
        self._compressed = True
        logger.info("Conversation history compressed: old entries summarized")

    def build_prompt(self, query: str, retrieved_docs: List[Dict], web_results: Optional[List[Dict]] = None, vault_results: Optional[List[Dict]] = None, include_history: bool = True) -> str:
        """Build prompt from retrieved documents and optional web results, optionally including conversation history."""
        context_parts = []
        for i, doc in enumerate(retrieved_docs, 1):
            content = doc["content"]
            if len(content) > 500:
                content = content[:500] + "..."
            context_parts.append(
                f"※{i}\n"
                f"Source: {doc['source']} (p.{doc.get('page', '?')})\n"
                f"Content: {content}"
            )
        context = "\n\n".join(context_parts)

        prompt = (
            "You are a RAG KnowledgeBase assistant.\n"
            "IMPORTANT: You MUST respond in the EXACT SAME LANGUAGE as the user's question.\n"
            "If the user asks in Chinese, answer in Chinese.\n"
            "If the user asks in Japanese, answer in Japanese.\n"
            "If the user asks in English, answer in English.\n"
            "Do NOT switch languages mid-answer.\n\n"
            "CRITICAL: Your ENTIRE answer must be in the SAME language as the user's question. "
            "If the user types a command like /source or a short keyword under 30 chars, "
            "use the language established in the conversation history.\n"
            "Every word, every sentence. Do not mix languages.\n"
            "Answer the user's question based on the reference information below.\n"
            "If the information is not found in the references, say so honestly.\n"
            "Cite sources using bracketed numbers like [1], [2] at the end of each sentence.\n"
            "Do NOT include raw metadata lines (Source:, Content:, page numbers) in your answer.\n"
            "CRITICAL: Do NOT include '## References', 'Source:', 'Content:', or any raw metadata in the Answer section.\n"
            "Those sections will be displayed separately.\n"
            "CRITICAL: Do NOT use markdown bold (**text**) or markdown headers (###, ##, ---).\n"
            "Use natural formatting with line breaks, indentation, and emojis instead.\n"
            "Paraphrase the information in your own words.\n"
            "Do NOT repeat yourself. Each point should be stated exactly once.\n"
            "Do NOT rephrase the same information multiple times.\n"
            "CRITICAL: The Answer section must NEVER contain raw document metadata like\n"
            "'Source: filename.pdf (p.X)' or 'Content: ...'. Those are for the Thinking section only.\n"
            "The Answer section should be a clean, self-contained response to the user.\n"
            "Keep your answer concise.\n\n"
            "IMPORTANT FORMATTING RULES:\n"
            "1. Each sentence MUST be on its own line. One sentence per line.\n"
            "2. Between paragraphs, add an empty line for spacing.\n"
            "3. For lists, put each item on its own line, starting with a dash or number.\n"
            "4. Use emojis at the start of major sections:\n"
            "   📌 for important notes\n"
            "   ✅ for positive/yes answers\n"
            "   ❌ for negative/no answers\n"
            "   💡 for tips\n"
            "   ⚠️ for warnings / cautions\n"
            "   🎯 for key points\n"
            "   🔹 for sub-points\n"
            "5. Put a blank line before and after each emoji heading.\n"
            "6. Numbered steps: put each step on its own line with 'Step X:' prefix.\n"
            "7. Do NOT use markdown bold (**) or markdown headings (###, ##).\n"
            "8. Keep lines SHORT — break at natural phrase boundaries (commas, particles).\n\n"
            "EXAMPLE of good formatting:\n"
            "✅ REGZA 42J8 supports internet connection.\n"
            "\n"
            "Two connection methods are available:\n"
            "\n"
            "🔹 Wired LAN\n"
            "Connect an ethernet cable from your router\n"
            "to the LAN port on the back of the TV.\n"
            "\n"
            "🔹 Wireless LAN (Wi-Fi)\n"
            "No network cable is needed.\n"
            "Configure Wi-Fi in the network settings menu.\n"
            "\n"
            "📌 Preparation required:\n"
            "Sign a contract with an internet provider.\n"
            "Prepare a wireless router.\n"
            "Complete the initial setup wizard.\n"
            "\n"
            "Format your response with the following sections:\n"
            "## Thinking\n"
            "Explain your reasoning process.\n\n"
            "## Answer\n"
            "The formatted answer following the rules above.\n"
        )

        if retrieved_docs:
            prompt += f"## References\n{context}\n\n"
        elif vault_results:
            # No KB results but vault results exist — use vault as primary source
            prompt += "## References\n(No relevant information found in KnowledgeBase)\n\n"
        else:
            prompt += "## References\n(No relevant information found)\n\n"

        # ── Web search results (inserted before References) ─────────
        if web_results:
            web_parts = []
            for i, wr in enumerate(web_results, 1):
                snippet = wr.get("snippet", "")
                content = wr.get("content", "")
                text = content if content else snippet
                if len(text) > 500:
                    text = text[:500] + "..."
                web_parts.append(
                    f"[WebResult{i}]\n"
                    f"Title: {wr.get('title', '')}\n"
                    f"URL: {wr.get('url', '')}\n"
                    f"Content: {text}"
                )
            prompt += "## Web Search Results\n" + "\n\n".join(web_parts) + "\n\n"
            prompt += "Note: Web Search Results are from live internet search and may be more current than the KnowledgeBase.\n\n"

        # ── Vault search results ───────────────────────────────
        if vault_results:
            vault_parts = []
            for i, vr in enumerate(vault_results, 1):
                content = vr.get("content", "")[:500]
                vault_parts.append(
                    f"[VaultFile{i}]\n"
                    f"File: {vr.get('title', '')}\n"
                    f"Content: {content}"
                )
            prompt += "## Obsidian Vault References\n" + "\n\n".join(vault_parts) + "\n\n"
            prompt += "Note: These are from your personal knowledge vault.\n\n"

        # ── Conversation history ──────────────────────────────
        if include_history and self.conversation_history:
            # Auto-compress if over 80% budget
            mem_usage = sum(len(h.get("user","")) + len(h.get("assistant","")) for h in self.conversation_history)
            if mem_usage > int(self.MAX_HISTORY_TOKENS * 0.8):
                self._compress_history()

            history_lines = []
            char_budget = self.MAX_HISTORY_TOKENS
            for entry in reversed(self.conversation_history):
                turn_text = f"User: {entry['user']}\nAssistant: {entry['assistant']}\n"
                if char_budget - len(turn_text) < 0:
                    break
                history_lines.insert(0, turn_text)
                char_budget -= len(turn_text)
            if history_lines:
                prompt += "## Conversation History\n" + "".join(history_lines) + "\n"

        prompt += f"## Question\n{query}\n\n## Answer\n"
        return prompt

    def query(self, question: str, top_k: int = 5, source_filter: Union[str, List[str], None] = None, web_search: Optional[bool] = None, vault_search: Optional[bool] = None, vault_subdirs: Optional[List[str]] = None, skip_kb: bool = False) -> Dict:
        """
        Full RAG query: retrieve → (optional web search) → prompt → LLM.

        Args:
            question: The user's question.
            top_k: Number of KB results to retrieve.
            source_filter: Optional source filter.
            web_search: Override for web search. True=enabled, False=disabled, None=use config default.
            skip_kb: If True, skip KB retrieval (vault-only mode).

        Returns:
            {"answer": str, "sources": [...], "question": str,
             "web_sources": [...], "search_time_ms": int,
             "prompt_tokens": int, "completion_tokens": int,
             "total_prompt_tokens": int, "total_completion_tokens": int}
        """
        t_start = time.perf_counter()

        # ── KB retrieval (skip if vault-only mode) ─────────────
        if skip_kb:
            retrieved = []
            logger.info("KB retrieval skipped (vault-only mode)")
        else:
            retrieved = self.retrieve(question, top_k=top_k, source_filter=source_filter)
            logger.info(f"Retrieved: {len(retrieved)} documents")

        # ── Determine if web search should run ────────────────
        should_web_search = self.web_search_enabled if web_search is None else web_search
        # Auto-fallback: search when KB has no results (but NOT in vault-only mode)
        if not should_web_search and not retrieved and self.web_fallback and not skip_kb:
            should_web_search = True

        web_results: List[Dict] = []
        if should_web_search and not skip_kb:  # Explicitly disable web in vault-only mode
            self._init_web_search()
            if self.web_search:
                logger.info(f"Web search enabled, searching for: {question[:60]}")
                web_results = self.web_search.search(question)
                logger.info(f"Web search: {len(web_results)} results")

        # ── Determine if vault search should run ──────────────
        should_vault_search = self.vault_enabled if vault_search is None else vault_search
        vault_results: List[Dict] = []
        if should_vault_search and self.vault_path:
            logger.info(f"Vault search enabled, searching: {question[:60]}")
            vault_results = self._search_vault(question, subdirs=vault_subdirs)
            logger.info(f"Vault search: {len(vault_results)} files")

        # ── Build answer ──────────────────────────────────────
        if not retrieved and not web_results and not vault_results:
            answer = "No relevant information found in the KnowledgeBase or web."
            sources = []
            prompt_tokens = 0
            completion_tokens = 0
        else:
            prompt = self.build_prompt(question, retrieved, web_results=web_results if web_results else None, vault_results=vault_results if vault_results else None)

            try:
                response = self.llm_client.chat.completions.create(
                    model=self.llm_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                    max_tokens=2000,
                    frequency_penalty=0.3,
                    presence_penalty=0.2,
                )
                answer = response.choices[0].message.content

                # Token tracking
                usage = response.usage
                prompt_tokens = usage.prompt_tokens if usage else 0
                completion_tokens = usage.completion_tokens if usage else 0
                self.total_prompt_tokens += prompt_tokens
                self.total_completion_tokens += completion_tokens
            except Exception as e:
                logger.error(f"LLM error: {e}")
                err_msg = str(e)
                if "new_sensitive" in err_msg:
                    answer = "⚠️ API content moderation triggered: Your question was flagged as potentially sensitive by the LLM provider. Please rephrase your question."
                elif "422" in err_msg:
                    answer = "⚠️ API request rejected (422). This may be due to sensitive content detection or input format issues. Try rephrasing your question."
                else:
                    answer = f"LLM call failed: {err_msg}"
                prompt_tokens = 0
                completion_tokens = 0

            sources = [
                {"source": d["source"], "page": d["page"], "score": d["score"]}
                for d in retrieved
            ]

        t_elapsed_ms = int((time.perf_counter() - t_start) * 1000)

        result = {
            "answer": answer,
            "sources": sources,
            "question": question,
            "web_sources": [
                {"title": w["title"], "url": w["url"], "snippet": w["snippet"]}
                for w in web_results
            ] if web_results else [],
            "vault_sources": [
                {"title": v["title"], "content": v["content"][:200], "score": v["score"]}
                for v in vault_results
            ] if vault_results else [],
            "search_time_ms": t_elapsed_ms,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_prompt_tokens": self.total_prompt_tokens,
            "total_completion_tokens": self.total_completion_tokens,
        }

        # ── Store in conversation history (Answer section only, skip Thinking) ──
        answer_clean = answer
        for marker in ["## Thinking", "## Answer"]:
            if marker in answer_clean:
                # Take only content after the marker
                answer_clean = answer_clean.split(marker, 1)[-1].strip()
        # Also strip trailing ## References
        import re
        answer_clean = re.split(r"\n\s*##\s*References?\s*\n", answer_clean, maxsplit=1)[0].strip()
        answer_clean = re.split(r"\n\s*※\s*\d+\s*\n", answer_clean, maxsplit=1)[0].strip()

        self.conversation_history.append({
            "user": question,
            "assistant": answer_clean,
        })

        logger.info(f"Stored in history: {len(answer_clean)} chars (raw was {len(answer)} chars, saved {len(answer)-len(answer_clean)} chars)")

        return result

    def clear_history(self) -> None:
        """Reset conversation history."""
        self.conversation_history.clear()

    def suggest_questions(self, history: List[Dict], max_suggestions: int = 3) -> List[str]:
        """Use LLM to suggest follow-up questions based on conversation context.

        Args:
            history: Recent conversation history entries.
            max_suggestions: Number of suggestions to generate.

        Returns:
            List of suggested question strings.
        """
        if not history:
            return []

        # Build a compact context from recent exchanges
        context_lines = []
        for entry in history[-3:]:  # Last 3 exchanges
            context_lines.append(f"Q: {entry['user'][:200]}")
            context_lines.append(f"A: {entry['assistant'][:200]}")
        context = "\n".join(context_lines)

        # Detect language from conversation history (user questions + assistant answers)
        import re
        lang_hint = ""
        translate_hint = ""

        # Collect all text from history to detect dominant language
        # Prioritize user questions over assistant answers for language detection
        user_text = ""
        assistant_text = ""
        for entry in history[-5:]:  # Last 5 exchanges
            user_text += entry.get("user", "") + " "
            assistant_text += entry.get("assistant", "") + " "

        # Count language characters in user text (primary signal)
        def count_lang(text):
            ja = len(re.findall(r"[ぁ-ゞァ-ヾ]", text))
            zh = len(re.findall(r"[一-鿿]", text))
            en = len(re.findall(r"[a-zA-Z]", text))
            return ja, zh, en

        user_ja, user_zh, user_en = count_lang(user_text)
        asst_ja, asst_zh, asst_en = count_lang(assistant_text)

        # Use user language as primary, assistant as confirmation
        total_ja = user_ja * 2 + asst_ja  # User text weighted 2x
        total_zh = user_zh * 2 + asst_zh
        total_en = user_en * 2 + asst_en
        total = total_ja + total_zh + total_en

        if total > 0:
            ja_ratio = total_ja / total
            zh_ratio = total_zh / total

            # Determine dominant language (CJK takes priority if present)
            if zh_ratio > 0.2 or (zh_ratio > ja_ratio and zh_ratio > 0.1):
                lang_hint = "CRITICAL: Respond in Chinese only. "
                # No translation hint for Chinese - keep it clean
                translate_hint = ""
            elif ja_ratio > 0.2:
                lang_hint = "CRITICAL: Respond in Japanese only. "
                translate_hint = ""
            else:
                lang_hint = "CRITICAL: Respond in English only. "
                translate_hint = ""
        else:
            # No text found, use default
            if self.default_lang == "ja":
                lang_hint = "CRITICAL: Respond in Japanese only. "
            elif self.default_lang == "zh":
                lang_hint = "CRITICAL: Respond in Chinese only. "
            else:
                lang_hint = "CRITICAL: Respond in English only. "
            translate_hint = ""

        suggestion_prompt = (
            f"{lang_hint}"
            "Based on the following conversation, "
            f"suggest exactly {max_suggestions} short follow-up questions "
            "the user might want to ask next.\n\n"
            f"Conversation:\n{context}\n\n"
            f"{lang_hint}"
            f"{translate_hint}"
            "IMPORTANT: Output ONLY the questions. "
            "Do NOT include any explanations, formatting notes, "
            "meta-commentary, or English descriptions.\n"
            "All questions must be in the specified language only.\n"
            "Each question should be diverse and explore a different angle.\n"
            f"Return exactly {max_suggestions} questions, "
            "one per line, numbered 1-3.\n"
            "Keep each question under 80 characters."
        )

        try:
            response = self.llm_client.chat.completions.create(
                model=self.llm_model,
                messages=[{"role": "user", "content": suggestion_prompt}],
                temperature=0.9,
                max_tokens=300,
            )
            raw = response.choices[0].message.content
            suggestions = []
            for line in raw.strip().split("\n"):
                line = line.strip()
                # Strip numbering like "1. " or "1) "
                # Also skip any line that looks like meta-commentary
                if line.lower().startswith(("here ", "the ", "note", "out", "i ",
                                            "important", "critical", "all ",
                                            "do not", "respond", "based")):
                    continue
                if line and line[0].isdigit():
                    cleaned = line.split(". ", 1)[-1] if ". " in line else line
                    cleaned = cleaned.split(") ", 1)[-1] if ") " in cleaned else cleaned
                    suggestions.append(cleaned[:80])
            return suggestions[:max_suggestions]
        except Exception as e:
            logger.warning(f"Failed to generate suggestions: {e}")
            return []
