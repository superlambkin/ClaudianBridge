// src/features/chroma/views/RecordCardView.ts — AI-search style result card.
//
// Each record renders as a "search result card" with:
//   - 📌 ID chip + 🎯 distance score badge (when present)
//   - 🏷️ Metadata badges (key: value pills)
//   - 📄 Document snippet with expand
//   - 📋 Copy ID button

import { Notice, setIcon } from "obsidian";
import type { ChromaRecord } from "../types";

export class RecordCardView {
  private container: HTMLElement;
  private previewLength: number;
  private resultCount = 0;
  private resultMeta = "";

  constructor(container: HTMLElement, previewLength: number) {
    this.container = container;
    this.container.addClass("ci-records");
    this.previewLength = previewLength;
  }

  setPreviewLength(n: number): void {
    this.previewLength = n;
  }

  setHeader(count: number, meta = ""): void {
    this.resultCount = count;
    this.resultMeta = meta;
  }

  render(records: ChromaRecord[], emptyHint = "(該当するレコードがありません)"): void {
    this.container.empty();
    if (!records || records.length === 0) {
      // ─── Header (count) ───
      this.renderHeader(0);
      this.container.createDiv({
        text: emptyHint,
        cls: "ci-records-empty",
      });
      return;
    }
    this.renderHeader(records.length);
    for (const r of records) {
      this.container.appendChild(this.buildCard(r));
    }
  }

  private renderHeader(count: number): void {
    const head = this.container.createDiv({ cls: "ci-results-header" });
    const countEl = head.createDiv({ cls: "ci-results-count" });
    countEl.textContent = `📊 結果: ${count.toLocaleString()} 件`;
    if (this.resultMeta) {
      head.createDiv({ text: this.resultMeta, cls: "ci-results-meta" });
    }
  }

  private buildCard(r: ChromaRecord): HTMLElement {
    const card = this.container.createDiv({ cls: "ci-record-card" });

    // ─── Head: ID + score + actions ───
    const head = card.createDiv({ cls: "ci-record-head" });
    head.createEl("span", { text: `📌 ${r.id}`, cls: "ci-record-id" });

    if (r.distance !== null) {
      head.createEl("span", {
        text: `🎯 関連度 ${r.distance.toFixed(3)}`,
        cls: "ci-record-distance",
      });
    }

    const copyBtn = head.createEl("button", {
      text: "📋 Copy",
      cls: "ci-icon-btn",
      attr: { "aria-label": "Copy ID", title: "IDをコピー" },
    });
    void copyBtn;
    setIcon(copyBtn, "copy");
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(r.id);
      new Notice("✅ IDをコピーしました");
    });

    // ─── Metadata badges (key: value pills) ───
    if (r.metadata && Object.keys(r.metadata).length > 0) {
      const metaEl = card.createDiv({ cls: "ci-record-meta" });
      for (const [k, v] of Object.entries(r.metadata)) {
        const badge = metaEl.createEl("span", { cls: "ci-record-meta-badge" });
        badge.createEl("strong", { text: `${k}:` });
        badge.appendText(String(v));
      }
    }

    // ─── Document (preview + expand) ───
    if (r.document) {
      const docWrap = card.createDiv({ cls: "ci-record-doc" });
      const previewLen = Math.max(20, this.previewLength);
      const isLong = r.document.length > previewLen;
      const text = isLong
        ? r.document.slice(0, previewLen) + "…"
        : r.document;
      const pre = docWrap.createEl("pre", { cls: "ci-record-doc-pre" });
      pre.textContent = text;
      if (isLong) {
        const expand = docWrap.createEl("button", {
          text: "▼ 全文を表示",
          cls: "ci-record-expand",
        });
        expand.addEventListener("click", () => {
          pre.textContent = r.document ?? "";
          expand.remove();
        });
      }
    }

    return card;
  }
}
