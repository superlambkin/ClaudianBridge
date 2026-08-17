// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupQuickReplyButtons } from '../../../src/features/quick-reply/toolbar-buttons';
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

function addToolbar() {
  const toolbar = document.createElement('div');
  toolbar.className = 'claudian-input-toolbar';
  document.body.appendChild(toolbar);
  return toolbar;
}

async function waitForGroup(toolbar: HTMLElement): Promise<HTMLElement> {
  let group: Element | null = null;
  await vi.waitFor(() => {
    group = toolbar.querySelector('[data-cb-quickreply]');
    expect(group).not.toBeNull();
  });
  return group as unknown as HTMLElement;
}

describe('setupQuickReplyButtons', () => {
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
    const toolbar = addToolbar();
    const group = await waitForGroup(toolbar);
    const icons = Array.from(group.querySelectorAll('button')).map((b) => b.textContent);
    expect(icons).toEqual(['✅', '❌', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']);
    // デフォルト（選択肢なし）: 方案ボタンは cb-hidden
    const visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌']);
  });

  it('クリックで正しい文言が送信される（OK / NG / 方案N）', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const toolbar = addToolbar();
    const group = await waitForGroup(toolbar);

    (group.querySelector('[data-cb-qr-ok]') as HTMLButtonElement).click();
    (group.querySelector('[data-cb-qr-ng]') as HTMLButtonElement).click();
    (group.querySelector('[data-cb-qr-3]') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(sendToClaudian).toHaveBeenCalledTimes(3));
    expect(sendToClaudian.mock.calls.map((c) => c[1])).toEqual(['OK', 'NG', '方案3']);
  });

  it('二重注入しない / cleanup で削除する', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const toolbar = addToolbar();
    await waitForGroup(toolbar);

    // 2 つ目のツールバーを追加 → observer の再注入パスが走るが、
    // 既存ツールバーには重複注入しない（各ツールバーにちょうど 1 グループ）
    const toolbar2 = addToolbar();
    await waitForGroup(toolbar2);

    expect(toolbar.querySelectorAll('[data-cb-quickreply]')).toHaveLength(1);
    expect(toolbar2.querySelectorAll('[data-cb-quickreply]')).toHaveLength(1);

    cleanup!();
    cleanup = undefined;
    expect(toolbar.querySelector('[data-cb-quickreply]')).toBeNull();
    expect(toolbar2.querySelector('[data-cb-quickreply]')).toBeNull();
  });

  it('maxOptionCount=3 → 1️⃣2️⃣3️⃣ 表示、4️⃣5️⃣ 非表示', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const toolbar = addToolbar();
    const group = await waitForGroup(toolbar);
    capturedOnChange?.({ recommended: null, maxOptionCount: 3 });
    const visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌', '1️⃣', '2️⃣', '3️⃣']);
  });

  it('maxOptionCount=7 → 5 を超える分はクランプされ 1️⃣〜5️⃣ まで表示', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const toolbar = addToolbar();
    const group = await waitForGroup(toolbar);
    capturedOnChange?.({ recommended: null, maxOptionCount: 7 });
    const visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']);
  });

  it('選択肢あり → なし で 方案ボタンが再表示・再非表示になる', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const toolbar = addToolbar();
    const group = await waitForGroup(toolbar);
    capturedOnChange?.({ recommended: null, maxOptionCount: 3 });
    let visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌', '1️⃣', '2️⃣', '3️⃣']);
    capturedOnChange?.({ recommended: null, maxOptionCount: 0 });
    visible = Array.from(group.querySelectorAll('button')).filter((b) => !b.classList.contains('cb-hidden'));
    expect(visible.map((b) => b.textContent)).toEqual(['✅', '❌']);
  });

  it('推奨方案が変わると該当ボタンに .is-recommended が付与・解除される', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const toolbar = addToolbar();
    const group = await waitForGroup(toolbar);
    capturedOnChange?.({ recommended: 3, maxOptionCount: 5 });
    expect((group.querySelector('[data-cb-qr-3]') as HTMLElement).classList.contains('is-recommended')).toBe(true);
    expect((group.querySelector('[data-cb-qr-2]') as HTMLElement).classList.contains('is-recommended')).toBe(false);
    capturedOnChange?.({ recommended: null, maxOptionCount: 5 });
    expect((group.querySelector('[data-cb-qr-3]') as HTMLElement).classList.contains('is-recommended')).toBe(false);
  });
});
