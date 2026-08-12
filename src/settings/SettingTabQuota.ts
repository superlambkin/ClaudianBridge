import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { clampRefreshSec, clampSwitchSec } from '../core/settings';
import { readLlmInfoFromSettings } from '../features/quota/llm-info';
import { createDeepSeekProvider } from '../features/quota/providers/deepseek';
import { createKimiProvider } from '../features/quota/providers/kimi';
import { createMiniMaxProvider } from '../features/quota/providers/minimax';
import { testProviderConnection } from '../features/quota/service';
import { getClaudeQuotaHandle, registerClaudeQuota } from '../features/quota/index';
import type { ProviderId, ProviderQuota } from '../features/quota/types';

type QuotaLevel = 'safe' | 'caution' | 'danger' | 'unknown';

/** 使用率 % → 安全/注意/危険（70/90 閾値） */
function levelForPct(pct: number | null): QuotaLevel {
  if (pct === null || !Number.isFinite(pct)) return 'unknown';
  if (pct >= 90) return 'danger';
  if (pct >= 70) return 'caution';
  return 'safe';
}

/** 残金（DeepSeek）→ レベル。100以上=safe, 50超=safe でない注意, 50以下=danger */
function levelForBalance(balance: number | null | undefined): QuotaLevel {
  if (balance === null || balance === undefined || !Number.isFinite(balance)) return 'unknown';
  if (balance >= 100) return 'safe';
  if (balance > 50) return 'caution';
  return 'danger';
}

/** プロバイダ残量 → 表示色レベル（DeepSeek は残金、他は使用率%） */
function levelForQuota(q: ProviderQuota): QuotaLevel {
  if (q.status !== 'success') return 'unknown';
  if (q.providerId === 'deepseek') return levelForBalance(q.balance);
  return levelForPct(q.pct);
}

function colorClass(level: QuotaLevel): string {
  switch (level) {
    case 'safe': return 'cb-llm-safe';
    case 'caution': return 'cb-llm-caution';
    case 'danger': return 'cb-llm-danger';
    default: return 'cb-llm-unknown';
  }
}

function levelLabel(s: ReturnType<typeof getLocaleStrings>, level: QuotaLevel): string {
  switch (level) {
    case 'safe': return s.quotaSafe;
    case 'caution': return s.quotaCaution;
    case 'danger': return s.quotaDanger;
    default: return s.quotaColorUnknown;
  }
}

export function renderQuotaTab(app: App, containerEl: HTMLElement, store: ConfigStore): void {
  const s = getLocaleStrings(getUILanguage());

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.quotaLlmHeading });
    containerEl.createEl('p', { text: s.quotaLlmDesc, cls: 'setting-item-description' });

    // ───── 有効化トグル ─────
    new Setting(containerEl)
      .setName(s.quotaEnabled)
      .setDesc(s.quotaEnabledDesc)
      .addToggle((t) =>
        t.setValue(cfg.general.quotaEnabled).onChange((v) => {
          try {
            const latest = store.load();
            store.save({ ...latest, general: { ...latest.general, quotaEnabled: v } });
            const handle = getClaudeQuotaHandle();
            if (!v && handle) {
              void handle.service.stop();
              handle.view.unmount();
            } else if (v) {
              void registerClaudeQuota(app, store);
            }
            new Notice(s.noticeSaved);
            draw();
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        })
      );

    // ───── 表示モデル個別ON/OFF（v0.5.0） ─────
    containerEl.createEl('h3', { text: s.quotaDisplayModelsHeading });
    containerEl.createEl('p', { text: s.quotaDisplayModelsDesc, cls: 'setting-item-description' });

    const displayEntries: Array<[keyof typeof cfg.quota.displayModels, string]> = [
      ['claude', s.quotaDisplayClaude],
      ['deepseek', s.quotaDisplayDeepseek],
      ['kimi', s.quotaDisplayKimi],
      ['minimax', s.quotaDisplayMinimax],
    ];
    for (const [key, label] of displayEntries) {
      new Setting(containerEl)
        .setName(label)
        .addToggle((t) => t.setValue(cfg.quota.displayModels[key]).onChange((v) => {
          try {
            const latest = store.load();
            store.save({
              ...latest,
              quota: {
                ...latest.quota,
                displayModels: { ...latest.quota.displayModels, [key]: v },
              },
            });
            new Notice(s.noticeSaved);
          } catch (e) {
            new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
            draw();
          }
        }));
    }

    // ───── データ収集周期（60s 可変） ─────
    new Setting(containerEl)
      .setName(s.quotaRefreshSec)
      .setDesc(s.quotaRefreshSecDesc)
      .addText((t) =>
        t
          .setValue(String(cfg.general.quotaRefreshSec))
          .onChange((v) => {
            const n = parseInt(v, 10);
            if (!Number.isFinite(n)) return;
            try {
              const latest = store.load();
              store.save({ ...latest, general: { ...latest.general, quotaRefreshSec: clampRefreshSec(n) } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── 表示モデル切替周期（5s 可変） ─────
    new Setting(containerEl)
      .setName(s.quotaSwitchSec)
      .setDesc(s.quotaSwitchSecDesc)
      .addText((t) =>
        t
          .setValue(String(cfg.general.quotaSwitchSec))
          .onChange((v) => {
            const n = parseInt(v, 10);
            if (!Number.isFinite(n)) return;
            try {
              const latest = store.load();
              store.save({ ...latest, general: { ...latest.general, quotaSwitchSec: clampSwitchSec(n) } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── Claude Code 設定ファイル ─────
    new Setting(containerEl)
      .setName(s.quotaClaudeSettingsPath)
      .setDesc(s.quotaClaudeSettingsPathDesc)
      .addText((t) =>
        t
          .setPlaceholder('C:\\Users\\...\\.claude\\settings.json')
          .setValue(cfg.quota.claudeSettingsPath)
          .onChange((v) => {
            try {
              const latest = store.load();
              store.save({ ...latest, quota: { ...latest.quota, claudeSettingsPath: v.trim() } });
            } catch (e) {
              new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
              draw();
            }
          })
      );

    // ───── 現在の LLM（settings.json から読み取り） ─────
    containerEl.createEl('h3', { text: s.quotaCurrentLlm });
    const info = readLlmInfoFromSettings(cfg.quota.claudeSettingsPath);
    if (info.provider === 'unknown') {
      containerEl.createEl('p', { text: s.quotaCurrentLlmEmpty, cls: 'setting-item-description' });
    } else {
      const rows: Array<[string, string]> = [
        [s.quotaProvider, info.provider],
        [s.quotaModel, info.model ?? s.quotaCurrentLlmEmpty],
        [s.quotaBaseUrl, info.baseUrl ?? s.quotaCurrentLlmEmpty],
      ];
      const dl = containerEl.createEl('div', { cls: 'cb-llm-info' });
      for (const [k, v] of rows) {
        const row = dl.createEl('div', { cls: 'cb-llm-info__row' });
        row.createEl('span', { text: k, cls: 'cb-llm-info__key' });
        row.createEl('span', { text: v, cls: 'cb-llm-info__value' });
      }
    }

    // ───── API キー入力 + 接続テスト + 残量表示 ─────
    containerEl.createEl('h3', { text: s.quotaApiKeysHeading });
    containerEl.createEl('p', { text: s.quotaApiKeysDesc, cls: 'setting-item-description' });

    const quota = cfg.quota;

    const saveKey = (key: keyof typeof quota, value: string): void => {
      try {
        const latest = store.load();
        store.save({ ...latest, quota: { ...latest.quota, [key]: value } });
      } catch (e) {
        new Notice(s.noticeSaveFailed.replace('{msg}', (e as Error).message));
      }
    };

    const providerBuilders: Array<{
      id: ProviderId;
      apiKey: string;
      build: (k: string) => ReturnType<typeof createDeepSeekProvider> | ReturnType<typeof createKimiProvider> | ReturnType<typeof createMiniMaxProvider>;
      valueLabel: string;
    }> = [
      {
        id: 'deepseek',
        apiKey: quota.deepseekApiKey,
        build: (k) => createDeepSeekProvider(() => k),
        valueLabel: s.quotaDeepseekValue,
      },
      {
        id: 'kimi',
        apiKey: quota.kimiApiKey,
        build: (k) => createKimiProvider(() => k),
        valueLabel: s.quotaKimiValue,
      },
      {
        id: 'minimax',
        apiKey: quota.minimaxApiKey,
        build: (k) => createMiniMaxProvider(() => k),
        valueLabel: s.quotaMinimaxValue,
      },
    ];

    const labelByKey = (id: ProviderId): string =>
      id === 'deepseek' ? s.quotaDeepseekApiKey : id === 'kimi' ? s.quotaKimiApiKey : s.quotaMinimaxApiKey;

    for (const p of providerBuilders) {
      new Setting(containerEl)
        .setName(labelByKey(p.id))
        .addText((t) => {
          t.setPlaceholder(s.quotaApiKeyPlaceholder);
          t.setValue(p.apiKey);
          t.inputEl.type = 'password';
          t.onChange((v) => saveKey(p.id === 'deepseek' ? 'deepseekApiKey' : p.id === 'kimi' ? 'kimiApiKey' : 'minimaxApiKey', v));
        })
        .addButton((b) =>
          b.setButtonText(s.quotaTestConnection).onClick(async () => {
            b.setDisabled(true);
            b.setButtonText(s.quotaFetching);
            try {
              const latest = store.load();
              const key = p.id === 'deepseek'
                ? latest.quota.deepseekApiKey
                : p.id === 'kimi' ? latest.quota.kimiApiKey : latest.quota.minimaxApiKey;
              const provider = p.build(key);
              const result = await testProviderConnection(provider);
              const resultRow = containerEl.createDiv({ cls: 'cb-llm-result' });
              if (result.ok && result.quota) {
                const level = levelForQuota(result.quota);
                const val = result.quota.value || '--';
                resultRow.createEl('span', {
                  text: `${p.valueLabel}: ${val}  [${levelLabel(s, level)}]`,
                  cls: `cb-llm-result__text ${colorClass(level)}`,
                });
              } else {
                resultRow.createEl('span', {
                  text: s.quotaTestFail.replace('{msg}', result.error ?? 'unknown'),
                  cls: 'cb-llm-result__text cb-llm-unknown',
                });
              }
            } catch (e) {
              new Notice(s.quotaTestFail.replace('{msg}', (e as Error).message), 8000);
            } finally {
              b.setDisabled(false);
              b.setButtonText(s.quotaTestConnection);
            }
          })
        );
    }
  };

  draw();
}
