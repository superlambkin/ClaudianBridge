import { Plugin, Notice, TFolder } from 'obsidian';
import { ConfigStore } from './core/config-store';
import { ClaudianBridgeSettingTab } from './settings/ClaudianBridgeSettingTab';
import { setupSelectionWatcher } from './features/selection/watcher';
import { setupCodeCopyFence } from './features/code-copy-fence';
import { addFolderToClaudian } from './features/selection/core';
import { speakText } from './features/tts/speak';
import { setupAutoReadTTS } from './features/tts/auto-read';
import { setupMessageReadButtons } from './features/tts/message-read-button';
import { setupInputAiReadButton } from './features/tts/input-ai-read-button';
import { setupMdFileRead } from './features/tts/md-file-read';
import { setupMdReadHighlight } from './features/tts/md-read-highlight';
import { mdReadEditorHighlight } from './features/tts/md-read-highlight/editor-highlight';
import { setupMdSaveButton } from './features/memory/md-save-button';
import { setupMessageMdSaveButtons } from './features/memory/message-md-save-button';
import { polishInstruction } from './features/llm/claude-cli';
import { setupToolbarButtons } from './features/tts/toolbar-buttons';
import { setupQuickReplyButtons } from './features/quick-reply/nav-buttons';
import { setupTokenRate } from './features/token-rate';
import { VoiceConfigSync } from './features/tts/voice-config-sync';
import { initEdgeTtsLocal } from './features/tts/edge-tts-local';
import { migrateFromLegacy } from './legacy/migration';
import { disableLegacyPluginsOnce } from './legacy/disable-legacy';
import { OfficeMenuRegistrar } from './features/office/menu';
import { BackupMenuRegistrar } from './features/backup/menu';
import { buildWhitelistCss } from './features/whitelist/css-builder';
import { installWhitelistCss, removeWhitelistCss } from './features/whitelist/injector';
import { ChromaMenuRegistrar } from './features/chroma/views/ChromaMenuRegistrar';
import { CHROMA_VIEW_TYPE, DatabaseBrowserView } from './features/chroma/views/DatabaseBrowserView';
import { installChromaFsHideCss, removeChromaFsHideCss } from './features/chroma-fs/hide-internal';
import { registerRagMenu } from './features/chroma-fs/rag-menu';
import { registerObjectContextMenu } from './features/object';
import { registerClaudeQuota, unregisterClaudeQuota } from './features/quota/index';
import { runTtsMigration } from './core/migrator';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS } from './core/settings';
import * as path from 'path';
import { initDiagAuto, diag, installGlobalErrorHandlers } from './core/diag';
import { getPluginDir } from './core/plugin-dir';

// モジュールロード時に診断ログを初期化（ロード失敗の原因特定用）
console.log('[claudian-bridge] module loading (main.ts top)');
initDiagAuto();
installGlobalErrorHandlers();
diag('module loaded', { importDone: true });

export default class ClaudianBridgePlugin extends Plugin {
  private store!: ConfigStore;
  private quotaHandle: Awaited<ReturnType<typeof registerClaudeQuota>> = null;
  private offTokenRate: (() => void) | null = null;

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
      const pluginDir = getPluginDir(this.app, this.manifest);
      const pluginDataDir = path.join(pluginDir, 'data.json');
      initEdgeTtsLocal(pluginDir);
      this.store = new ConfigStore(pluginDataDir);
      diag('ConfigStore created', { configPath: pluginDataDir });

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

      // 2.6 v0.6.0 TTS 簡素化マイグレーション（minimax 削除 + voices ネスト化 + Notice 1 回）
      try {
        const migrationResult = runTtsMigration(this.store, (m) => new Notice(m));
        diag('runTtsMigration done', { executed: migrationResult.executed, removed: migrationResult.removed });
        if (migrationResult.executed) {
          console.warn('[claudian-bridge] TTS migration removed:', migrationResult.removed);
        }
      } catch (e) {
        diag('runTtsMigration ERROR', e);
        console.warn('[claudian-bridge] runTtsMigration error:', e);
      }

      // 2.5 Whitelist CSS 注入（general.enabled かつ whitelist.enabled 時のみ）
      {
        const c = this.store.load();
        const w = c.whitelist;
        diag('whitelist config', { pluginEnabled: c.general.enabled, enabled: w.enabled });
        if (c.general.enabled && w.enabled) {
          const css = buildWhitelistCss(w.extensions, w.alwaysShowFolders, w.hideUnderscoreFolders);
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
            migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false, chromaInspector: false, claudeTtsSettings: false },
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

      // ★ v0.10.0: Claude Code CLI 用 voice-config.json 同期
      const voiceSync = new VoiceConfigSync(this.store);

      // 初回のみ既存 voice-config.json をインポート（その後は Claudian Bridge が SSOT）
      try {
        const cfgBefore = this.store.load();
        if (!cfgBefore.general.migratedFrom.claudeTtsSettings) {
          const imported = await voiceSync.importFromVoiceConfig();
          if (imported) {
            const current = this.store.load();
            // 既存 tts.enabled/engine がデフォルトのままならインポート値を採用（それ以外は既存優先）
            // cli は既存に無い新設フィールドなのでインポート値を採用
            const merged = {
              ...current,
              tts: {
                ...current.tts,
                enabled: current.tts.enabled === DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.enabled
                  ? (imported.tts?.enabled ?? current.tts.enabled)
                  : current.tts.enabled,
                engine: current.tts.engine === DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.engine
                  ? (imported.tts?.engine ?? current.tts.engine)
                  : current.tts.engine,
                // plachta は常に既存優先（voices は edge がデフォルトのままならインポート値を採用）
                voices: {
                  ...current.tts.voices,
                  edge:
                    current.tts.voices.edge.zh === DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.voices.edge.zh &&
                    current.tts.voices.edge.ja === DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.voices.edge.ja &&
                    current.tts.voices.edge.en === DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.voices.edge.en
                      ? (imported.tts?.voices?.edge ?? current.tts.voices.edge)
                      : current.tts.voices.edge,
                },
                plachta: current.tts.plachta,
                cli: imported.tts?.cli ?? current.tts.cli,
              },
            };
            this.store.save({
              ...merged,
              general: {
                ...merged.general,
                migratedFrom: { ...merged.general.migratedFrom, claudeTtsSettings: true },
              },
            });
            console.log('[claudian-bridge] imported voice-config.json → tts settings');
          } else {
            // voice-config.json が無い場合もフラグだけ立てる（再試行しない）
            const cfgNo = this.store.load();
            this.store.save({
              ...cfgNo,
              general: {
                ...cfgNo.general,
                migratedFrom: { ...cfgNo.general.migratedFrom, claudeTtsSettings: true },
              },
            });
          }
        }
      } catch (e) {
        diag('voiceConfig import ERROR', e);
        console.warn('[claudian-bridge] voice-config import error:', e);
      }

      // 4. 機能登録
      const cleanupSelection = setupSelectionWatcher(this.app, this.store, async (text) => {
        const cfg = this.store.load();
        if (!cfg.tts.enabled) return;
        await speakText('selection', text, cfg);
      });
      this.register(cleanupSelection);
      diag('selection watcher registered');

      // ★ v0.11.0: タスク終了時の自動読み上げ（📢 報告検出）
      const cleanupAutoRead = setupAutoReadTTS({
        app: this.app,
        store: this.store,
        speak: async (text) => {
          const cfg = this.store.load();
          if (!cfg.tts.enabled || cfg.tts.autoRead?.enabled === false) return false;
          return speakText('autoRead', text, cfg);
        },
      });
      this.register(cleanupAutoRead);
      diag('auto-read registered');

      // ★ v0.12.0: チャット入力ツールバーの操作ボタン（ミュート + 📖 全文読み上げ）
      // （旧 claude-tts-settings の claudianMuteButton / claudianFullTextButton の後継。
      //   📖 ボタンは tts.autoRead.scope と tts.cli.full_text を統一同期）
      this.register(setupToolbarButtons(this.store));
      diag('toolbar fulltext button registered');

      // ★ v0.23.0: クイック返信ボタン（✅ ❌ 1️⃣〜5️⃣ ワンクリック直接送信 + 推奨ハイライト）
      this.register(setupQuickReplyButtons(this.app));
      diag('quick-reply buttons registered');

      // ★ v0.30.0: トークン速度表示（入力画面下のライブ表示）
      this.offTokenRate = setupTokenRate(this.app, this.store);
      diag('token-rate wired');

      // ★ v0.14.0: メッセージ結果欄の読上げボタン（コピーボタン左隣）
      this.register(setupMessageReadButtons({
        app: this.app,
        store: this.store,
      }));
      diag('message read button registered');

      // ★ v0.16.0: AI読み上げボタン（✨ 入力文を整形して読み上げ）
      this.register(setupInputAiReadButton({
        store: this.store,
        polish: (text) => polishInstruction(text),
      }));
      diag('input-ai-read button registered');

      // ★ v0.17.0: MD保存ボタン（📝 ツールバー + 回答ブロック）
      this.register(setupMdSaveButton({ app: this.app, store: this.store }));
      this.register(setupMessageMdSaveButtons({ app: this.app, store: this.store }));
      diag('md-save buttons registered');

      // ★ v0.10.0: 保存時に voice-config.json へエクスポート（Claudian Bridge が SSOT）
      this.store.onSave((cfg) => {
        void voiceSync.exportToVoiceConfig(cfg).catch((e) => {
          console.warn('[claudian-bridge] voice-config export error:', e);
        });
      });
      diag('voice-config onSave wired');

      // v0.9.0: Claudian チャットのコードコピーにフェンスを付与（設定 OFF 時は無効）
      this.register(setupCodeCopyFence(this.store));
      diag('code-copy-fence registered');

      // === v0.2.0: Object context menu ===
      registerObjectContextMenu(this, this.store);
      diag('object context menu registered');

      // 外部変更検知（UI 更新は SettingTab の onChange で実施済み）。close は onunload で実施
      this.store.watch(() => {
        const w = this.store.load().whitelist;
        const css = w.enabled ? buildWhitelistCss(w.extensions, w.alwaysShowFolders, w.hideUnderscoreFolders) : null;
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
      OfficeMenuRegistrar.registerFileMenu(this, this.app, officeSettingsRef, openSettings, pluginDir);
      OfficeMenuRegistrar.registerMultiSelect(this, this.app, officeSettingsRef, openSettings, pluginDir);
      diag('office menu registered');
      BackupMenuRegistrar.register(this, this.app, () => this.store.load(), pluginDir);
      diag('backup menu registered');

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

      // ★ v0.17.0: MD ファイル右クリック「Add to TTS」
      this.register(setupMdFileRead(this.app, this.store));
      diag('md-file-read registered');

      // ★ v0.31.0 (F-028): MD 読み上げ位置ハイライト機能（cleanup + file-close ライフサイクル）
      this.register(setupMdReadHighlight(this.app, this.store));
      diag('md-read-highlight setup registered');

      // ★ v0.33.8 (F-028): Live Preview / Source 用・検索ハイライト方式の装飾
      this.registerEditorExtension([mdReadEditorHighlight]);
      diag('md-read-highlight editor extension registered');

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
              pluginDir,
            })
        );
        ChromaMenuRegistrar.register(this);

      // ★ v0.20.0: chroma-fs — 内部非表示 CSS（onunload で除去）
      if (this.store.load().chroma.hideInternal) {
        installChromaFsHideCss();
        this.register(() => removeChromaFsHideCss());
        diag('chroma-fs hideInternal css installed');
      }

      // ★ v0.20.0: chroma-fs — 右クリック RAG検索
      if (this.store.load().chroma.ragEnabled) {
        this.register(registerRagMenu(this.app, this.store, pluginDir));
        diag('chroma-fs rag menu registered');
      }
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
      this.offTokenRate?.();
      this.store.close();
      console.log('[claudian-bridge] unloaded');
      diag('onunload COMPLETE');
    } catch (e) {
      diag('onunload ERROR', e);
      console.error('[claudian-bridge] onunload error:', e);
    }
  }
}
