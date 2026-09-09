// @vitest-environment jsdom
// Task 6 (v0.31.0): 一般タブにトークン速度表示の表示項目 4 トグルを描画することを検証
// Task 6 (v0.32.0): 更新周期ドロップダウンが描画される（既定 250ms）/変更時にストアに保存される
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// トグルハンドラを記録するストア
const toggleHandlers: Array<{
  name: string;
  value: unknown;
  disabled: boolean | null;
  onChange: ((v: unknown) => void) | null;
}> = [];

// ドロップダウンハンドラを記録するストア（v0.32.0 で追加）
const dropdownHandlers: Array<{
  name: string;
  value: unknown;
  disabled: boolean | null;
  onChange: ((v: unknown) => void) | null;
}> = [];

vi.mock('obsidian', () => {
  return {
    Notice: vi.fn(),
    moment: { locale: () => 'ja' },
    Setting: class {
      private _name = '';
      constructor(_containerEl: HTMLElement) {}
      setName(n: string) { this._name = n; return this; }
      setDesc(_d: string) { return this; }
      setClass(_c: string) { return this; }
      addToggle(cb: (t: unknown) => unknown) {
        const captured: { name: string; value: unknown; disabled: boolean | null; onChange: ((v: unknown) => void) | null } = {
          name: this._name,
          value: undefined,
          disabled: null,
          onChange: null,
        };
        const t = {
          setValue: function (v: unknown) { captured.value = v; return this; },
          setDisabled: function (v: boolean) { captured.disabled = v; return this; },
          onChange: function (h: (v: unknown) => void) { captured.onChange = h; return this; },
        };
        cb(t);
        toggleHandlers.push(captured);
        return this;
      }
      addText(cb: (d: unknown) => unknown) {
        const builder = { setPlaceholder: () => builder, setValue: () => builder, onChange: () => builder };
        cb(builder);
        return this;
      }
      addDropdown(cb: (d: unknown) => unknown) {
        const captured: { name: string; value: unknown; disabled: boolean | null; onChange: ((v: unknown) => void) | null } = {
          name: this._name,
          value: undefined,
          disabled: null,
          onChange: null,
        };
        const d = {
          addOption: function () { return this; },
          setValue: function (v: unknown) { captured.value = v; return this; },
          setDisabled: function (v: boolean) { captured.disabled = v; return this; },
          onChange: function (h: (v: unknown) => void) { captured.onChange = h; return this; },
        };
        cb(d);
        dropdownHandlers.push(captured);
        return this;
      }
      addButton(cb: (b: unknown) => unknown) {
        const builder = { setButtonText: () => builder, setWarning: () => builder, setTooltip: () => builder, setDisabled: () => builder, onClick: () => builder };
        cb(builder);
        return this;
      }
    },
  };
});

// renderGeneralTab が使う Obsidian 独自の HTMLElement 拡張を jsdom に補完
beforeAll(() => {
  HTMLElement.prototype.empty = function (this: HTMLElement) { this.innerHTML = ''; return this; } as never;
  HTMLElement.prototype.createEl = function (this: HTMLElement, tag: string, o?: { text?: string; cls?: string }) {
    const e = document.createElement(tag);
    if (o?.cls) e.className = o.cls;
    if (o?.text) e.textContent = o.text;
    this.appendChild(e);
    return e;
  } as never;
  HTMLElement.prototype.createDiv = function (this: HTMLElement, cls?: string) {
    const e = document.createElement('div');
    if (cls) e.className = cls;
    this.appendChild(e);
    return e;
  } as never;
  HTMLElement.prototype.createUl = function (this: HTMLElement) { const e = document.createElement('ul'); this.appendChild(e); return e; } as never;
  HTMLElement.prototype.createLi = function (this: HTMLElement) { const e = document.createElement('li'); this.appendChild(e); return e; } as never;
});

import { renderGeneralTab } from '../../src/settings/SettingTabGeneral';
import { getLocaleStrings } from '../../src/core/i18n';
import type { ConfigStore } from '../../src/core/config-store';

function makeStore(generalOverrides: Record<string, unknown> = {}, rootOverrides: Record<string, unknown> = {}): ConfigStore {
  const cfg = {
    // v0.39.0 (F-039): Think モードセクションが参照する
    quota: { claudeSettingsPath: '' },
    thinking: {
      claude: { enabled: true, effort: 'medium' },
      deepseek: { enabled: false, effort: 'medium' },
      kimi: { enabled: false, effort: 'medium' },
      minimax: { enabled: false, effort: 'medium' },
      zhipu: { enabled: false, effort: 'medium' },
    },
    general: {
      enabled: true,
      migratedFrom: { claudianSelectionBridge: false, extensionWhitelist: false, vaultOfficeBridge: false, chromaInspector: false, claudeTtsSettings: false },
      migrationResetAvailable: false,
      quotaEnabled: false,
      quotaRefreshSec: 60,
      quotaSwitchSec: 5,
      codeCopyFence: true,
      backupEnabled: true,
      backupAutoClose: true,
      quickReplyShowAllOptions: false,
      quickReplyEnabled: true,
      tokenRateEnabled: true,
      tokenRateIntervalMs: 250,
      tokenRateShowTtft: true,
      tokenRateShowCurrent: true,
      tokenRateShowAvg: true,
      tokenRateShowMax: true,
      proxy: { enabled: false, url: '', noProxyHosts: 'localhost,127.0.0.1,.local' },
      ...generalOverrides,
    },
    ...rootOverrides,
  };
  return {
    load: () => cfg as never,
    save: vi.fn(),
    onSave: () => () => {},
  } as unknown as ConfigStore;
}

describe('renderGeneralTab - tokenRateShow* トグル', () => {
  let containerEl: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    toggleHandlers.length = 0;
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
  });

  it('4 つの表示項目トグルが描画される（全 ON・有効）', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const s = getLocaleStrings('ja');
    const names = toggleHandlers.map((t) => t.name);
    expect(names).toContain(s.tokenRateShowTtft);
    expect(names).toContain(s.tokenRateShowCurrent);
    expect(names).toContain(s.tokenRateShowAvg);
    expect(names).toContain(s.tokenRateShowMax);
    const toggles = toggleHandlers.filter((t) => [s.tokenRateShowTtft, s.tokenRateShowCurrent, s.tokenRateShowAvg, s.tokenRateShowMax].includes(t.name));
    expect(toggles.every((t) => t.value === true)).toBe(true);
    expect(toggles.every((t) => t.disabled === false)).toBe(true);
  });

  it('tokenRateEnabled OFF のとき 4 トグルは無効化される', () => {
    renderGeneralTab({} as never, containerEl, makeStore({ tokenRateEnabled: false }));
    const s = getLocaleStrings('ja');
    const toggles = toggleHandlers.filter((t) => [s.tokenRateShowTtft, s.tokenRateShowCurrent, s.tokenRateShowAvg, s.tokenRateShowMax].includes(t.name));
    expect(toggles).toHaveLength(4);
    expect(toggles.every((t) => t.disabled === true)).toBe(true);
  });
});

// v0.32.0: トークン速度表示の更新周期 dropdown
describe('renderGeneralTab - tokenRateIntervalMs ドロップダウン', () => {
  let containerEl: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    toggleHandlers.length = 0;
    dropdownHandlers.length = 0;
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
  });

  it('更新周期ドロップダウンが描画される（既定 250ms）', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const interval = dropdownHandlers.find((d) => d.name === getLocaleStrings('ja').tokenRateIntervalLabel);
    expect(interval).toBeDefined();
    expect(interval!.value).toBe('250');
  });

  it('更新周期変更時にストアに保存される', async () => {
    const store = makeStore();
    renderGeneralTab({} as never, containerEl, store);
    const interval = dropdownHandlers.find((d) => d.name === getLocaleStrings('ja').tokenRateIntervalLabel)!;
    await interval.onChange?.(500);
    expect((store.save as ReturnType<typeof vi.fn>).mock.calls[0][0].general.tokenRateIntervalMs).toBe(500);
  });
});

// === v0.39.0 (F-039): Think モード セクション ===
describe('renderGeneralTab - Think モード セクション', () => {
  let containerEl: HTMLElement;
  const s = getLocaleStrings('ja');

  beforeEach(() => {
    document.body.innerHTML = '';
    toggleHandlers.length = 0;
    dropdownHandlers.length = 0;
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
  });

  it('見出しと説明が描画される', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const headings = Array.from(containerEl.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings).toContain(s.settingThinkModeTitle);
    const texts = Array.from(containerEl.querySelectorAll('p')).map((p) => p.textContent);
    expect(texts).toContain(s.settingThinkModeDescription);
  });

  it('現在の LLM プロバイダ行が描画される', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const found = Array.from(containerEl.querySelectorAll('div')).some((d) =>
      (d.textContent ?? '').startsWith(`${s.settingThinkModeCurrentProvider}: `),
    );
    expect(found).toBe(true);
  });

  it('5 プロバイダ分の折りたたみブロックが描画される', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const details = containerEl.querySelectorAll('details');
    expect(details).toHaveLength(5);
    const names = Array.from(details).map((d) => d.querySelector('summary')?.textContent ?? '');
    for (const label of [
      s.settingThinkModeProviderClaude,
      s.settingThinkModeProviderDeepseek,
      s.settingThinkModeProviderKimi,
      s.settingThinkModeProviderMiniMax,
      s.settingThinkModeProviderZhipu,
    ]) {
      expect(names.some((n) => n.includes(label))).toBe(true);
    }
  });

  it('🧠 バッジが enabled に応じて ON / OFF で描画される', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const summaries = Array.from(containerEl.querySelectorAll('summary')).map((el) => el.textContent ?? '');
    // claude のみ既定で enabled: true
    expect(summaries.filter((t) => t.includes(s.settingThinkModeBadgeOn))).toHaveLength(1);
    expect(summaries.filter((t) => t.includes(s.settingThinkModeBadgeOff))).toHaveLength(4);
  });

  it('プロバイダごとに ON/OFF トグルと effort ドロップダウンが 1 つずつ描画される', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    expect(toggleHandlers.filter((t) => t.name === s.settingThinkModeEnabled)).toHaveLength(5);
    expect(dropdownHandlers.filter((d) => d.name === s.settingThinkModeEffort)).toHaveLength(5);
  });

  it('effort ドロップダウンは Think モード OFF のとき無効化される', () => {
    renderGeneralTab({} as never, containerEl, makeStore());
    const efforts = dropdownHandlers.filter((d) => d.name === s.settingThinkModeEffort);
    // claude（先頭・enabled: true）のみ有効
    expect(efforts[0].disabled).toBe(false);
    expect(efforts.slice(1).every((d) => d.disabled === true)).toBe(true);
  });

  it('トグル変更時に thinking.<provider>.enabled が保存される', async () => {
    const store = makeStore();
    renderGeneralTab({} as never, containerEl, store);
    const toggles = toggleHandlers.filter((t) => t.name === s.settingThinkModeEnabled);
    await toggles[1].onChange?.(true); // deepseek
    const saved = (store.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.thinking.deepseek.enabled).toBe(true);
    expect(saved.thinking.claude.enabled).toBe(true); // 他プロバイダは不変
  });

  it('effort 変更時に thinking.<provider>.effort が保存される', async () => {
    const store = makeStore();
    renderGeneralTab({} as never, containerEl, store);
    const efforts = dropdownHandlers.filter((d) => d.name === s.settingThinkModeEffort);
    await efforts[0].onChange?.('high'); // claude
    const saved = (store.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.thinking.claude.effort).toBe('high');
  });

  it('不正な effort が保存されていても UI は既定値 medium を表示する', () => {
    const store = makeStore({}, {
      thinking: {
        claude: { enabled: true, effort: 'invalid' },
        deepseek: { enabled: false, effort: 'low' },
        kimi: { enabled: false, effort: 'medium' },
        minimax: { enabled: false, effort: 'high' },
        zhipu: { enabled: false, effort: 'off' },
      },
    });
    renderGeneralTab({} as never, containerEl, store);
    const efforts = dropdownHandlers.filter((d) => d.name === s.settingThinkModeEffort);
    expect(efforts[0].value).toBe('medium'); // claude: invalid → フォールバック
    expect(efforts[1].value).toBe('low');
    expect(efforts[4].value).toBe('off');
  });

  it('不正な effort を選ばれても保存値は既定値に丸められる', async () => {
    const store = makeStore();
    renderGeneralTab({} as never, containerEl, store);
    const efforts = dropdownHandlers.filter((d) => d.name === s.settingThinkModeEffort);
    await efforts[0].onChange?.('bogus');
    const saved = (store.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.thinking.claude.effort).toBe('medium');
  });
});
