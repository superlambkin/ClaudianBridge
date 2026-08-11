// obsidian パッケージは型定義のみ（"main": ""）のため、vitest(Node 環境)では解決不能。
// 実装が実行時 import するシンボルのみをスタブとして提供する。

type El = HTMLElement;

function makeEl(): El {
  return {
    children: [],
    addClass() { return this; },
    removeClass() { return this; },
    hasClass() { return false; },
    toggleClass() { return this; },
    empty() { return this; },
    createEl(_tag: string, opts?: { text?: string; cls?: string; attr?: Record<string, string>; type?: string }): El {
      const e = makeEl();
      if (opts?.text) (e as unknown as { textContent: string }).textContent = opts.text;
      if (opts?.cls) (e as unknown as { className: string }).className = opts.cls;
      (e as unknown as { type?: string }).type = opts?.type;
      (this.children as El[]).push(e);
      return e;
    },
    createDiv(opts?: { text?: string; cls?: string; attr?: Record<string, string> }): El {
      return (this as unknown as { createEl: (t: string, o?: { text?: string; cls?: string; attr?: Record<string, string> }) => El }).createEl('div', opts);
    },
    createSpan(opts?: { text?: string; cls?: string }): El {
      return (this as unknown as { createEl: (t: string, o?: { text?: string; cls?: string }) => El }).createEl('span', opts);
    },
    appendText(_t: string) { return this; },
    appendChild(child: El) { (this.children as El[]).push(child); return child; },
    setText(t: string) { (this as unknown as { textContent: string }).textContent = t; return this; },
    setAttribute(_k: string, _v: string) { return this; },
    removeAttribute(_k: string) { return this; },
    remove() { return this; },
    setAttr(_k: string, _v: string) { return this; },
    addEventListener(_t: string, _h: (...a: unknown[]) => void) { return this; },
    removeEventListener(_t: string, _h: (...a: unknown[]) => void) { return this; },
    style: {} as CSSStyleDeclaration,
    classList: { add() { }, remove() { }, contains() { return false; }, toggle() { } },
  } as unknown as El;
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export class Plugin {
  app: App = new App();
  // No-op stubs for the chroma ribbon/command APIs
  addRibbonIcon(_icon: string, _title: string, _cb: () => void) { /* no-op */ }
  addCommand(_cmd: { id: string; name: string; callback: () => void }) { /* no-op */ }
  registerView(_type: string, _cb: (leaf: unknown) => unknown) { /* no-op */ }
}

export class App {
  vault = {
    adapter: {} as unknown,
    configDir: '.obsidian',
  };
  workspace = {
    getLeavesOfType(_t: string) { return []; },
    getRightLeaf(_f: boolean) { return null; },
    revealLeaf(_l: unknown) { /* no-op */ },
    on(_event: string, _cb: (...a: unknown[]) => void) { return {}; },
  };
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  setName(_n: string) { return this; }
  setDesc(_d: string) { return this; }
  addText(cb: (t: unknown) => unknown) { cb({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; }, inputEl: makeEl() }); return this; }
  addTextArea(cb: (t: unknown) => unknown) { cb({ setValue() { return this; }, onChange() { return this; } }); return this; }
  addToggle(cb: (t: unknown) => unknown) { cb({ setValue() { return this; }, onChange() { return this; } }); return this; }
  addDropdown(cb: (d: unknown) => unknown) { cb({ addOption() { return this; }, setValue() { return this; }, onChange() { return this; } }); return this; }
  addButton(cb: (b: unknown) => unknown) { cb({ setButtonText() { return this; }, setDisabled() { return this; }, onClick() { return this; } }); return this; }
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement = makeEl();

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }
}

// ── chroma-specific additions ───────────────────────────────────────────
export class WorkspaceLeaf {
  setViewState(_s: { type: string; active?: boolean }) { return Promise.resolve(); }
}

export class ItemView {
  containerEl: HTMLElement = makeEl();
  app: App;
  constructor(leaf: unknown) {
    this.app = new App();
    void leaf;
  }
  getViewType(): string { return ''; }
  getDisplayText(): string { return ''; }
  getIcon(): string { return ''; }
  async onOpen() { /* no-op */ }
  async onClose() { /* no-op */ }
}

export class Modal {
  app: App;
  containerEl: HTMLElement = makeEl();
  contentEl: HTMLElement = makeEl();
  titleEl: HTMLElement = makeEl();
  constructor(app: unknown) { this.app = (app as App) ?? new App(); }
  open() { /* no-op */ }
  close() { /* no-op */ }
  onOpen() { /* no-op */ }
  onClose() { /* no-op */ }
}

export class Component {
  // No-op stub
}

export class MarkdownRenderer {
  static render(_app: App, _md: string, _el: HTMLElement, _path: string, _c: Component) {
    return Promise.resolve();
  }
}

export function setIcon(_el: El, _icon: string) { /* no-op */ }
export function setText(el: El, text: string) { (el as unknown as { textContent: string }).textContent = text; }

// ── quota-feature mocks ────────────────────────────────────────────────
// fetch / spawn / fs / Platform のスタブ。tests/features/quota/* から利用される。

// === fetch ===
let fetchMock: ((input: RequestInfo, init?: RequestInit) => Promise<Response>) | null = null;

export function mockFetch(impl: typeof fetchMock): void {
  fetchMock = impl;
  (globalThis as { fetch?: typeof fetch }).fetch = impl as typeof fetch;
}

// === spawn ===
export interface SpawnMockResult {
  stdout: string;
  stderr?: string;
  exitCode?: number;
}

let spawnMock: ((cmd: string, args: string[]) => SpawnMockResult | Error) | null = null;

export function mockSpawn(impl: (cmd: string, args: string[]) => SpawnMockResult | Error): void {
  spawnMock = impl;
}

export function clearSpawnMock(): void { spawnMock = null; }

// === fs ===
let readFileMock: ((path: string) => string | Error) | null = null;

export function mockReadFile(impl: (path: string) => string | Error): void { readFileMock = impl; }
export function clearReadFileMock(): void { readFileMock = null; }

// === Platform ===
let mobileMode = false;
export function setMobileMode(value: boolean): void { mobileMode = value; }
export function getPlatformIsMobile(): boolean { return mobileMode; }

// === combined reset ===
export function resetMocks(): void {
  fetchMock = null;
  spawnMock = null;
  readFileMock = null;
  mobileMode = false;
  (globalThis as { fetch?: typeof fetch }).fetch = undefined;
}
