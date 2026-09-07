import { Notice, Setting } from 'obsidian';
import type { App, DataAdapter } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { ALLOWED_TOKEN_RATE_INTERVALS, DEFAULT_THINKING_CONFIGS } from '../core/settings';
import type { LocaleStrings } from '../core/i18n';
import { THINKING_EFFORT_VALUES } from '../features/llm/types';
import type { ThinkingEffort } from '../features/llm/types';
import { readLlmInfoFromSettings } from '../features/quota/llm-info';
import type { LlmProviderId } from '../features/quota/llm-info';
import { runSelfUpdate } from '../features/self-update';
import manifest from '../manifest.json';

/** プラグインバージョン（SSOT: src/manifest.json — バンドル時に esbuild が埋め込む） */
export const PLUGIN_VERSION: string = manifest.version;

// === v0.38.0 (F-039): Think モード選択機能 ===

/** Think モード設定を持つプロバイダのキー（settings.thinking のキーと一致） */
export type ThinkProviderKey = 'claude' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu';

/** Think モード設定を表示するプロバイダの並び順 */
export const THINK_PROVIDER_KEYS: readonly ThinkProviderKey[] = ['claude', 'deepseek', 'kimi', 'minimax', 'zhipu'];

/** プロバイダの表示名（ロケール文字列から取得） */
export function getThinkProviderName(s: LocaleStrings, p: ThinkProviderKey): string {
  switch (p) {
    case 'claude': return s.settingThinkModeProviderClaude;
    case 'deepseek': return s.settingThinkModeProviderDeepseek;
    case 'kimi': return s.settingThinkModeProviderKimi;
    case 'minimax': return s.settingThinkModeProviderMiniMax;
    case 'zhipu': return s.settingThinkModeProviderZhipu;
  }
}

/** 検出された LLM プロバイダのラベル（unknown はそのまま表示） */
export function getThinkProviderLabel(s: LocaleStrings, p: LlmProviderId): string {
  return p === 'unknown' ? 'unknown' : getThinkProviderName(s, p);
}

/** 保存値が不正な effort だった場合は既定値へフォールバック（normalize は effort を検証しない） */
function coerceEffort(v: unknown, fallback: ThinkingEffort): ThinkingEffort {
  return THINKING_EFFORT_VALUES.includes(v as ThinkingEffort) ? (v as ThinkingEffort) : fallback;
}

export function renderGeneralTab(_app: App, containerEl: HTMLElement, store: ConfigStore, resetMigration?: () => Promise<void>, pluginId?: string): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabGeneral });

    // バージョン情報 + 更新確認ボタン（v0.32.10 自己更新機能）
    const versionRow = containerEl.createDiv('cb-version-row');
    versionRow.createEl('span', { text: 'Claudian Bridge', cls: 'cb-version-row__name' });
    versionRow.createEl('span', { text: `v${PLUGIN_VERSION}`, cls: 'cb-version-row__version' });
    const updateBtn = versionRow.createEl('button', { text: s.updateCheckButton, cls: 'cb-version-row__update-btn' });
    updateBtn.addEventListener('click', () => {
      void (async () => {
        updateBtn.disabled = true;
        try {
          const app = _app as unknown as { vault?: { adapter?: DataAdapter & { basePath?: string } } } | null;
          const adapter = app?.vault?.adapter;
          if (app && pluginId && adapter?.basePath) {
            const pluginDir = `${adapter.basePath}/.obsidian/plugins/${pluginId}`;
            await runSelfUpdate(app as App, pluginId, PLUGIN_VERSION, pluginDir, adapter);
          }
        } finally {
          updateBtn.disabled = false;
        }
      })();
    });

    new Setting(containerEl)
      .setName(s.generalEnabled)
      .setDesc(s.generalEnabledDesc)
      .addToggle((t) => t.setValue(cfg.general.enabled).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, enabled: v } });
          new Notice(s.noticeSaved);
          // 即時反映のためプラグインを再読み込み（onload が enabled を尊重する）
          if (pluginId) {
            const plugins = (_app as unknown as { plugins?: { enablePlugin?: (id: string) => Promise<void>; disablePlugin?: (id: string) => Promise<void> } }).plugins;
            if (v) {
              await plugins?.enablePlugin?.(pluginId);
            } else {
              await plugins?.disablePlugin?.(pluginId);
            }
          }
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // v0.9.0: Claudian チャットのコードブロックコピー時に ``` フェンスを付与
    new Setting(containerEl)
      .setName(s.generalCodeCopyFence)
      .setDesc(s.generalCodeCopyFenceDesc)
      .addToggle((t) => t.setValue(cfg.general.codeCopyFence).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, codeCopyFence: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // v0.33.0: チャット内 mermaid 自動描画
    new Setting(containerEl)
      .setName(s.generalMermaidRender)
      .setDesc(s.generalMermaidRenderDesc)
      .addToggle((t) => t.setValue(cfg.general.mermaidRender).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, mermaidRender: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // v0.21.0: バックアップ機能（既定 ON）
    new Setting(containerEl)
      .setName(s.generalBackupEnabled)
      .setDesc(s.generalBackupEnabledDesc)
      .addToggle((t) => t.setValue(cfg.general.backupEnabled).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, backupEnabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // v0.21.1: バックアップ完了時にダイアログを自動で閉じる（既定 ON）
    new Setting(containerEl)
      .setName(s.generalBackupAutoClose)
      .setDesc(s.generalBackupAutoCloseDesc)
      .addToggle((t) => t.setValue(cfg.general.backupAutoClose).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, backupAutoClose: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // === v0.38.0: プロキシ設定（LLM アクセス用） ===
    containerEl.createEl('h3', { text: s.generalProxyHeading });
    new Setting(containerEl)
      .setName(s.generalProxyEnabled)
      .setDesc(s.generalProxyEnabledDesc)
      .addToggle((t) => t.setValue(cfg.general.proxy.enabled).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, proxy: { ...latest.general.proxy, enabled: v } } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));
    new Setting(containerEl)
      .setName(s.generalProxyUrl)
      .setDesc(s.generalProxyUrlDesc)
      .addText((t) => t
        .setPlaceholder('http://proxy.example.com:8080')
        .setValue(cfg.general.proxy.url)
        .onChange(async (v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, general: { ...latest.general, proxy: { ...latest.general.proxy, url: v } } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        }),
      );
    new Setting(containerEl)
      .setName(s.generalProxyNoProxy)
      .setDesc(s.generalProxyNoProxyDesc)
      .addText((t) => t
        .setPlaceholder('localhost,127.0.0.1,.local')
        .setValue(cfg.general.proxy.noProxyHosts)
        .onChange(async (v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, general: { ...latest.general, proxy: { ...latest.general.proxy, noProxyHosts: v } } });
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        }),
      );

    // === v0.24.0: クイック返信ボタンの方案ボタンを常に表示 ===
    new Setting(containerEl)
      .setName(s.quickReplyShowAllOptions)
      .setDesc(s.quickReplyShowAllOptionsDesc)
      .addToggle((t) => t.setValue(cfg.general.quickReplyShowAllOptions).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, quickReplyShowAllOptions: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // === v0.25.0: クイック返信ボタン全体の ON/OFF ===
    new Setting(containerEl)
      .setName(s.quickReplyEnabled)
      .setDesc(s.quickReplyEnabledDesc)
      .addToggle((t) => t.setValue(cfg.general.quickReplyEnabled).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, quickReplyEnabled: v } });
          new Notice(s.noticeSaved);
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // === v0.30.0: トークン速度表示 ===
    new Setting(containerEl)
      .setName(s.tokenRateLabel)
      .setDesc(s.tokenRateDesc)
      .addToggle((t) => t.setValue(cfg.general.tokenRateEnabled).onChange(async (v) => {
        try {
          const latest = store.load();
          store.save({ ...latest, general: { ...latest.general, tokenRateEnabled: v } });
          new Notice(s.noticeSaved);
          draw(); // 子トグル + interval ドロップダウンの有効/無効を即時反映
        } catch (e) {
          new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
          draw();
        }
      }));

    // === v0.32.0: トークン速度表示の更新周期 ===
    new Setting(containerEl)
      .setName(s.tokenRateIntervalLabel)
      .setDesc(s.tokenRateIntervalDesc)
      .addDropdown((d) => {
        const labelOf = (ms: number): string => {
          switch (ms) {
            case 100: return s.tokenRateInterval100;
            case 250: return s.tokenRateInterval250;
            case 500: return s.tokenRateInterval500;
            case 1000: return s.tokenRateInterval1000;
            case 2000: return s.tokenRateInterval2000;
            default: return `${ms} ms`;
          }
        };
        for (const ms of ALLOWED_TOKEN_RATE_INTERVALS) d.addOption(String(ms), labelOf(ms));
        d.setValue(String(cfg.general.tokenRateIntervalMs))
          .setDisabled(!cfg.general.tokenRateEnabled)
          .onChange(async (v) => {
            try {
              const latest = store.load();
              const num = Number(v);
              store.save({ ...latest, general: { ...latest.general, tokenRateIntervalMs: num } });
              new Notice(s.noticeSaved);
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          });
      });

    // === v0.31.0: トークン速度表示の表示項目選択 ===
    const tokenRateShowDefs: Array<{ key: 'tokenRateShowTtft' | 'tokenRateShowCurrent' | 'tokenRateShowAvg' | 'tokenRateShowMax'; label: string }> = [
      { key: 'tokenRateShowTtft', label: s.tokenRateShowTtft },
      { key: 'tokenRateShowCurrent', label: s.tokenRateShowCurrent },
      { key: 'tokenRateShowAvg', label: s.tokenRateShowAvg },
      { key: 'tokenRateShowMax', label: s.tokenRateShowMax },
    ];
    for (const { key, label } of tokenRateShowDefs) {
      new Setting(containerEl)
        .setName(label)
        .addToggle((t) => t
          .setValue(cfg.general[key])
          .setDisabled(!cfg.general.tokenRateEnabled)
          .onChange(async (v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, general: { ...latest.general, [key]: v } });
              new Notice(s.noticeSaved);
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          }));
    }

    // === v0.38.0 (F-039): Think モード セクション ===
    containerEl.createEl('h3', { text: s.settingThinkModeTitle });
    containerEl.createEl('p', { text: s.settingThinkModeDescription, cls: 'setting-item-description' });

    // 現在検出されている LLM プロバイダ（Claude Code settings.json の ANTHROPIC_BASE_URL から推定）
    const llmInfo = readLlmInfoFromSettings(cfg.quota?.claudeSettingsPath);
    containerEl.createEl('div', {
      text: `${s.settingThinkModeCurrentProvider}: ${getThinkProviderLabel(s, llmInfo.provider)}`,
      cls: 'setting-item-description',
    });

    for (const provider of THINK_PROVIDER_KEYS) {
      const saved = cfg.thinking?.[provider] ?? DEFAULT_THINKING_CONFIGS[provider];
      const enabled = saved.enabled === true;
      const effort = coerceEffort(saved.effort, DEFAULT_THINKING_CONFIGS[provider].effort);

      const details = containerEl.createEl('details', { cls: 'cb-think-provider' });
      // 検出中のプロバイダは既定で開いておく
      if (llmInfo.provider === provider) details.setAttribute('open', '');
      const summary = details.createEl('summary', { cls: 'cb-think-provider__summary' });
      summary.createEl('span', { text: getThinkProviderName(s, provider), cls: 'cb-think-provider__name' });
      summary.createEl('span', {
        text: enabled ? s.settingThinkModeBadgeOn : s.settingThinkModeBadgeOff,
        cls: enabled ? 'cb-think-badge cb-think-badge--on' : 'cb-think-badge cb-think-badge--off',
      });

      // Think モード ON/OFF
      new Setting(details)
        .setName(s.settingThinkModeEnabled)
        .addToggle((t) => t.setValue(enabled).onChange(async (v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, thinking: { ...latest.thinking, [provider]: { ...latest.thinking[provider], enabled: v } } });
            new Notice(s.noticeSaved);
            draw(); // バッジと effort ドロップダウンの有効/無効を即時反映
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        }));

      // エフォート（low / medium / high、off は enabled=false 相当）
      new Setting(details)
        .setName(s.settingThinkModeEffort)
        .addDropdown((d) => {
          d.addOption('off', s.settingThinkModeEffortOff);
          d.addOption('low', s.settingThinkModeEffortLow);
          d.addOption('medium', s.settingThinkModeEffortMedium);
          d.addOption('high', s.settingThinkModeEffortHigh);
          d.setValue(effort)
            .setDisabled(!enabled)
            .onChange(async (v) => {
              try {
                const latest = store.load();
                const next = coerceEffort(v, DEFAULT_THINKING_CONFIGS[provider].effort);
                store.save({ ...latest, thinking: { ...latest.thinking, [provider]: { ...latest.thinking[provider], effort: next } } });
                new Notice(s.noticeSaved);
              } catch (e) {
                new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
                draw();
              }
            });
        });
    }

    containerEl.createEl('h3', { text: s.migratedFrom });
    const ul = containerEl.createEl('ul');
    ul.createEl('li', { text: `claudian-selection-bridge: ${cfg.general.migratedFrom.claudianSelectionBridge ? s.migrated : s.notMigrated}` });
    ul.createEl('li', { text: `vault-office-bridge: ${cfg.general.migratedFrom.vaultOfficeBridge ? s.migrated : s.notMigrated}` });
    ul.createEl('li', { text: `extension-whitelist: ${cfg.general.migratedFrom.extensionWhitelist ? s.migrated : s.notMigrated}` });
    ul.createEl('li', { text: `chroma-inspector: ${cfg.general.migratedFrom.chromaInspector ? s.migrated : s.notMigrated}` });

    if (cfg.general.migrationResetAvailable) {
      new Setting(containerEl)
        .setName(s.resetMigration)
        .setDesc(s.resetMigrationDesc)
        .addButton((b) => b.setButtonText(s.resetMigrationButton).setWarning().onClick(async () => {
          await resetMigration?.();
          new Notice(s.resetMigrationNotice);
          draw();
        }));
    }
  };

  draw();
}
