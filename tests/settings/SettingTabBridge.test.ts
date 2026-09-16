// @vitest-environment jsdom
// v0.53.0 (F-052): renderBridgeTab が本体設定のサブタブとして動作することを確認
//   - h2 見出し（folderBridge）
//   - 説明文
//   - 空メッセージ → ＋ 追加 ボタン
//   - ブリッジ行（toggle / 編集 / 削除）
//   - Plugin API（saveSettings / restartBridges / disableBridge）の呼び出し
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Setting モック — addButton / addToggle でハンドラを記録
type ButtonBuilder = {
  setButtonText: (t: string) => ButtonBuilder;
  setCta: () => ButtonBuilder;
  setWarning: () => ButtonBuilder;
  onClick: (cb: () => void) => ButtonBuilder;
};
type ToggleBuilder = {
  setValue: (v: boolean) => ToggleBuilder;
  onChange: (cb: (v: boolean) => void | Promise<void>) => ToggleBuilder;
};

const buttonHandlers: Array<{ text: string; onClick: (() => void) | null; isCta: boolean; isWarning: boolean }> = [];
const toggleHandlers: Array<{ value: boolean; onChange: ((v: boolean) => Promise<void> | void) | null }> = [];

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
    private container: HTMLElement;
    constructor(c: HTMLElement) { this.container = c; }
    addButton(cb: (b: ButtonBuilder) => void) {
      const captured = { text: '', onClick: null as (() => void) | null, isCta: false, isWarning: false };
      const b = {
        setButtonText: (t: string) => { captured.text = t; return b; },
        setCta: () => { captured.isCta = true; return b; },
        setWarning: () => { captured.isWarning = true; return b; },
        onClick: (cb: () => void) => { captured.onClick = cb; return b; },
      };
      cb(b);
      buttonHandlers.push(captured);
      return this;
    }
    addToggle(cb: (t: ToggleBuilder) => void) {
      const captured = { value: false, onChange: null as ((v: boolean) => Promise<void> | void) | null };
      const t = {
        setValue: (v: boolean) => { captured.value = v; return t; },
        onChange: (cb: (v: boolean) => Promise<void> | void) => { captured.onChange = cb; return t; },
      };
      cb(t);
      toggleHandlers.push(captured);
      return this;
    }
  },
  Modal: class { constructor(_app: unknown) {} open() {} close() {} },
}));

beforeAll(() => {
  HTMLElement.prototype.empty = function (this: HTMLElement) { this.innerHTML = ''; return this; } as never;
  HTMLElement.prototype.createEl = function (this: HTMLElement, tag: string, o?: { text?: string; attr?: Record<string, string> }) {
    const e = document.createElement(tag);
    if (o?.attr) for (const [k, v] of Object.entries(o.attr)) e.setAttribute(k, v);
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

beforeEach(() => {
  buttonHandlers.length = 0;
  toggleHandlers.length = 0;
  document.body.innerHTML = '';
});

import { renderBridgeTab } from '../../src/settings/SettingTabBridge';

function makePlugin(opts: { bridges?: unknown[]; enabled?: boolean } = {}) {
  const bridges = opts.bridges ?? [];
  const calls = { saveSettings: 0, restartBridges: 0, disableBridge: 0 };
  const cfg = {
    general: {
      folderBridges: bridges,
      enabled: opts.enabled ?? true,
    },
  };
  return {
    calls,
    cfg,
    getSettings: vi.fn(() => cfg),
    saveSettings: vi.fn(async () => { calls.saveSettings++; }),
    restartBridges: vi.fn(() => { calls.restartBridges++; }),
    disableBridge: vi.fn((_id: string, _b?: unknown) => { calls.disableBridge++; }),
    app: {} as unknown,
  };
}

describe('F-052: renderBridgeTab', () => {
  it('Plugin 未取得時はエラーメッセージを表示する', () => {
    const container = document.createElement('div');
    const app = { plugins: { plugins: {} } };
    renderBridgeTab(app as never, container, {} as never, undefined, undefined, undefined);
    expect(container.textContent).toContain('ClaudianBridge プラグインインスタンスが取得できませんでした');
  });

  it('ブリッジ 0 件時は空メッセージと「＋ 追加」ボタンを描画する', () => {
    const container = document.createElement('div');
    const plugin = makePlugin();
    renderBridgeTab({} as never, container, {} as never, undefined, undefined, undefined, plugin as never);

    // h2 見出し
    expect(container.querySelector('h2')?.textContent).toContain('ブリッジ');
    // 空メッセージ
    expect(container.textContent).toContain('まだブリッジがありません');
    // ＋ 追加ボタン
    const addBtn = buttonHandlers.find((b) => b.text.includes('ブリッジ追加'));
    expect(addBtn).toBeDefined();
    expect(addBtn?.isCta).toBe(true);
  });

  it('ブリッジ 1 件存在時は行を描画し、toggle / 編集 / 削除ボタンを提供する', () => {
    const bridge = {
      id: 'b1',
      linkName: 'docs',
      vaultSubpath: '10_Input',
      externalPath: 'C:/nas/docs',
      enabled: true,
      shadowPath: '/tmp/shadow/b1',
      excludePatterns: [],
      syncDirection: 'nas_to_shadow',
      createdAt: 0,
      updatedAt: 0,
    };
    const container = document.createElement('div');
    const plugin = makePlugin({ bridges: [bridge] });
    renderBridgeTab({} as never, container, {} as never, undefined, undefined, undefined, plugin as never);

    // 行ラベル
    expect(container.textContent).toContain('🌉 10_Input/docs');
    expect(container.textContent).toContain('C:/nas/docs');
    // 1 行 = 1 トグル + 1 行内 + 末尾 ＋ 追加ボタン（合計 toggleHandlers 1, buttonHandlers 3）
    expect(toggleHandlers.length).toBe(1);
    expect(toggleHandlers[0].value).toBe(true);
    const editBtn = buttonHandlers.find((b) => b.text === '編集');
    const deleteBtn = buttonHandlers.find((b) => b.text === '削除');
    expect(editBtn).toBeDefined();
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn?.isWarning).toBe(true);
  });

  it('toggle をオフにすると saveSettings と restartBridges が呼ばれる', async () => {
    const bridge = {
      id: 'b1', linkName: 'docs', vaultSubpath: '10_Input', externalPath: 'C:/nas/docs',
      enabled: true, shadowPath: '/tmp/b1', excludePatterns: [], syncDirection: 'nas_to_shadow',
      createdAt: 0, updatedAt: 0,
    };
    const container = document.createElement('div');
    const plugin = makePlugin({ bridges: [bridge] });
    renderBridgeTab({} as never, container, {} as never, undefined, undefined, undefined, plugin as never);

    const toggle = toggleHandlers[0];
    expect(toggle.onChange).toBeDefined();
    await toggle.onChange!(false);

    expect(plugin.calls.saveSettings).toBe(1);
    expect(plugin.calls.restartBridges).toBe(1);
    expect((plugin.cfg.general.folderBridges as Array<{ id: string; enabled: boolean }>)[0].enabled).toBe(false);
  });

  it('削除ボタンは plugin.disableBridge と saveSettings を呼ぶ', async () => {
    const bridge = {
      id: 'b1', linkName: 'docs', vaultSubpath: '10_Input', externalPath: 'C:/nas/docs',
      enabled: true, shadowPath: '/tmp/b1', excludePatterns: [], syncDirection: 'nas_to_shadow',
      createdAt: 0, updatedAt: 0,
    };
    const container = document.createElement('div');
    const plugin = makePlugin({ bridges: [bridge] });
    renderBridgeTab({} as never, container, {} as never, undefined, undefined, undefined, plugin as never);

    const deleteBtn = buttonHandlers.find((b) => b.text === '削除');
    expect(deleteBtn?.onClick).toBeDefined();
    // confirm をモック
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    await deleteBtn!.onClick!();

    expect(plugin.calls.disableBridge).toBe(1);
    expect(plugin.calls.saveSettings).toBe(1);
    expect(plugin.calls.restartBridges).toBe(1);
    expect((plugin.cfg.general.folderBridges as unknown[]).length).toBe(0);
  });

  it('confirm キャンセル時は disableBridge / saveSettings を呼ばない', async () => {
    const bridge = {
      id: 'b1', linkName: 'docs', vaultSubpath: '10_Input', externalPath: 'C:/nas/docs',
      enabled: true, shadowPath: '/tmp/b1', excludePatterns: [], syncDirection: 'nas_to_shadow',
      createdAt: 0, updatedAt: 0,
    };
    const container = document.createElement('div');
    const plugin = makePlugin({ bridges: [bridge] });
    renderBridgeTab({} as never, container, {} as never, undefined, undefined, undefined, plugin as never);

    const deleteBtn = buttonHandlers.find((b) => b.text === '削除');
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    await deleteBtn!.onClick!();

    expect(plugin.calls.disableBridge).toBe(0);
    expect(plugin.calls.saveSettings).toBe(0);
  });
});