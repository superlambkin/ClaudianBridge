import { App, Modal, Notice, Setting } from 'obsidian';
import type { FolderBridge } from '../features/folder-bridge/types';
import {
  validateExternalPath,
  validateExcludePatterns,
  validateShadowPath,
  computeDefaultShadowPath,
} from '../features/folder-bridge/validation';
import { getLocaleStrings, getUILanguage } from '../core/i18n';

export interface FolderBridgeFormValue {
  linkName: string;
  vaultSubpath: string;
  externalPath: string;
  excludePatterns: string[];
  enabled: boolean;
  /** Present in edit mode so caller can preserve id/timestamps. */
  id?: string;
}

export class FolderBridgeModal extends Modal {
  private linkName = '';
  private vaultSubpath = '10_Input';
  private externalPath = '';
  private excludePatternsRaw = '';
  private errorEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly opts: {
      editing?: FolderBridge;
      onSave: (b: FolderBridgeFormValue) => void | Promise<void>;
    },
  ) {
    super(app);
    if (opts.editing) {
      this.linkName = opts.editing.linkName;
      this.vaultSubpath = opts.editing.vaultSubpath ?? this.vaultSubpath;
      this.externalPath = opts.editing.externalPath;
      this.excludePatternsRaw = (opts.editing.excludePatterns ?? []).join(', ');
    }
  }

  onOpen(): void {
    const s = getLocaleStrings(getUILanguage());
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', {
      text: this.opts.editing ? `✎ ${this.linkName}` : s.folderBridgeAdd,
    });

    new Setting(contentEl)
      .setName('リンク名')
      .addText((t) => t
        .setValue(this.linkName)
        .onChange((v) => { this.linkName = v; this.refreshError(); }));

    new Setting(contentEl)
      .setName(s.folderBridgeSyncDirection)
      .setDesc(s.folderBridgeSyncDirectionDesc)
      .addText((t) => {
        t.setValue('NAS → Shadow');
        t.setDisabled(true);
      });

    new Setting(contentEl)
      .setName('外部パス（UNC または絶対パス）')
      .addText((t) => t
        .setValue(this.externalPath)
        .onChange((v) => { this.externalPath = v; this.refreshError(); }));

    new Setting(contentEl)
      .setName(s.folderBridgeExcludePatterns)
      .setDesc('カンマ区切り glob')
      .addText((t) => t
        .setValue(this.excludePatternsRaw)
        .onChange((v) => { this.excludePatternsRaw = v; this.refreshError(); }));

    this.errorEl = contentEl.createEl('p', {
      attr: { style: 'color: var(--text-error); min-height: 1.2em;' },
    });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('キャンセル').onClick(() => this.close()))
      .addButton((b) => b.setButtonText('💾 保存').setCta().onClick(() => this.save()));
  }

  private refreshError(): void {
    if (!this.errorEl) return;
    this.errorEl.textContent = '';
  }

  private async save(): Promise<void> {
    const linkName = this.linkName.trim();
    if (!linkName) {
      new Notice('ブリッジ名は必須です');
      return;
    }

    const ep = validateExternalPath(this.externalPath);
    if (!ep.ok) {
      new Notice(`外部パス: ${ep.reason}`);
      return;
    }

    const xp = validateExcludePatterns(
      this.excludePatternsRaw.split(',').map((x) => x.trim()).filter(Boolean),
    );
    if (!xp.ok) {
      new Notice(`除外パターン: ${xp.reason}`);
      return;
    }

    // Sanity-check default shadow path against vault (informational only —
    // Manager re-computes via computeDefaultShadowPath when constructing).
    const vaultBase = (this.app.vault.adapter as unknown as { getBasePath?: () => string })
      .getBasePath?.() ?? '';
    const id = this.opts.editing?.id;
    const shadow = computeDefaultShadowPath(vaultBase, id ?? '__pending__');
    const sp = validateShadowPath(shadow, vaultBase);
    if (!sp.ok) {
      new Notice(`シャドウパス: ${sp.reason}`);
      return;
    }

    await this.opts.onSave({
      id,
      linkName,
      vaultSubpath: this.vaultSubpath.trim() || '10_Input',
      externalPath: ep.normalized,
      excludePatterns: xp.normalized,
      enabled: this.opts.editing?.enabled ?? false,
    });
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}