// src/features/chroma/views/RawSqlModal.ts — Advanced read-only SQL modal.

import { Modal, Notice, setIcon } from "obsidian";
import type { ChromaSettings, SqlResult } from "../types";
import { runSql, isReadOnlySelect, MAX_ROWS } from "../chroma/RawSqlService";

export interface RawSqlModalOptions {
  settings: ChromaSettings;
  vaultRoot: string;
}

export class RawSqlModal extends Modal {
  private opts: RawSqlModalOptions;
  private sqlEl!: HTMLTextAreaElement;
  private resultEl!: HTMLElement;
  private runBtn!: HTMLButtonElement;
  private closeBtn!: HTMLButtonElement;

  constructor(app: never, opts: RawSqlModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText("Raw SQL (Advanced · Read-only)");
    contentEl.addClass("ci-modal", "ci-sql-modal");

    const warn = contentEl.createDiv({ cls: "ci-callout ci-callout-warn" });
    warn.createEl("strong", { text: "⚠ Read-only" });
    warn.appendText(
      " Only SELECT (or WITH ... SELECT) is allowed. The underlying SQLite file is opened in read-only mode. USE WITH CARE."
    );

    contentEl.createEl("label", { text: "SQL", cls: "ci-label" });
    this.sqlEl = contentEl.createEl("textarea", {
      cls: "ci-sql-textarea",
      attr: { rows: "8", spellcheck: "false" },
    });
    this.sqlEl.placeholder = "SELECT name FROM collections LIMIT 50";

    const btnRow = contentEl.createDiv({ cls: "ci-sql-buttons" });
    this.runBtn = btnRow.createEl("button", { text: "Run", cls: "ci-primary" });
    setIcon(this.runBtn, "play");
    this.runBtn.addEventListener("click", () => this.run());

    this.closeBtn = btnRow.createEl("button", {
      text: "Close",
      cls: "ci-close-btn",
    });
    this.closeBtn.addEventListener("click", () => this.close());

    this.resultEl = contentEl.createDiv({ cls: "ci-sql-result" });
    this.resultEl.createDiv({
      text: "(results will appear here)",
      cls: "ci-sql-empty",
    });
  }

  private async run(): Promise<void> {
    const sql = this.sqlEl.value;
    const guard = isReadOnlySelect(sql);
    if (!guard.ok) {
      new Notice(`[chroma-inspector] ${guard.reason}`);
      return;
    }
    this.runBtn.disabled = true;
    this.resultEl.empty();
    this.resultEl.createDiv({
      text: "running…",
      cls: "ci-sql-status ci-status-info",
    });
    try {
      const result: SqlResult = await runSql({
        settings: this.opts.settings,
        vaultRoot: this.opts.vaultRoot,
        sql,
      });
      this.renderResult(result);
    } catch (e) {
      this.resultEl.empty();
      const err = this.resultEl.createDiv({
        text: (e as Error).message,
        cls: "ci-sql-status ci-status-fail",
      });
      this.resultEl.createDiv({ text: "(error)", cls: "ci-sql-empty" });
      void err;
    } finally {
      this.runBtn.disabled = false;
    }
  }

  private renderResult(r: SqlResult): void {
    this.resultEl.empty();
    const head = this.resultEl.createDiv({ cls: "ci-sql-summary" });
    const truncated = r.truncated;
    head.createEl("span", {
      text: `${r.rows.length} row(s)${truncated ? ` (truncated to ${MAX_ROWS})` : ""}`,
      cls: truncated ? "ci-status-warn" : "ci-status-ok",
    });
    if (r.columns.length === 0) {
      this.resultEl.createDiv({
        text: "(no columns)",
        cls: "ci-sql-empty",
      });
      return;
    }
    const table = this.resultEl.createEl("table", { cls: "ci-sql-table" });
    const thead = table.createEl("thead");
    const headRow = thead.createEl("tr");
    for (const c of r.columns) {
      headRow.createEl("th", { text: c });
    }
    const tbody = table.createEl("tbody");
    for (const row of r.rows) {
      const tr = tbody.createEl("tr");
      for (const c of r.columns) {
        const cell = row[c];
        tr.createEl("td", {
          text: cell === null || cell === undefined ? "∅" : String(cell),
        });
      }
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
