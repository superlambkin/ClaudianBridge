import { App, Modal } from 'obsidian';

export type StageStatus = 'pending' | 'running' | 'ok' | 'fail';

export interface ProgressModalOptions {
  title: string;
  onCopyLog?: () => void;
  onOpenResult?: () => void;
  onRetry?: () => void;
  onOpenSettings?: () => void;
  showSplit?: boolean;
  onConvertSplit?: () => void;
}

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
  private splitBtn: HTMLButtonElement | null = null;
  private closeBtn!: HTMLButtonElement;

  constructor(app: App, opts: ProgressModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.opts.title);
    contentEl.addClass('cb-modal');

    const progressWrap = contentEl.createDiv({ cls: 'cb-progress' });
    const track = progressWrap.createDiv({ cls: 'cb-progress-track' });
    this.progressFillEl = track.createDiv({ cls: 'cb-progress-fill' });
    this.progressLabelEl = progressWrap.createSpan({ cls: 'cb-progress-label', text: '0%' });

    const stages = ['Reading source', 'Invoking markitdown', 'Writing main .md', 'Splitting (optional)'];
    for (const s of stages) {
      const row = contentEl.createDiv({ cls: 'cb-stage' });
      const icon = row.createSpan({ cls: 'cb-stage-icon', text: '·' });
      row.createSpan({ text: s });
      this.stageEls.set(s, icon);
    }

    this.logEl = contentEl.createEl('textarea', { cls: 'cb-log', attr: { readonly: 'true' } });

    const buttonsEl = contentEl.createDiv({ cls: 'cb-buttons' });
    this.copyBtn = buttonsEl.createEl('button', { text: 'Copy log' });
    this.openBtn = buttonsEl.createEl('button', { text: 'Open result' });
    if (this.opts.showSplit) {
      this.splitBtn = buttonsEl.createEl('button', { text: 'Convert & Split' });
      this.splitBtn.addEventListener('click', () => this.opts.onConvertSplit?.());
    }
    this.retryBtn = buttonsEl.createEl('button', { text: 'Retry' });
    this.settingsBtn = buttonsEl.createEl('button', { text: 'Open settings' });
    this.closeBtn = buttonsEl.createEl('button', { text: 'Close', cls: 'cb-close-btn' });

    this.copyBtn.addEventListener('click', () => this.opts.onCopyLog?.());
    this.openBtn.addEventListener('click', () => this.opts.onOpenResult?.());
    this.retryBtn.addEventListener('click', () => this.opts.onRetry?.());
    this.settingsBtn.addEventListener('click', () => this.opts.onOpenSettings?.());
    this.closeBtn.addEventListener('click', () => this.close());

    this.setButtonsEnabled({ copy: false, open: false, retry: false, settings: true, split: false });
  }

  setStage(name: string, status: StageStatus) {
    const el = this.stageEls.get(name);
    if (!el) return;
    el.textContent = status === 'running' ? '▶' : status === 'ok' ? '✓' : status === 'fail' ? '✗' : '·';
    el.className = `cb-stage-icon cb-st-${status}`;
  }

  setProgress(pct: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    this.progressFillEl.style.width = `${clamped}%`;
    this.progressLabelEl.setText(`${clamped}%`);
    this.progressFillEl.toggleClass('cb-progress-done', clamped >= 100);
  }

  appendLog(line: string) {
    this.logEl.value += line + '\n';
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  setLogText(text: string) {
    this.logEl.value = text;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  getLogText(): string {
    return this.logEl.value;
  }

  setButtonsEnabled(opts: { copy: boolean; open: boolean; retry: boolean; settings: boolean; split?: boolean }) {
    this.copyBtn.disabled = !opts.copy;
    this.openBtn.disabled = !opts.open;
    this.retryBtn.disabled = !opts.retry;
    this.settingsBtn.disabled = !opts.settings;
    if (this.splitBtn && opts.split !== undefined) this.splitBtn.disabled = !opts.split;
  }

  onClose() {
    this.contentEl.empty();
  }
}
