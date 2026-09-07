// src/features/image-gen/modal.ts — ImageGenModal（v0.38.0 / F-038）
// src/features/office/progress-modal.ts と src/features/memory/save.ts のパターンを踏襲。

import { App, MarkdownView, Modal, Notice, Setting } from 'obsidian';
import * as path from 'path';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import type { ConfigStore } from '../../core/config-store';
import type { ImageGenAspectRatio, ImageGenProviderId, ImageGenStyle } from '../../core/settings';
import { IMAGE_GEN_STYLES } from '../../core/settings';
import { formatImageGenError } from './types';
import type { ImageGenProvider } from './types';
import { writeAsset } from './save';
import { applyStylePrompt, getStyleLabelKey } from './style-prompts';

export interface ImageGenModalOptions {
  app: App;
  store: ConfigStore;
  provider: ImageGenProvider;
}

/**
 * 文生図モーダル。
 * - プロンプト・provider・アスペクト比を編集
 * - Generate で provider.fetch → bytes
 * - Preview 表示 → Save / Insert ボタン
 */
export class ImageGenModal extends Modal {
  private readonly s: ReturnType<typeof getLocaleStrings>;
  private promptText = '';
  private providerId: ImageGenProviderId;
  private aspectRatio: ImageGenAspectRatio;
  private styleId: ImageGenStyle;
  private generatedBytes: Uint8Array | null = null;
  private generatedExt: 'png' | 'jpg' | 'jpeg' | null = null;
  private generatedRelPath: string | null = null;
  private previewUrl: string | null = null;
  private logEl: HTMLElement | null = null;
  private previewImgEl: HTMLImageElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private insertBtn: HTMLButtonElement | null = null;
  private busy = false;

  constructor(private readonly opts: ImageGenModalOptions) {
    super(opts.app);
    this.s = getLocaleStrings(getUILanguage());
    const cfg = opts.store.load();
    this.providerId = cfg.imageGen.provider;
    this.aspectRatio = cfg.imageGen.aspectRatio;
    this.styleId = cfg.imageGen.style;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('cb-image-gen-modal');
    contentEl.createEl('h2', { text: this.s.imageGenModalTitle });

    // Provider dropdown
    new Setting(contentEl)
      .setName(this.s.imageGenProvider)
      .addDropdown((d) => {
        d.addOption('minimax', this.s.imageGenProviderMinimax);
        d.addOption('zhipu', this.s.imageGenProviderZhipu);
        d.setValue(this.providerId).onChange((v) => {
          this.providerId = v as ImageGenProviderId;
        });
      });

    // Aspect dropdown
    new Setting(contentEl)
      .setName(this.s.imageGenAspectRatio)
      .addDropdown((d) => {
        d.addOption('1:1', this.s.imageGenAspectRatio_1_1);
        d.addOption('16:9', this.s.imageGenAspectRatio_16_9);
        d.addOption('9:16', this.s.imageGenAspectRatio_9_16);
        d.addOption('4:3', this.s.imageGenAspectRatio_4_3);
        d.setValue(this.aspectRatio).onChange((v) => {
          this.aspectRatio = v as ImageGenAspectRatio;
        });
      });

    // Style dropdown（scientific-illustrator スキル相当を含む 4 種）
    new Setting(contentEl)
      .setName(this.s.imageGenStyle)
      .addDropdown((d) => {
        for (const s of IMAGE_GEN_STYLES) {
          d.addOption(s, this.s[getStyleLabelKey(s) as keyof typeof this.s] as string);
        }
        d.setValue(this.styleId).onChange((v) => {
          this.styleId = v as ImageGenStyle;
        });
      });

    // Prompt textarea
    const promptWrap = contentEl.createDiv('cb-image-gen-prompt');
    promptWrap.createEl('label', { text: 'Prompt' });
    const textarea = promptWrap.createEl('textarea');
    textarea.rows = 4;
    textarea.style.width = '100%';
    textarea.value = this.promptText;
    textarea.addEventListener('input', () => {
      this.promptText = textarea.value;
    });

    // Generate / Cancel
    const actionRow = contentEl.createDiv('cb-image-gen-actions');
    const generateBtn = actionRow.createEl('button', { text: this.s.imageGenModalGenerate, cls: 'mod-cta' });
    const cancelBtn = actionRow.createEl('button', { text: this.s.imageGenModalCancel });
    generateBtn.addEventListener('click', () => void this.handleGenerate());
    cancelBtn.addEventListener('click', () => this.close());

    // Preview
    const previewWrap = contentEl.createDiv('cb-image-gen-preview');
    previewWrap.createEl('h4', { text: 'Preview' });
    const previewImg = previewWrap.createEl('img');
    previewImg.alt = '';
    previewImg.style.maxWidth = '100%';
    previewImg.style.maxHeight = '320px';
    previewImg.style.display = 'block';
    const emptyMsg = previewWrap.createDiv('cb-image-gen-preview-empty');
    emptyMsg.setText(this.s.imageGenModalPreviewEmpty);
    this.previewImgEl = previewImg;
    this.previewImgEl.style.display = 'none';

    // Save / Insert buttons (initially disabled)
    const saveRow = contentEl.createDiv('cb-image-gen-result-actions');
    this.saveBtn = saveRow.createEl('button', { text: this.s.imageGenModalSaveOnly });
    this.insertBtn = saveRow.createEl('button', { text: this.s.imageGenModalInsert });
    this.saveBtn.disabled = true;
    this.insertBtn.disabled = true;
    this.saveBtn.addEventListener('click', () => void this.handleSave());
    this.insertBtn.addEventListener('click', () => void this.handleInsert());

    // Log area
    this.logEl = contentEl.createDiv('cb-image-gen-log');
    this.logEl.createEl('h4', { text: 'Log' });
    this.logEl.createEl('pre', { text: '...' });
  }

  onClose(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
    const { contentEl } = this;
    contentEl.empty();
  }

  private appendLog(text: string): void {
    if (!this.logEl) return;
    const pre = this.logEl.querySelector('pre');
    if (pre) {
      pre.textContent += `\n${text}`;
    }
  }

  private setBusy(b: boolean): void {
    this.busy = b;
    // The Generate button is recreated only on reopen; mutate via DOM lookup.
    const btns = this.contentEl.querySelectorAll<HTMLButtonElement>('.cb-image-gen-actions button');
    btns.forEach((btn) => { btn.disabled = b; });
  }

  private showPreview(bytes: Uint8Array, ext: 'png' | 'jpg' | 'jpeg'): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    // Wrap bytes in ArrayBuffer slice to satisfy BlobPart type
    const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([view], { type: mime });
    this.previewUrl = URL.createObjectURL(blob);
    if (this.previewImgEl) {
      this.previewImgEl.src = this.previewUrl;
      this.previewImgEl.style.display = 'block';
    }
    const empty = this.contentEl.querySelector('.cb-image-gen-preview-empty');
    if (empty) (empty as HTMLElement).style.display = 'none';
    this.generatedBytes = bytes;
    this.generatedExt = ext;
    if (this.saveBtn) this.saveBtn.disabled = false;
    if (this.insertBtn) this.insertBtn.disabled = false;
  }

  private async handleGenerate(): Promise<void> {
    if (this.busy) return;
    const prompt = this.promptText.trim();
    if (!prompt) {
      new Notice('⚠️ Prompt is empty');
      return;
    }
    this.setBusy(true);
    this.appendLog(this.s.imageGenStageSending.replace('{provider}', this.opts.provider.label));

    // Build provider based on selected id (provider from opts may differ if user changed dropdown)
    const cfg = this.opts.store.load();
    const provider = this.opts.provider.id === this.providerId
      ? this.opts.provider
      : (await import('./registry')).getImageGenProvider(
        this.providerId,
        (id) => (id === 'minimax' ? cfg.quota.minimaxApiKey : cfg.quota.zhipuApiKey),
      );

    const outcome = await provider.fetch({ prompt: applyStylePrompt(this.styleId, prompt), aspectRatio: this.aspectRatio });
    if (!outcome.ok) {
      const formatted = formatImageGenError(outcome.error);
      this.appendLog(`[ERROR] ${formatted}`);
      if (outcome.error.kind === 'no_key') {
        new Notice(this.s.imageGenNoticeNoKey.replace('{provider}', provider.label));
      } else if (outcome.error.kind === 'expired') {
        new Notice(this.s.imageGenNoticeExpired.replace('{provider}', provider.label));
      } else {
        new Notice(this.s.imageGenNoticeError.replace('{msg}', formatted));
      }
      this.setBusy(false);
      return;
    }

    this.appendLog('[OK] received bytes');
    this.showPreview(outcome.result.bytes, outcome.result.ext as 'png' | 'jpg' | 'jpeg');
    this.setBusy(false);
  }

  private async handleSave(): Promise<void> {
    if (!this.generatedBytes || !this.generatedExt) return;
    this.setBusy(true);
    this.appendLog(this.s.imageGenStageSaving);
    try {
      const vaultRoot = this.getVaultRoot();
      const res = await writeAsset(vaultRoot, this.generatedBytes, this.generatedExt);
      this.generatedRelPath = res.vaultRelativePath;
      this.appendLog(`[OK] ${res.absolutePath}`);
      new Notice(this.s.imageGenNoticeSaved);
    } catch (e) {
      const msg = (e as Error).message;
      this.appendLog(`[ERROR] ${msg}`);
      new Notice(this.s.imageGenNoticeError.replace('{msg}', msg));
    } finally {
      this.setBusy(false);
    }
  }

  private async handleInsert(): Promise<void> {
    if (!this.generatedBytes || !this.generatedExt) return;
    this.setBusy(true);
    try {
      // Save first if not yet saved
      if (!this.generatedRelPath) {
        this.appendLog(this.s.imageGenStageSaving);
        const vaultRoot = this.getVaultRoot();
        const res = await writeAsset(vaultRoot, this.generatedBytes, this.generatedExt);
        this.generatedRelPath = res.vaultRelativePath;
        this.appendLog(`[OK] ${res.absolutePath}`);
      }

      this.appendLog(this.s.imageGenStageInserting);
      const filename = path.posix.basename(this.generatedRelPath);
      const inserted = await this.insertIntoActiveNote(filename);
      this.appendLog(`[OK] inserted into ${inserted}`);
      new Notice(this.s.imageGenNoticeSaved);
    } catch (e) {
      const msg = (e as Error).message;
      this.appendLog(`[ERROR] ${msg}`);
      new Notice(this.s.imageGenNoticeError.replace('{msg}', msg));
    } finally {
      this.setBusy(false);
    }
  }

  private async insertIntoActiveNote(filename: string): Promise<string> {
    const view = this.opts.app.workspace.getActiveViewOfType(MarkdownView);
    if (view && view.editor) {
      view.editor.replaceSelection(`![[${filename}]]`);
      return 'active note';
    }
    // No active markdown view: create Untitled.md with the embed
    const file = await this.opts.app.vault.create('Untitled.md', `![[${filename}]]\n`);
    const leaf = this.opts.app.workspace.getLeaf();
    if (leaf) await leaf.openFile(file);
    return 'new file';
  }

  private getVaultRoot(): string {
    const adapter = this.opts.app.vault.adapter as { getBasePath?: () => string };
    if (typeof adapter.getBasePath === 'function') return adapter.getBasePath();
    return process.cwd();
  }
}
