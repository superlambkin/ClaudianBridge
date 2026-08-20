// @vitest-environment jsdom
// Task 7 (v0.27.0): edge-local エンジンの edgeTtsModulePath 横に 📂 ボタン（electron shell.openPath）が描画されることを検証
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Setting が呼ばれたときの button ハンドラを記録するストア
const buttonHandlers: Array<{
  text: string;
  tooltip: string | null;
  onClick: (() => void | Promise<void>) | null;
}> = [];

vi.mock('obsidian', () => {
  return {
    Notice: vi.fn(),
    moment: { locale: () => 'ja' },
    Setting: class {
      private _name = '';
      private _desc = '';
      constructor(_containerEl: HTMLElement) {}
      setName(n: string) { this._name = n; return this; }
      setDesc(d: string) { this._desc = d; return this; }
      setClass(_c: string) { return this; }
      addText(cb: (t: unknown) => unknown) {
        const t = {
          setPlaceholder: function () { return this; },
          setValue: function () { return this; },
          onChange: function () { return this; },
          inputEl: document.createElement('input'),
        };
        cb(t);
        return this;
      }
      addTextArea(cb: (t: unknown) => unknown) {
        const t = { setValue: function () { return this; }, onChange: function () { return this; } };
        cb(t);
        return this;
      }
      addToggle(cb: (t: unknown) => unknown) {
        const t = { setValue: function () { return this; }, onChange: function () { return this; } };
        cb(t);
        return this;
      }
      addDropdown(cb: (d: unknown) => unknown) {
        const d = {
          addOption: function () { return this; },
          setValue: function () { return this; },
          onChange: function () { return this; },
        };
        cb(d);
        return this;
      }
      addSlider(cb: (s: unknown) => unknown) {
        const s = {
          setLimits: function () { return this; },
          setValue: function () { return this; },
          setDynamicTooltip: function () { return this; },
          onChange: function () { return this; },
        };
        cb(s);
        return this;
      }
      addButton(cb: (b: unknown) => unknown) {
        const captured: { text: string; tooltip: string | null; onClick: (() => void | Promise<void>) | null } = {
          text: '',
          tooltip: null,
          onClick: null,
        };
        const builder = {
          setButtonText: (t: string) => { captured.text = t; return builder; },
          setTooltip: (t: string) => { captured.tooltip = t; return builder; },
          setDisabled: () => builder,
          onClick: (h: () => void | Promise<void>) => { captured.onClick = h; return builder; },
        };
        cb(builder);
        buttonHandlers.push(captured);
        return this;
      }
    },
  };
});

// electron shell.openPath をスタブ
// 注: 実装は require('electron') を使うため vi.mock だけでは intercept できない。
// `tests/setup-electron-stub.cjs`（vitest.config.ts の setupFiles）が
// globalThis.__cb_electron_mock__ 経由で live mock を返す Proxy を
// require.cache に注入し、各テストは global にモックを差し込む。
const openPathMock = vi.fn(async (_p: string) => '');

// addTextToTTS は test ボタンクリック時に実 TTS を走らせないよう no-op 化
vi.mock('../../src/features/tts/core', async () => {
  const actual = await vi.importActual<typeof import('../../src/features/tts/core')>(
    '../../src/features/tts/core',
  );
  return {
    ...actual,
    addTextToTTS: vi.fn(async () => true),
  };
});

import { renderTtsTab } from '../../src/settings/SettingTabTts';
import type { ConfigStore } from '../../src/core/config-store';
// vi.mock('obsidian', ...) で Notice は vi.fn() に置換済み。再度 import して
// モック参照を取得し、Notice が期待通り呼ばれたか検証できるようにする。
// （vitest の vi.mock は同モジュール内 import を全て同一モックへ binding する）
import { Notice } from 'obsidian';

function makeStore(overrides: { edgeTtsModulePath?: string } = {}): ConfigStore {
  const cfg = {
    tts: {
      enabled: true,
      engine: 'edge-local' as const,
      edgeTtsModulePath: overrides.edgeTtsModulePath ?? '/mock/path/to/edge_tts',
      voices: { edge: { zh: '', ja: '', en: '' }, webspeech: { zh: '', ja: '', en: '' } },
      plachta: { speaker: '', language: '日本語' as const, speed: 1.0 },
      cli: undefined,
      excludeCallouts: false,
      inputAi: { enabled: true },
      chunkMaxChars: { edge: 500, webspeech: 140, plachta: 140 },
      speechFilter: {
        selection: { emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false, callout: false, table: false, code: false, thinking: false, toolCommands: false },
        autoRead: { emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false, callout: false, table: false, code: false, thinking: false, toolCommands: false },
        message: { emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false, callout: false, table: false, code: false, thinking: false, toolCommands: false },
        inputAi: { emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false, callout: false, table: false, code: false, thinking: false, toolCommands: false },
      },
      autoRead: { enabled: true, scope: 'header' as const },
    },
  };
  return {
    load: () => cfg as never,
    save: vi.fn(),
    onSave: () => () => {},
  } as unknown as ConfigStore;
}

function makeApp(opts: { basePath?: string; exists?: boolean } = {}): {
  vault: { adapter: { basePath: string; exists: (p: string) => Promise<boolean> } };
} {
  const exists = opts.exists ?? true;
  return {
    vault: {
      adapter: {
        basePath: opts.basePath ?? '/mock/vault',
        exists: vi.fn(async (_p: string) => exists),
      },
    },
  };
}

/**
 * containerEl モック。SettingTabTts は Obsidian の HTMLElement API
 * (empty/createEl/createDiv/createSpan/createEl('table', ...)) を多用するため
 * jsdom 要素にこれらメソッドを追加し、子要素にも再帰的に伝播させる。
 */
function makeContainerEl(): HTMLElement {
  const enhance = (el: HTMLElement): HTMLElement => {
    const w = el as unknown as {
      empty: () => void;
      createEl: (tag: string, opts?: { text?: string; cls?: string; attr?: Record<string, string> }) => HTMLElement;
      createDiv: (opts?: { text?: string; cls?: string; attr?: Record<string, string> }) => HTMLElement;
      createSpan: (opts?: { text?: string; cls?: string }) => HTMLElement;
      setText: (t: string) => HTMLElement;
      setAttr: (k: string, v: string) => HTMLElement;
    };
    w.empty = () => {
      while (el.firstChild) el.removeChild(el.firstChild);
    };
    w.createEl = (tag: string, opts?: { text?: string; cls?: string; attr?: Record<string, string> }) => {
      const child = document.createElement(tag);
      if (opts?.text) child.textContent = opts.text;
      if (opts?.cls) child.className = opts.cls;
      if (opts?.attr) {
        for (const [k, v] of Object.entries(opts.attr)) child.setAttribute(k, v);
      }
      el.appendChild(child);
      return enhance(child);
    };
    w.createDiv = (opts?: { text?: string; cls?: string; attr?: Record<string, string> }) => w.createEl('div', opts);
    w.createSpan = (opts?: { text?: string; cls?: string }) => w.createEl('span', opts);
    w.setText = (t: string) => { el.textContent = t; return el; };
    w.setAttr = (k: string, v: string) => { el.setAttribute(k, v); return el; };
    return el;
  };
  return enhance(document.createElement('div'));
}

describe('SettingTabTts — 📂 ボタン (Task 7 / v0.27.0)', () => {
  beforeEach(() => {
    buttonHandlers.length = 0;
    openPathMock.mockReset();
    vi.mocked(Notice).mockClear();
    // stub 用にグローバル経由で electron モックを差し込む
    (globalThis as unknown as { __cb_electron_mock__: unknown }).__cb_electron_mock__ = {
      shell: { openPath: openPathMock },
    };
  });

  it('edge-local 選択時、edgeTtsModulePath 横に 📂 ボタンが描画される', () => {
    const containerEl = makeContainerEl();
    const store = makeStore({ edgeTtsModulePath: '/some/edge_tts' });
    renderTtsTab(makeApp() as never, containerEl, store);

    const folderBtn = buttonHandlers.find((b) => b.text === '📂');
    expect(folderBtn).toBeDefined();
    expect(typeof folderBtn?.onClick).toBe('function');
    // tooltip が設定される（Task 13 で i18n キー化されるまでは日本語フォールバック）
    expect(folderBtn?.tooltip).toBeTruthy();
  });

  it('📂 ボタンクリック時、shell.openPath が edgeTtsModulePath に対して呼ばれる', async () => {
    const configuredPath = '/custom/edge_tts_module';
    const containerEl = makeContainerEl();
    const store = makeStore({ edgeTtsModulePath: configuredPath });
    const app = makeApp({ exists: true });

    renderTtsTab(app as never, containerEl, store);

    const folderBtn = buttonHandlers.find((b) => b.text === '📂');
    expect(folderBtn).toBeDefined();
    expect(folderBtn?.onClick).toBeTypeOf('function');

    await folderBtn!.onClick!();

    expect(openPathMock).toHaveBeenCalledTimes(1);
    expect(openPathMock).toHaveBeenCalledWith(expect.stringContaining('edge_tts'));
    expect(openPathMock.mock.calls[0][0]).toBe(configuredPath);
  });

  it('edgeTtsModulePath が空のとき、pluginDir/py/edge_tts にフォールバックして shell.openPath を呼ぶ', async () => {
    const containerEl = makeContainerEl();
    const store = makeStore({ edgeTtsModulePath: '' });
    const app = makeApp({ basePath: '/mock/vault', exists: true });

    renderTtsTab(app as never, containerEl, store);

    const folderBtn = buttonHandlers.find((b) => b.text === '📂');
    await folderBtn!.onClick!();

    expect(openPathMock).toHaveBeenCalledTimes(1);
    const calledPath = openPathMock.mock.calls[0][0];
    expect(calledPath).toContain('edge_tts');
    // path.join により OS セパレータに依存せず 'edge_tts' を含む
    expect(calledPath.replace(/\\/g, '/')).toContain('/mock/vault/py/edge_tts');
  });

  it('モジュール場所が存在しない場合、shell.openPath は呼ばず Notice で通知', async () => {
    const configuredPath = '/missing/edge_tts';
    const containerEl = makeContainerEl();
    const store = makeStore({ edgeTtsModulePath: configuredPath });
    const app = makeApp({ exists: false });

    renderTtsTab(app as never, containerEl, store);

    const folderBtn = buttonHandlers.find((b) => b.text === '📂');
    await folderBtn!.onClick!();

    expect(openPathMock).not.toHaveBeenCalled();
    // Notice にモジュール未存在のメッセージ + displayPath を渡して通知していること
    // （silent failure 防止：Notice 呼び出しを忘れて return だけする実装を検知）
    expect(Notice).toHaveBeenCalledTimes(1);
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining(configuredPath));
  });

  it('engine !== edge-local のときは 📂 ボタンは描画されない', () => {
    const containerEl = makeContainerEl();
    const cfg = {
      tts: {
        enabled: true,
        engine: 'edge' as const,
        edgeTtsModulePath: '/some/path',
        voices: { edge: { zh: '', ja: '', en: '' }, webspeech: { zh: '', ja: '', en: '' } },
        plachta: undefined,
        cli: undefined,
        excludeCallouts: false,
        inputAi: { enabled: true },
        chunkMaxChars: { edge: 500, webspeech: 140, plachta: 140 },
        speechFilter: {
          selection: { emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false, callout: false, table: false, code: false, thinking: false, toolCommands: false },
          autoRead: { emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false, callout: false, table: false, code: false, thinking: false, toolCommands: false },
          message: { emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false, callout: false, table: false, code: false, thinking: false, toolCommands: false },
          inputAi: { emoji: false, kaomoji: false, ascii_emoticon: false, emoji_shortcode: false, callout: false, table: false, code: false, thinking: false, toolCommands: false },
        },
        autoRead: { enabled: true, scope: 'header' as const },
      },
    };
    const store = {
      load: () => cfg as never,
      save: vi.fn(),
      onSave: () => () => {},
    } as unknown as ConfigStore;

    renderTtsTab(makeApp() as never, containerEl, store);

    const folderBtn = buttonHandlers.find((b) => b.text === '📂');
    expect(folderBtn).toBeUndefined();
  });
});