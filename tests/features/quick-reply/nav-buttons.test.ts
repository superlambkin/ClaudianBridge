// @vitest-environment jsdom
// POC_017 / ClaudianBridge v0.29.0
// Design: 80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-08-30-quick-reply-nav-actions-design.md
// RED: this test imports from src/features/quick-reply/nav-buttons which does not exist yet.
// It will be created by Task 2. Tests are expected to FAIL with "Cannot find module".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupQuickReplyButtons } from '../../../src/features/quick-reply/nav-buttons';
import type { RecommendState } from '../../../src/features/quick-reply/recommend-detector';

const { sendToClaudian, setupRecommendDetectionMock } = vi.hoisted(() => ({
  sendToClaudian: vi.fn(async () => true),
  setupRecommendDetectionMock: vi.fn(),
}));

let capturedOnChange: ((state: RecommendState) => void) | null = null;

vi.mock('obsidian', () => ({
  Notice: class { constructor(_m: string) {} },
  moment: { locale: () => 'ja' },
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

  it('✅ ❌ 1️⃣〜5️⃣ が順に注入される（初期は方案ボタン非表示）', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    const icons = Array.from(group.querySelectorAll('button')).map((b) => b.textContent);
    expect(icons).toEqual(['✅', '❌', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']);
    const visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌']);
  });

  it('行が nav-actions 内の NewTab の左に配置される', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav, newTab } = addNavWithNewTab();
    const group = await waitForGroup(nav);

    // 行（data-cb-quickreply-row）は NewTab の前の要素
    const row = newTab.previousElementSibling as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.getAttribute('data-cb-quickreply-row')).toBe('true');
    expect(row.classList.contains('cb-quickreply-row')).toBe(true);

    // グループは行の中に含まれる
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

    // scan は即座に呼ばれるため、待機せず確認
    await vi.waitFor(() => {
      // MutationObserver の非同期性を考慮して 1 フレーム待機
      expect(nav.querySelector('[data-cb-quickreply]')).toBeNull();
    }, { timeout: 200 });
  });

  it('nav-actions 不在時は非注入', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    // nav-actions を一切作成しない
    document.body.innerHTML = '';

    // 既存ツールバーがあっても無視される（旧実装との互換性切断）
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
    // クラス無し・aria-label のみで NewTab を表現（旧 realclaudian 互換）
    const nav = document.createElement('div');
    nav.className = 'claudian-input-nav-actions';
    const newTab = document.createElement('button');
    newTab.setAttribute('aria-label', 'New tab');
    nav.appendChild(newTab);
    document.body.appendChild(nav);

    const group = await waitForGroup(nav);
    expect(newTab.previousElementSibling).toBe(group.parentElement);
  });

  it('maxOptionCount=3 → 1️⃣2️⃣3️⃣ 表示、4️⃣5️⃣ 非表示', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    capturedOnChange?.({ recommended: null, maxOptionCount: 3 });
    const visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌', '1️⃣', '2️⃣', '3️⃣']);
  });

  it('maxOptionCount=7 → 5 を超える分はクランプ', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    capturedOnChange?.({ recommended: null, maxOptionCount: 7 });
    const visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']);
  });

  it('選択肢あり → なし で 方案ボタンが再表示・再非表示', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const { nav } = addNavWithNewTab();
    const group = await waitForGroup(nav);
    capturedOnChange?.({ recommended: null, maxOptionCount: 3 });
    let visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌', '1️⃣', '2️⃣', '3️⃣']);
    capturedOnChange?.({ recommended: null, maxOptionCount: 0 });
    visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌']);
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
    // nav-actions 内に NewTab が 2 つある異常系（querySelector は先頭一致）
    const nav = document.createElement('div');
    nav.className = 'claudian-input-nav-actions';
    const newTab1 = document.createElement('button');
    newTab1.className = 'claudian-new-tab-btn';
    const newTab2 = document.createElement('button');
    newTab2.className = 'claudian-new-tab-btn';
    nav.append(newTab1, newTab2);
    document.body.appendChild(nav);

    const group = await waitForGroup(nav);
    // クイック返信行は newTab1 の左（=先頭 NewTab の左）に挿入される
    expect(newTab1.previousElementSibling).toBe(group.parentElement);
    // newTab2 の左ではない（querySelector は先頭一致のため）
    expect(newTab2.previousElementSibling).not.toBe(group.parentElement);
  });
});