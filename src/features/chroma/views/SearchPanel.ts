// src/features/chroma/views/SearchPanel.ts — AI-search style friendly search panel.
//
// UI design:
//   - Big hero input (single place for natural-language query)
//   - "Filter more" section for advanced filters (collapsed by default)
//   - Quick chips for common filters (page, document contains, etc.)
//   - Friendly Japanese placeholders (no "metadata.page =")

import { setIcon } from "obsidian";
import type { FilterSpec } from "../types";

export interface SearchPanelHandlers {
  onRun(filter: FilterSpec): void;
  onOpenRawSql?(): void;
  showAdvanced: boolean;
}

export class SearchPanel {
  private container: HTMLElement;
  private handlers: SearchPanelHandlers;
  // Hero
  private heroInputEl!: HTMLInputElement;
  // Detail filters
  private sourceEl!: HTMLInputElement;
  private pageEl!: HTMLInputElement;
  private pageInEl!: HTMLInputElement;
  private containsEl!: HTMLInputElement;
  private nResultsEl!: HTMLInputElement;
  private advancedSection!: HTMLElement;
  private advancedToggleBtn!: HTMLButtonElement;

  constructor(container: HTMLElement, handlers: SearchPanelHandlers) {
    this.container = container;
    this.handlers = handlers;
    this.container.addClass("ci-search");
    this.render();
  }

  private render(): void {
    this.container.empty();

    // ─── Hero: natural-language query input ───
    const hero = this.container.createDiv({ cls: "ci-hero-search" });
    const row = hero.createDiv({ cls: "ci-hero-search-row" });
    this.heroInputEl = row.createEl("input", {
      type: "text",
      cls: "ci-hero-input",
      attr: { spellcheck: "true" },
    });
    this.heroInputEl.placeholder = "🔍 質問を入力（例: HDMIは何台接続できる？）";

    const runBtn = row.createEl("button", { text: "検索", cls: "ci-hero-run" });
    setIcon(runBtn, "search");
    runBtn.addEventListener("click", () => this.run());

    const hint = hero.createDiv({ cls: "ci-hero-hint" });
    hint.createEl("span", {
      text:
        "💡 埋め込みモデル設定時は意味検索。設定していない場合は文書内検索として動作します。",
    });

    // ─── Advanced toggle ───
    this.advancedToggleBtn = this.container.createEl("button", {
      text: "⚙ 絞り込み条件を追加",
      cls: "ci-advanced-toggle",
    });
    this.advancedToggleBtn.addEventListener("click", () => {
      const hidden = this.advancedSection.hasAttribute("hidden");
      if (hidden) {
        this.advancedSection.removeAttribute("hidden");
        this.advancedToggleBtn.setText("▲ 絞り込み条件を閉じる");
      } else {
        this.advancedSection.setAttribute("hidden", "");
        this.advancedToggleBtn.setText("⚙ 絞り込み条件を追加");
      }
    });

    this.advancedSection = this.container.createDiv({
      cls: "ci-advanced-section",
      attr: { hidden: "" },
    });

    // ─── Detail filter rows ───
    const addRow = (
      label: string,
      placeholder: string,
      type: "text" | "number" = "text"
    ): HTMLInputElement => {
      const row = this.advancedSection.createDiv({ cls: "ci-search-row" });
      row.createEl("label", { text: label });
      const input = row.createEl("input", {
        type,
        cls: type === "number" ? "ci-num-input" : "ci-text-input",
      });
      input.placeholder = placeholder;
      return input;
    };

    this.sourceEl = addRow(
      "📄 ファイル名",
      "例: Marantz_SR6015F.pdf"
    );
    this.pageEl = addRow(
      "📖 ページ番号",
      "例: 12",
      "number"
    );
    this.pageInEl = addRow(
      "📖 ページ（複数）",
      "例: 1, 3, 5（カンマ区切り）"
    );
    this.containsEl = addRow(
      "🔤 本文に含む文字",
      "例: HDMI"
    );
    this.nResultsEl = addRow(
      "🔢 表示件数",
      "例: 10（既定 5）",
      "number"
    );

    // ─── Buttons ───
    const btnRow = this.container.createDiv({ cls: "ci-search-buttons" });
    if (this.handlers.showAdvanced && this.handlers.onOpenRawSql) {
      const sqlBtn = btnRow.createEl("button", {
        text: "⚠ Advanced: Raw SQL…",
        cls: "ci-warning",
      });
      sqlBtn.addEventListener("click", () => this.handlers.onOpenRawSql?.());
    }
  }

  /** Read current input values into a FilterSpec. */
  buildFilter(defaultN: number): FilterSpec {
    const sourceVal = this.sourceEl.value.trim();
    const pageVal = this.pageEl.value.trim();
    const pageInCsv = this.pageInEl.value.trim();
    const pageInVals = pageInCsv
      ? pageInCsv.split(",").map((s) => Number(s.trim())).filter(Number.isFinite)
      : [];

    const metadataEqual: Record<string, string | number | boolean> = {};
    if (sourceVal) metadataEqual.source = sourceVal;
    const pageNum = Number(pageVal);
    if (pageVal && Number.isFinite(pageNum)) metadataEqual.page = pageNum;

    const metadataIn: Record<string, Array<string | number>> = {};
    if (pageInVals.length > 0) metadataIn.page = pageInVals;

    return {
      metadataEqual,
      metadataIn,
      documentContains: this.containsEl.value.trim(),
      queryText: this.heroInputEl.value.trim(),
      nResults: Number(this.nResultsEl.value) || defaultN,
    };
  }

  hasQuery(): boolean {
    return this.heroInputEl.value.trim().length > 0;
  }

  private run(): void {
    const nResults = Number(this.nResultsEl.value) || 5;
    const filter = this.buildFilter(nResults);
    this.handlers.onRun(filter);
  }
}
