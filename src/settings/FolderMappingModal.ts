import { App, Modal, Notice, Setting } from 'obsidian';
import type { FolderMapping } from '../features/folder-mapping/types';
import { FolderMappingManager } from '../features/folder-mapping/manager';
import { validateLinkName, validateExternalPath, validateVaultSubpath } from '../features/folder-mapping/validation';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import type { ConfigStore } from '../core/config-store';

export class FolderMappingModal extends Modal {
  private readonly existing: FolderMapping[];
  private readonly editingId?: string;
  private linkName = '';
  private externalPath = '';
  private vaultSubpath = '10_Input';
  private errorEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly store: ConfigStore,
    private readonly onSaved: () => void,
    opts?: { existing?: FolderMapping[]; editing?: FolderMapping },
  ) {
    super(app);
    // Add mode: existing は省略可能 → store から取得 / Edit mode: caller が渡す
    const cfg = store.load();
    this.existing = opts?.existing ?? cfg.general.folderMappings ?? [];
    if (opts?.editing) {
      this.editingId = opts.editing.id;
      this.linkName = opts.editing.linkName;
      this.externalPath = opts.editing.externalPath;
      this.vaultSubpath = opts.editing.vaultSubpath ?? this.vaultSubpath;
    }
  }

  onOpen(): void {
    const s = getLocaleStrings(getUILanguage());
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.editingId ? `✎ ${this.linkName}` : s.folderMappingAdd });

    new Setting(contentEl)
      .setName(s.folderMappingLinkName)
      .addText((t) => t.setValue(this.linkName).onChange((v) => { this.linkName = v; this.refreshError(); }));

    new Setting(contentEl)
      .setName(s.folderMappingVaultSubpath)
      .setDesc(s.folderMappingVaultSubpathDesc)
      .addText((t) => t.setValue(this.vaultSubpath).onChange((v) => { this.vaultSubpath = v; this.refreshError(); }));

    new Setting(contentEl)
      .setName(s.folderMappingExternalPath)
      .addText((t) => t.setValue(this.externalPath).onChange((v) => { this.externalPath = v; this.refreshError(); }))
      .addButton((b) => b.setButtonText(s.folderMappingBrowse).onClick(async () => {
        // Electron openDialog — minimal impl: defer to a folder picker
        // For simplicity, prompt() in this iteration; can be replaced with native picker later.
        const picked = window.prompt(s.folderMappingExternalPath, this.externalPath);
        if (picked) { this.externalPath = picked; this.refreshError(); }
      }));

    this.errorEl = contentEl.createEl('p', { attr: { style: 'color: var(--text-error); min-height: 1.2em;' } });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText(this.editingId ? '💾 保存' : '💾 追加').setCta().onClick(() => this.save()))
      .addButton((b) => b.setButtonText('キャンセル').onClick(() => this.close()));
  }

  private refreshError(): void {
    if (!this.errorEl) return;
    const r1 = validateLinkName(this.linkName, this.existing.filter((m) => m.id !== this.editingId));
    if (!r1.ok) { this.errorEl.textContent = `リンク名: ${r1.reason}`; return; }
    const r3 = validateVaultSubpath(this.vaultSubpath);
    if (!r3.ok) { this.errorEl.textContent = `マッピング先: ${r3.reason}`; return; }
    const vaultBase = (this.app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.() ?? '';
    const r2 = validateExternalPath(this.externalPath, vaultBase);
    if (!r2.ok) { this.errorEl.textContent = `外部パス: ${r2.reason}`; return; }
    this.errorEl.textContent = '';
  }

  private save(): void {
    const r1 = validateLinkName(this.linkName, this.existing.filter((m) => m.id !== this.editingId));
    if (!r1.ok) { new Notice(`リンク名エラー: ${r1.reason}`); return; }
    const sub = validateVaultSubpath(this.vaultSubpath);
    if (!sub.ok) { new Notice(`マッピング先エラー: ${sub.reason}`); return; }
    const vaultBase = (this.app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.() ?? '';
    const r2 = validateExternalPath(this.externalPath, vaultBase);
    if (!r2.ok) { new Notice(`外部パスエラー: ${r2.reason}`); return; }

    // 仕様 §7.3 ロールバック: 先に FS 反映を試行し、成功時のみ data.json に保存
    const fs = require('fs') as import('../features/folder-mapping/types').FolderMappingFs;
    const fm = new FolderMappingManager({
      vaultBasePath: vaultBase,
      fs,
      notice: (m) => new Notice(m),
    });

    const latest = this.store.load();
    const now = Date.now();
    const newId = crypto.randomUUID();
    let target: FolderMapping;
    let updatedList: FolderMapping[];

    if (this.editingId) {
      const oldTarget = latest.general.folderMappings.find((m) => m.id === this.editingId);
      if (!oldTarget) {
        new Notice('編集対象が見つかりません');
        return;
      }
      target = {
        ...oldTarget,
        linkName: this.linkName,
        vaultSubpath: sub.normalized,
        externalPath: this.externalPath,
        updatedAt: now,
      };
      updatedList = latest.general.folderMappings.map((m) =>
        m.id === this.editingId ? target : m,
      );
      // 編集: linkName / externalPath / vaultSubpath 変更時は junction 削除→再作成（Windows junction は atomic 変更不可）
      // apply() は enabled=true なら既存なら linked、無ければ created を返す
      if (oldTarget.linkName !== this.linkName || oldTarget.externalPath !== this.externalPath || oldTarget.vaultSubpath !== sub.normalized) {
        fm.apply({ ...oldTarget, enabled: false }); // 旧 junction 削除（失敗時は Notice のみ・続行）
      }
    } else {
      target = {
        id: newId,
        linkName: this.linkName,
        vaultSubpath: sub.normalized,
        externalPath: this.externalPath,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      updatedList = [...latest.general.folderMappings, target];
    }

    const state = fm.apply(target);
    if (state === 'error' || state === 'external_missing' || state === 'circular' || state === 'forbidden_path' || state === 'vault_exists') {
      // 仕様 §7.3: FS 失敗時は data.json に保存しない（ロールバック）
      new Notice(`フォルダマッピングの作成に失敗しました: ${state}`);
      return;
    }

    this.store.save({ ...latest, general: { ...latest.general, folderMappings: updatedList } });
    this.close();
    this.onSaved();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}