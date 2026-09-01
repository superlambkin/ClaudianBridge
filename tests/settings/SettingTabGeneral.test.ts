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

function makeStore(generalOverrides: Record<string, unknown> = {}): ConfigStore {
  const cfg = {
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
      ...generalOverrides,
    },
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
