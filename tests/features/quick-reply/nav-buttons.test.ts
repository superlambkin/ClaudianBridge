// @vitest-environment jsdom
// POC_017 / ClaudianBridge v0.29.1
// Design: 80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-30-quick-reply-nav-actions-design.md
// v0.29.1: ボタンを NewTab と同じ SVG アイコンスタイルに置換
// v0.55.1: F-021 修正 — 初期注入時の即時 renderGroup 呼び出しテスト追加
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupQuickReplyButtons } from '../../../src/features/quick-reply/nav-buttons';
import type { RecommendState } from '../../../src/features/quick-reply/recommend-detector';
import { ConfigStore } from '../../../src/core/config-store';
import type { ClaudianBridgeSettings } from '../../../src/core/settings';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS } from '../../../src/core/settings';

const { sendToClaudian, setupRecommendDetectionMock } = vi.hoisted(() => ({
  sendToClaudian: vi.fn(async () => true),
  setupRecommendDetectionMock: vi.fn(),
}));

let capturedOnChange: ((state: RecommendState) => void) | null = null;

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
  moment: { locale: () => 'ja' },
  // setIcon: Lucide icon を <svg class="lucide-${name}"> として挿入
  setIcon: (el: HTMLElement, name: string) => {
    el.innerHTML = `<svg class="lucide lucide-${name}" data-test-icon="${name}"></svg>`;
  },
}));

vi.mock('../../../src/features/quick-reply/core', () => ({
  sendToClaudian,
}));

vi.mock('../../../src/features/quick-reply/recommend-detector', () => ({
  setupRecommendDetection: setupRecommendDetectionMock,
}));

/** nav-actions 内に NewTab を持つツールバー風構造を作るヘルパー */
function addNavWithNewTab(opts: { newTabSelector?: string } = {}) {
  const nav = document.createElement('div');
  nav.className = 'claudian-input-nav-actions';
  const newTab = document.createElement('button');
  newTab.className = opts.newTabSelector ?? 'claudian-new-tab-btn';
  newTab.setAttribute('aria-label', 'New tab');
  nav.appendChild(newTab);
  document.body.appendChild(nav);
  return { nav, newTab };
}

async function waitForGroup(parent: HTMLElement): Promise<HTMLElement> {
  let group: Element | null = null;
  await vi.waitFor(() => {
    group = parent.querySelector('[data-cb-quickreply]');
    expect(group).not.toBeNull();
  });
  return group as unknown as HTMLElement;
}

/** ボタンの識別子リスト（OK/NG + 方案1〜5） */
const BUTTON_MARKS = ['ok', 'ng', '1', '2', '3', '4', '5'] as const;

/** ボタンの「アイコン名」識別（OK/NG = Lucide、方案 = custom number） */
function getIconSignature(btn: HTMLButtonElement): string {
  // OK/NG: Lucide icon を setIcon が挿入（data-test-icon 属性で識別）
  const lucide = btn.querySelector('[data-test-icon]');
  if (lucide) return lucide.getAttribute('data-test-icon') ?? '';
  // 方案: カスタム SVG（text 要素に数字）
  const text = btn.querySelector('svg text');
  if (text) return `number-${text.textContent}`;
  return '';
}

describe('setupQuickReplyButtons (nav-actions 配置)', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => {
    document.body.innerHTML = '';
    sendToClaudian.mockClear();
    setupRecommendDetectionMock.mockClear();
    capturedOnChange = null;
    setupRecommendDetectionMock.mockImplementation((_app: unknown, onChange: (s: RecommendState) => void) => {
      capturedOnChange = onChange;
      return () => {};
    });
  });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

  it('7 ボタンが順に注入される（OK/NG は SVG Lucide icon、方案1〜5 は SVG 数字バッジ）', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const buttons = Array.from(group.querySelectorAll('button'));
    expect(buttons.length).toBe(7);
    expect(buttons.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2', 'number-3', 'number-4', 'number-5',
    ]);
    // 初期状態では方案ボタンは hidden
    const visible = buttons.filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual(['check', 'x']);
  });

  it('各ボタンには SVG が含まれ、絵文字 text ノードは無い', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const buttons = Array.from(group.querySelectorAll('button')) as HTMLButtonElement[];
    for (const b of buttons) {
      // 各ボタンに SVG が 1 つ含まれる
      expect(b.querySelector('svg')).not.toBeNull();
      // ボタン直下のテキストノードは無し（SVG の text 要素内の数字は OK）
      const directText = Array.from(b.childNodes).filter((n) => n.nodeType === 3);
      expect(directText).toEqual([]);
    }
  });

  it('行が nav-actions 内の NewTab の左に配置される', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav, newTab } = addNavWithNewTab();
    const group = await waitForGroup(nav);

    const row = newTab.previousElementSibling as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.getAttribute('data-cb-quickreply-row')).toBe('true');
    expect(row.classList.contains('cb-quickreply-row')).toBe(true);
    expect(row.contains(group)).toBe(true);
  });

  it('クリックで正しい文言が送信される（OK / NG / 方案N）', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);

    (group.querySelector('[data-cb-qr-ok]') as HTMLButtonElement).click();
    (group.querySelector('[data-cb-qr-ng]') as HTMLButtonElement).click();
    (group.querySelector('[data-cb-qr-3]') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(sendToClaudian).toHaveBeenCalledTimes(3));
    expect(sendToClaudian.mock.calls.map((c) => c[1])).toEqual(['OK', 'NG', '方案3']);
  });

  it('cleanup で nav-actions から削除される', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    await waitForGroup(nav);
    expect(nav.querySelector('[data-cb-quickreply]')).not.toBeNull();
    cleanup!();
    cleanup = undefined;
    expect(nav.querySelector('[data-cb-quickreply]')).toBeNull();
  });

  it('NewTab 不在時は非注入', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const nav = document.createElement('div');
    nav.className = 'claudian-input-nav-actions';
    document.body.appendChild(nav);
    await vi.waitFor(() => {
      expect(nav.querySelector('[data-cb-quickreply]')).toBeNull();
    }, { timeout: 200 });
  });

  it('nav-actions 不在時は非注入', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    document.body.innerHTML = '';
    const toolbar = document.createElement('div');
    toolbar.className = 'claudian-input-toolbar';
    document.body.appendChild(toolbar);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-cb-quickreply]')).toBeNull();
      expect(document.querySelector('[data-cb-quickreply-row]')).toBeNull();
    }, { timeout: 200 });
  });

  it('aria-label="New tab" の NewTab を fallback 検出', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const nav = document.createElement('div');
    nav.className = 'claudian-input-nav-actions';
    const newTab = document.createElement('button');
    newTab.setAttribute('aria-label', 'New tab');
    nav.appendChild(newTab);
    document.body.appendChild(nav);
    const group = await waitForGroup(nav);
    expect(newTab.previousElementSibling).toBe(group.parentElement);
  });

  it('maxOptionCount=3 → 方案1〜3 表示、4〜5 非表示', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    capturedOnChange?.({ recommended: null, maxOptionCount: 3 });
    const visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2', 'number-3',
    ]);
  });

  it('maxOptionCount=7 → 5 を超える分はクランプ', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    capturedOnChange?.({ recommended: null, maxOptionCount: 7 });
    const visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2', 'number-3', 'number-4', 'number-5',
    ]);
  });

  it('選択肢あり → なし で 方案ボタンが再表示・再非表示', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    capturedOnChange?.({ recommended: null, maxOptionCount: 3 });
    let visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2', 'number-3',
    ]);
    capturedOnChange?.({ recommended: null, maxOptionCount: 0 });
    visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual(['check', 'x']);
  });

  it('推奨方案が変わると該当ボタンに .is-recommended が付与・解除', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    capturedOnChange?.({ recommended: 3, maxOptionCount: 5 });
    expect((group.querySelector('[data-cb-qr-3]') as HTMLElement).classList.contains('is-recommended')).toBe(true);
    expect((group.querySelector('[data-cb-qr-2]') as HTMLElement).classList.contains('is-recommended')).toBe(false);
    capturedOnChange?.({ recommended: null, maxOptionCount: 5 });
    expect((group.querySelector('[data-cb-qr-3]') as HTMLElement).classList.contains('is-recommended')).toBe(false);
  });

  it('NewTab が複数存在する場合は先頭のものを基準に挿入', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const nav = document.createElement('div');
    nav.className = 'claudian-input-nav-actions';
    const newTab1 = document.createElement('button');
    newTab1.className = 'claudian-new-tab-btn';
    const newTab2 = document.createElement('button');
    newTab2.className = 'claudian-new-tab-btn';
    nav.append(newTab1, newTab2);
    document.body.appendChild(nav);
    const group = await waitForGroup(nav);
    expect(newTab1.previousElementSibling).toBe(group.parentElement);
    expect(newTab2.previousElementSibling).not.toBe(group.parentElement);
  });
});

// v0.55.1 F-021 修正: 注入直後に showAll 設定を即時反映する
describe('setupQuickReplyButtons — F-021 即時 renderGroup（v0.55.1）', () => {
  let cleanup: (() => void) | undefined;

  // F-021 修正で loadShowAll() が依存するため、ConfigStore.prototype.load を
  // スタブ化する。既存 describe は実 ConfigStore 動作（defaults）を使うため
  // 影響しない。
  beforeEach(() => {
    document.body.innerHTML = '';
    sendToClaudian.mockClear();
    setupRecommendDetectionMock.mockClear();
    capturedOnChange = null;
    setupRecommendDetectionMock.mockImplementation((_app: unknown, onChange: (s: RecommendState) => void) => {
      capturedOnChange = onChange;
      return () => {};
    });
    cleanup = undefined;
  });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

  function stubLoad(general: { quickReplyShowAllOptions?: boolean; quickReplyEnabled?: boolean }): void {
    vi.spyOn(ConfigStore.prototype, 'load').mockReturnValue({
      ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS,
      general: {
        ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.general,
        quickReplyEnabled: general.quickReplyEnabled ?? true,
        quickReplyShowAllOptions: general.quickReplyShowAllOptions ?? false,
      },
    } as ClaudianBridgeSettings);
  }

  it('quickReplyShowAllOptions=true → 注入直後に方案 1〜5 が表示される（v0.55.1 修正）', async () => {
    stubLoad({ quickReplyShowAllOptions: true });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);

    // capturedOnChange を**呼ばない**（アシスタントメッセージ非到着状態の模擬）。
    // v0.55.1 修正により、inject 時点で方案 1〜5 が即時表示されているはず。
    // （修正前はこの状態で方案ボタンが cb-hidden のままだった）

    const visible = Array.from(group.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('cb-hidden'),
    );
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual([
      'check', 'x', 'number-1', 'number-2', 'number-3', 'number-4', 'number-5',
    ]);
  });

  it('quickReplyShowAllOptions=false（既定）→ 注入直後は方案ボタン hidden（既存挙動の回帰）', async () => {
    stubLoad({ quickReplyShowAllOptions: false });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);

    // capturedOnChange を呼ばない（アシスタントメッセージ非到着状態）

    const visible = Array.from(group.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('cb-hidden'),
    );
    expect(visible.map((b) => getIconSignature(b as HTMLButtonElement))).toEqual(['check', 'x']);
  });

  it('quickReplyEnabled=false → 注入自体が発生しない（既存挙動の回帰）', async () => {
    stubLoad({ quickReplyEnabled: false, quickReplyShowAllOptions: true });
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();

    await vi.waitFor(() => {
      expect(nav.querySelector('[data-cb-quickreply]')).toBeNull();
    }, { timeout: 200 });
  });
});

// BUTTON_MARKS を export することで型チェック用途にも使える
export { BUTTON_MARKS };