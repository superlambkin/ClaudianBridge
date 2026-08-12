import { Plugin, Notice, TFolder } from 'obsidian';
import { ConfigStore } from './core/config-store';
import { ClaudianBridgeSettingTab } from './settings/ClaudianBridgeSettingTab';
import { setupSelectionWatcher } from './features/selection/watcher';
import { addFolderToClaudian } from './features/selection/core';
import { addTextToTTS } from './features/tts/core';
import { migrateFromLegacy } from './legacy/migration';
import { disableLegacyPluginsOnce } from './legacy/disable-legacy';
import { OfficeMenuRegistrar } from './features/office/menu';
import { buildWhitelistCss } from './features/whitelist/css-builder';
import { installWhitelistCss, removeWhitelistCss } from './features/whitelist/injector';
import { ChromaMenuRegistrar } from './features/chroma/views/ChromaMenuRegistrar';
import { CHROMA_VIEW_TYPE, DatabaseBrowserView } from './features/chroma/views/DatabaseBrowserView';
import { registerObjectContextMenu } from './features/object';
import { registerClaudeQuota, unregisterClaudeQuota } from './features/quota/index';
import * as path from 'path';
import { initDiagAuto, diag, installGlobalErrorHandlers } from './core/diag';

// モジュールロード時に診断ログを初期化（ロード失敗の原因特定用）
console.log('[claudian-bridge] module loading (main.ts top)');
initDiagAuto();
installGlobalErrorHandlers();
diag('module loaded', { importDone: true });

export default class ClaudianBridgePlugin extends Plugin {
  private store!: ConfigStore;
  private quotaHandle: Awaited<ReturnType<typeof registerClaudeQuota>> = null;

  /** Convenience accessor for views that want a settings snapshot. */
  get cbSettings(): import('./core/settings').ClaudianBridgeSettings {
    return this.store.load();
  }

  async onload(): Promise<void> {
    diag('onload START');
    try {
      // vault ルート解決（__dirname / process.cwd() は信用しない → app.vault.adapter.getBasePath()）
      const adapter = this.app.vault.adapter as { getBasePath?: () => string };
      const vaultRoot = adapter.getBasePath ? adapter.getBasePath() : process.cwd();
      diag('vaultRoot', { vaultRoot, configDir: this.app.vault.configDir });
      const pluginDataDir = path.join(vaultRoot, this.app.vault.configDir, 'plugins', 'claudian-bridge');
      this.store = new ConfigStore(path.join(pluginDataDir, 'data.json'));
      diag('ConfigStore created', { configPath: path.join(pluginDataDir, 'data.json') });

      // 1. 旧 data.json → 新形式 自動取り込み（旧プラグインのリネームより先に実施）
      try {
        const pluginsDir = path.join(vaultRoot, this.app.vault.configDir, 'plugins');
        const result = migrateFromLegacy(this.store, pluginsDir);
        diag('migrateFromLegacy done', { migrated: result.migrated });
        if (result.migrated.length > 0) {
          console.warn('[claudian-bridge] migrated:', result.migrated);
        }
      } catch (e) {
        diag('migrateFromLegacy ERROR', e);
        console.warn('[claudian-bridge] migrateFromLegacy error:', e);
      }

      // 2. 旧プラグイン無効化（1度だけ）— chroma-inspector をここで先にリネーム
      try {
        disableLegacyPluginsOnce(vaultRoot);
        diag('disableLegacyPluginsOnce done');
      } catch (e) {
        diag('disableLegacyPluginsOnce ERROR', e);
        console.warn('[claudian-bridge] disableLegacyPluginsOnce error:', e);
      }

      // 2.5 Whitelist CSS 注入（general.enabled かつ whitelist.enabled 時のみ）
      {
        const c = this.store.load();
        const w = c.whitelist;
        diag('whitelist config', { pluginEnabled: c.general.enabled, enabled: w.enabled });
        if (c.general.enabled && w.enabled) {
          const css = buildWhitelistCss(w.extensions, w.alwaysShowFolders);
          if (css) installWhitelistCss(css);
          diag('whitelist css injected');
        }
      }

      // 3. 設定タブ登録（1ページ / 内部タブ）
      this.addSettingTab(new ClaudianBridgeSettingTab(this.app, this, this.store, async () => {
        // 移行リセット：フラグをクリアして migration やり直し可能に
        const cfg = this.store.load();
        this.store.save({
          ...cfg,
          general: {
            ...cfg.general,
            migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false, chromaInspector: false },
            migrationResetAvailable: true,
          },
        });
      }));
      diag('setting tab registered');

      // ★ プラグイン全体の有効化トグル（general.enabled）: false なら機能登録をスキップ
      if (!this.store.load().general.enabled) {
        diag('general.enabled=false → 機能登録スキップ');
        console.log('[claudian-bridge] disabled via settings');
        diag('onload COMPLETE (disabled)');
        return;
      }

      // 4. 機能登録
      const cleanupSelection = setupSelectionWatcher(this.app, this.store, async (text) => {
        const cfg = this.store.load();
        console.log('[claudian-bridge] selection -> TTS clicked', { textLen: text.length, ttsEnabled: cfg.tts.enabled, engine: cfg.tts.engine });
        if (!cfg.tts.enabled) return;
        await addTextToTTS(this.app, text, cfg.tts);  // voices / minimax を含む完全設定
      });
      this.register(cleanupSelection);
      diag('selection watcher registered');

      // === v0.2.0: Object context menu ===
      registerObjectContextMenu(this, this.store);
      diag('object context menu registered');

      // 外部変更検知（UI 更新は SettingTab の onChange で実施済み）。close は onunload で実施
      this.store.watch(() => {
        const w = this.store.load().whitelist;
        const css = w.enabled ? buildWhitelistCss(w.extensions, w.alwaysShowFolders) : null;
        if (css) installWhitelistCss(css); else removeWhitelistCss();
      });
      diag('store.watch registered');

      // 5. Office 変換メニュー登録（registerFileMenu が内部で registerEvent を呼ぶ）
      const officeSettingsRef = () => this.store.load().office;
      const openSettings = () => {
        const setting = (this.app as unknown as {
          setting?: { openTabById?: (id: string) => void; open?: () => void };
        }).setting;
        if (!setting) { new Notice('[claudian-bridge] settings API unavailable'); return; }
        setting.open?.();
        try { setting.openTabById?.(this.manifest.id); } catch { /* best-effort */ }
      };
      OfficeMenuRegistrar.registerFileMenu(this, this.app, officeSettingsRef, openSettings);
      OfficeMenuRegistrar.registerMultiSelect(this, this.app, officeSettingsRef, openSettings);
      diag('office menu registered');

      // 5.5 フォルダ右クリック「Add to Claudian」（selection.folderEnabled が true の時のみ）
      this.registerEvent(
        this.app.workspace.on('file-menu', (menu, file) => {
          if (file instanceof TFolder && this.store.load().selection.folderEnabled) {
            menu.addItem((item) => item
              .setTitle('Add to Claudian')
              .setIcon('message-square-plus')
              .onClick(() => { void addFolderToClaudian(this.app, file); }));
          }
        })
      );
      diag('file-menu registered');

      // 6. Chroma Inspector 統合: registerView + ribbon/command
      // chroma-inspector プラグインは disableLegacyPluginsOnce() で先に無効化済みなので
      // アイコン重複は発生しない。chroma.enabled=false のときは view / ribbon / command を
      // 一切登録しない（dead schema field だった過去の状態を解消）。
      if (this.store.load().chroma.enabled) {
        this.registerView(
          CHROMA_VIEW_TYPE,
          (leaf) =>
            new DatabaseBrowserView(leaf, {
              // Pass a live accessor so the view always sees the latest settings.
              getSettings: () => this.cbSettings,
            })
        );
        ChromaMenuRegistrar.register(this);
        diag('chroma registered');
      }

      // 7. Claude 残量検出 (v0.3.0): quotaEnabled=true のとき onload で起動
      // 設計書 §アーキテクチャ & データフロー に従い、onload から register。
      // registerClaudeQuota() 自体は冪等なので SettingTab からの呼び出しと共存可能。
      if (this.store.load().general.quotaEnabled) {
        diag('registerClaudeQuota starting');
        this.quotaHandle = await registerClaudeQuota(this.app, this.store);
        diag('registerClaudeQuota done');
      }

      diag('onload COMPLETE');
      console.log('[claudian-bridge] loaded');
    } catch (e) {
      diag('onload FAILED', e);
      console.error('[claudian-bridge] onload error:', e);
      throw e;
    }
  }

  async onunload(): Promise<void> {
    diag('onunload START');
    try {
      removeWhitelistCss();
      if (this.quotaHandle) {
        await unregisterClaudeQuota();
        this.quotaHandle = null;
      }
      this.store.close();
      console.log('[claudian-bridge] unloaded');
      diag('onunload COMPLETE');
    } catch (e) {
      diag('onunload ERROR', e);
      console.error('[claudian-bridge] onunload error:', e);
    }
  }
}
