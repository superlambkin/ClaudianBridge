// @vitest-environment jsdom
// v0.55.0 (F-057): ClaudianBridgeSettingTab の TABS から 🌉 ブリッジ を削除。
//   - 11 タブ構成（bridge なし）になっていること
//   - タブ順序: general → network → ... → whitelist → quota → ... → changelog
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

// 旧 bridge タブが削除されたことの確認（v0.55.0 F-057）
const LEGACY_BRIDGE_IDS = ['bridge'];
const LEGACY_BRIDGE_LABEL_KEYS = ['tabBridge'];

function makeManifest() {
  return { id: 'ClaudianBridge', name: 'Claudian Bridge', version: '0.0.0' };
}

function makeApp() {
  return {
    vault: { adapter: { basePath: 'C:/test/vault' }, configDir: '.obsidian' },
    plugins: { plugins: {} },
  };
}

describe('F-057: ClaudianBridgeSettingTab TABS 構成（NAS ブリッジ削除後）', () => {
  it('TABS は 11 要素（bridge なし）', () => {
    expect(TABS.length).toBe(11);
  });

  it('TABS に bridge タブは存在しない', () => {
    const ids = TABS.map((t) => t.id);
    for (const legacy of LEGACY_BRIDGE_IDS) {
      expect(ids, `legacy id "${legacy}" still present`).not.toContain(legacy);
    }
  });

  it('TABS に tabBridge ラベルキーは存在しない', () => {
    const labelKeys = TABS.map((t) => t.labelKey);
    for (const legacy of LEGACY_BRIDGE_LABEL_KEYS) {
      expect(labelKeys, `legacy labelKey "${legacy}" still present`).not.toContain(legacy);
    }
  });

  it('タブ順序: general → network → ... → whitelist → quota → ... → changelog', () => {
    const ids = TABS.map((t) => t.id);
    expect(ids).toEqual([
      'general',
      'network',
      'selection',
      'tts',
      'office',
      'whitelist',
      // v0.55.0 (F-057): bridge タブ削除
      'quota',
      'chroma',
      'memory',
      'imageGen',
      'changelog',
    ]);
  });

  it('display() はヘッダーに 11 個のタブボタンを描画する', () => {
    const tab = new ClaudianBridgeSettingTab(
      makeApp() as never,
      { manifest: makeManifest() } as never,
      {} as never,
      async () => {},
    );
    try { tab.display(); } catch { /* render 失敗時も header は描画済み */ }
    const buttons = tab.containerEl.querySelectorAll('.cb-tab-btn');
    expect(buttons.length).toBe(11);
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