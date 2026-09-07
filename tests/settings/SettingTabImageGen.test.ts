// @vitest-environment jsdom
// v0.38.0 (F-038): 文生図設定タブが描画されることを検証
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const toggleHandlers: Array<{
  name: string;
  value: unknown;
  disabled: boolean | null;
  onChange: ((v: unknown) => void) | null;
}> = [];

const dropdownHandlers: Array<{
  name: string;
  value: unknown;
  onChange: ((v: unknown) => void) | null;
}> = [];

const textHandlers: Array<{
  value: unknown;
  onChange: ((v: string) => void) | null;
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
        const captured: typeof toggleHandlers[number] = { name: this._name, value: undefined, disabled: null, onChange: null };
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
        const captured: typeof dropdownHandlers[number] = { name: this._name, value: undefined, onChange: null };
        const d = {
          addOption: function () { return this; },
          setValue: function (v: unknown) { captured.value = v; return this; },
          onChange: function (h: (v: unknown) => void) { captured.onChange = h; return this; },
        };
        cb(d);
        dropdownHandlers.push(captured);
        return this;
      }
      addText(cb: (t: unknown) => unknown) {
        const captured: typeof textHandlers[number] = { value: undefined, onChange: null };
        const t = {
          setValue: function (v: unknown) { captured.value = v; return this; },
          setPlaceholder: function () { return this; },
          onChange: function (h: (v: string) => void) { captured.onChange = h; return this; },
        };
        cb(t);
        textHandlers.push(captured);
        return this;
      }
      addButton(cb: (b: unknown) => unknown) {
        const b = { setButtonText: () => b, setWarning: () => b, setTooltip: () => b, setDisabled: () => b, onClick: () => b };
        cb(b);
        return this;
      }
    },
  };
});

beforeAll(() => {
  HTMLElement.prototype.empty = function (this: HTMLElement) { this.innerHTML = ''; return this; } as never;
  HTMLElement.prototype.createEl = function (this: HTMLElement, tag: string, o?: { text?: string; cls?: string }) {
    const e = document.createElement(tag);
    if (o?.cls) e.className = o.cls;
    if (o?.text) e.textContent = o.text;
    this.appendChild(e);
    return e as HTMLElement;
  } as never;
  HTMLElement.prototype.createDiv = function (this: HTMLElement, cls?: string) {
    const e = document.createElement('div');
    if (cls) e.className = cls;
    this.appendChild(e);
    return e;
  } as never;
});

import { renderImageGenTab } from '../../src/settings/SettingTabImageGen';
import { ConfigStore } from '../../src/core/config-store';
import * as path from 'node:path';
import * as os from 'node:os';

function makeStore(): ConfigStore {
  const tmpFile = path.join(os.tmpdir(), `cb-store-img-${Date.now()}-${Math.random()}.json`);
  return new ConfigStore(tmpFile);
}

describe('SettingTabImageGen', () => {
  let containerEl: HTMLElement;
  let store: ConfigStore;

  beforeEach(() => {
    containerEl = document.createElement('div');
    store = makeStore();
    toggleHandlers.length = 0;
    dropdownHandlers.length = 0;
    textHandlers.length = 0;
  });

  it('renders h2 + 6 settings (2 toggles, 3 dropdowns, 1 text)', () => {
    renderImageGenTab({} as any, containerEl, store);
    const h2 = containerEl.querySelector('h2');
    expect(h2?.textContent).toContain('文生図');
    expect(toggleHandlers.length).toBe(2);
    expect(dropdownHandlers.length).toBe(3);
    expect(textHandlers.length).toBe(1);
  });

  it('enabled トグル ON で保存される', () => {
    renderImageGenTab({} as any, containerEl, store);
    const enabled = toggleHandlers[0]!;
    expect(enabled.onChange).not.toBeNull();
    enabled.onChange!(true);
    expect(store.load().imageGen.enabled).toBe(true);
  });

  it('provider 変更で zhipu が保存される', () => {
    renderImageGenTab({} as any, containerEl, store);
    const provider = dropdownHandlers[0]!;
    expect(provider.onChange).not.toBeNull();
    provider.onChange!('zhipu');
    expect(store.load().imageGen.provider).toBe('zhipu');
  });

  it('aspect ratio 変更で 16:9 が保存される', () => {
    renderImageGenTab({} as any, containerEl, store);
    const aspect = dropdownHandlers[1]!;
    expect(aspect.onChange).not.toBeNull();
    aspect.onChange!('16:9');
    expect(store.load().imageGen.aspectRatio).toBe('16:9');
  });

  it('promptMaxChars 100〜8000 範囲のみ保存', () => {
    renderImageGenTab({} as any, containerEl, store);
    const txt = textHandlers[0]!;
    expect(txt.onChange).not.toBeNull();
    // 範囲外: 50
    txt.onChange!('50');
    expect(store.load().imageGen.promptMaxChars).toBe(2000); // 既定のまま
    // 範囲内: 3000
    txt.onChange!('3000');
    expect(store.load().imageGen.promptMaxChars).toBe(3000);
    // 範囲外: 9000
    txt.onChange!('9000');
    expect(store.load().imageGen.promptMaxChars).toBe(3000); // 変化なし
  });

  it('autoInsertToActive トグル', () => {
    renderImageGenTab({} as any, containerEl, store);
    const auto = toggleHandlers[1]!;
    expect(auto.onChange).not.toBeNull();
    auto.onChange!(false);
    expect(store.load().imageGen.autoInsertToActive).toBe(false);
  });
});
