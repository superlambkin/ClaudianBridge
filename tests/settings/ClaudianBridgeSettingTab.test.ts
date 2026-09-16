// @vitest-environment jsdom
// v0.53.0 (F-052): ClaudianBridgeSettingTab の TABS に 🌉 ブリッジ が
//   - 7 番目（whitelist 直後）として含まれること
//   - 12 タブ構成になっていること
//   - tabBridge ラベルで描画されること
// を確認する
import { describe, it, expect, vi, beforeAll } from 'vitest';

// ClaudianBridgeSettingTab は CHANGELOG.md を raw import するため、空文字でモックする
vi.mock('../../CHANGELOG.md', () => ({ default: '# Mocked CHANGELOG' }));

vi.mock('obsidian', () => ({
  App: class {},
  PluginSettingTab: class {
    app: unknown;
    plugin: unknown;
    containerEl: HTMLElement;
    constructor(app: unknown, plugin: unknown) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = document.createElement('div');
    }
  },
  Notice: vi.fn(),
  moment: { locale: () => 'ja' },
  Setting: class {
    constructor(_c: HTMLElement) {}
    setName() { return this; }
    setDesc() { return this; }
    setHeading() { return this; }
    addToggle(cb: (t: unknown) => void) {
      const t = {
        setValue: () => t,
        setDisabled: () => t,
        onChange: () => t,
      };
      cb(t);
      return this;
    }
    addText(cb: (t: unknown) => void) {
      const t = {
        setPlaceholder: () => t,
        setValue: () => t,
        onChange: () => t,
      };
      cb(t);
      return this;
    }
    addDropdown(cb: (d: unknown) => void) {
      const d = {
        addOption: () => d,
        setValue: () => d,
        setDisabled: () => d,
        onChange: () => d,
      };
      cb(d);
      return this;
    }
    addButton(cb: (b: unknown) => void) {
      const b = {
        setButtonText: () => b,
        setWarning: () => b,
        setCta: () => b,
        onClick: () => b,
      };
      cb(b);
      return this;
    }
  },
  Modal: class { constructor(_app: unknown) {} open() {} close() {} },
}));

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
});

import { ClaudianBridgeSettingTab, TABS } from '../../src/settings/ClaudianBridgeSettingTab';
import { getLocaleStrings } from '../../src/core/i18n';

function makeManifest() {
  return { id: 'ClaudianBridge', name: 'Claudian Bridge', version: '0.0.0' };
}

function makeApp() {
  return {
    vault: { adapter: { basePath: 'C:/test/vault' }, configDir: '.obsidian' },
    plugins: { plugins: {} },
  };
}

describe('F-052: ClaudianBridgeSettingTab TABS 構成', () => {
  it('TABS は 12 要素（11 + bridge）', () => {
    expect(TABS.length).toBe(12);
  });

  it('7 番目（index 6）のタブ id は "bridge"', () => {
    expect(TABS[6].id).toBe('bridge');
  });

  it('bridge タブの labelKey は "tabBridge"', () => {
    expect(TABS[6].labelKey).toBe('tabBridge');
  });

  it('タブ順序: general → network → ... → bridge(7) → ... → changelog(12)', () => {
    const ids = TABS.map((t) => t.id);
    expect(ids).toEqual([
      'general',
      'network',
      'selection',
      'tts',
      'office',
      'whitelist',
      'bridge',         // v0.53.0 (F-052) で追加
      'quota',
      'chroma',
      'memory',
      'imageGen',
      'changelog',
    ]);
  });

  it('whitelist の直後に bridge が来る（Vault表示系の連続配置）', () => {
    const ids = TABS.map((t) => t.id);
    const wIdx = ids.indexOf('whitelist');
    const bIdx = ids.indexOf('bridge');
    expect(bIdx).toBe(wIdx + 1);
  });

  it('display() はヘッダーに 12 個のタブボタンを描画する', () => {
    const tab = new ClaudianBridgeSettingTab(
      makeApp() as never,
      { manifest: makeManifest() } as never,
      {} as never,
      async () => {},
    );
    try { tab.display(); } catch { /* render 失敗時も header は描画済み */ }
    const buttons = tab.containerEl.querySelectorAll('.cb-tab-btn');
    expect(buttons.length).toBe(12);
  });

  it('7 番目のタブボタンのラベルは 🌉 ブリッジ', () => {
    const tab = new ClaudianBridgeSettingTab(
      makeApp() as never,
      { manifest: makeManifest() } as never,
      {} as never,
      async () => {},
    );
    try { tab.display(); } catch { /* 同上 */ }
    const buttons = tab.containerEl.querySelectorAll('.cb-tab-btn');
    expect(buttons[6].textContent).toBe(getLocaleStrings('ja').tabBridge);
    expect(buttons[6].textContent).toContain('🌉');
  });

  it('初期表示は general タブが is-active', () => {
    const tab = new ClaudianBridgeSettingTab(
      makeApp() as never,
      { manifest: makeManifest() } as never,
      {} as never,
      async () => {},
    );
    try { tab.display(); } catch { /* 同上 */ }
    const active = tab.containerEl.querySelectorAll('.cb-tab-btn.is-active');
    expect(active.length).toBe(1);
    expect(active[0].textContent).toBe(getLocaleStrings('ja').tabGeneral);
  });
});