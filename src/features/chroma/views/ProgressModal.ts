// src/features/chroma/views/ProgressModal.ts — Progress modal for long Chroma operations.
//
// Reuses the vob- (vault-office-bridge) Modal pattern but with `ci-` prefix.

import { Modal } from "obsidian";

export type StageStatus = "pending" | "running" | "ok" | "fail";

export interface ProgressModalOptions {
  title: string;
  onCopyLog?: () => void;
  onOpenResult?: () => void;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

const DEFAULT_STAGES = [
  "Resolving path",
  "Scanning collections",
  "Running query",
  "Rendering",
];

export class ProgressModal extends Modal {
  private opts: ProgressModalOptions;
  private stageEls = new Map<string, HTMLElement>();
  private progressFillEl!: HTMLElement;
  private progressLabelEl!: HTMLElement;
  private logEl!: HTMLTextAreaElement;
  private copyBtn!: HTMLButtonElement;
  private openBtn!: HTMLButtonElement;
  private retryBtn!: HTMLButtonElement;
  private settingsBtn!: HTMLButtonElement;
  private closeBtn!: HTMLButtonElement;

  constructor(app: never, opts: ProgressModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.opts.title);
    contentEl.addClass("ci-modal");

    const progressWrap = contentEl.createDiv({ cls: "ci-progress" });
    const track = progressWrap.createDiv({ cls: "ci-progress-track" });
    this.progressFillEl = track.createDiv({ cls: "ci-progress-fill" });
    this.progressLabelEl = progressWrap.createSpan({
      cls: "ci-progress-label",
      text: "0%",
    });

    for (const s of DEFAULT_STAGES) {
      const row = contentEl.createDiv({ cls: "ci-stage" });
      const icon = row.createSpan({ cls: "ci-stage-icon", text: "·" });
      row.createSpan({ text: s });
      this.stageEls.set(s, icon);
    }

    this.logEl = contentEl.createEl("textarea", {
      cls: "ci-log",
      attr: { readonly: "true" },
    });

    const buttonsEl = contentEl.createDiv({ cls: "ci-buttons" });
    this.copyBtn = buttonsEl.createEl("button", { text: "Copy log" });
    this.openBtn = buttonsEl.createEl("button", { text: "Open result" });
    this.retryBtn = buttonsEl.createEl("button", { text: "Retry" });
    this.settingsBtn = buttonsEl.createEl("button", { text: "Open settings" });
    this.closeBtn = buttonsEl.createEl("button", {
      text: "Close",
      cls: "ci-close-btn",
    });

    this.copyBtn.addEventListener("click", () => this.opts.onCopyLog?.());
    this.openBtn.addEventListener("click", () => this.opts.onOpenResult?.());
    this.retryBtn.addEventListener("click", () => this.opts.onRetry?.());
    this.settingsBtn.addEventListener("click", () => this.opts.onOpenSettings?.());
    this.closeBtn.addEventListener("click", () => this.close());

    this.setButtonsEnabled({
      copy: false,
      open: false,
      retry: false,
      settings: true,
    });
  }

  setStage(name: string, status: StageStatus): void {
    const el = this.stageEls.get(name);
    if (!el) return;
    el.textContent =
      status === "running"
        ? "▶"
        : status === "ok"
          ? "✓"
          : status === "fail"
            ? "✗"
            : "·";
    el.className = `ci-stage-icon ci-st-${status}`;
  }

  setProgress(pct: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    this.progressFillEl.style.width = `${clamped}%`;
    this.progressLabelEl.setText(`${clamped}%`);
    this.progressFillEl.toggleClass("ci-progress-done", clamped >= 100);
  }

  appendLog(line: string): void {
    this.logEl.value += line + "\n";
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  setLogText(text: string): void {
    this.logEl.value = text;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  getLogText(): string {
    return this.logEl.value;
  }

  setButtonsEnabled(opts: {
    copy: boolean;
    open: boolean;
    retry: boolean;
    settings: boolean;
  }): void {
    this.copyBtn.disabled = !opts.copy;
    this.openBtn.disabled = !opts.open;
    this.retryBtn.disabled = !opts.retry;
    this.settingsBtn.disabled = !opts.settings;
  }

  onClose() {
    this.contentEl.empty();
  }
}
