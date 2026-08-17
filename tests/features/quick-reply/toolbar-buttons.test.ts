// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupQuickReplyButtons } from '../../../src/features/quick-reply/toolbar-buttons';

const { sendToClaudian, setupRecommendDetectionMock } = vi.hoisted(() => ({
  sendToClaudian: vi.fn(async () => true),
  setupRecommendDetectionMock: vi.fn(),
}));

let capturedOnChange: ((option: number | null) => void) | null = null;

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
    setupRecommendDetectionMock.mockImplementation((_app: unknown, onChange: (o: number | null) => void) => {
      capturedOnChange = onChange;
      return () => {};
    });
  });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

  it('✅ ❌ 1️⃣〜5️⃣ が順に注入される', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const toolbar = addToolbar();
    const group = await waitForGroup(toolbar);
    const icons = Array.from(group.querySelectorAll('button')).map((b) => b.textContent);
    expect(icons).toEqual(['✅', '❌', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']);
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
    document.body.appendChild(document.createElement('div'));
    expect(toolbar.querySelectorAll('[data-cb-quickreply]')).toHaveLength(1);
    cleanup!();
    cleanup = undefined;
    expect(toolbar.querySelector('[data-cb-quickreply]')).toBeNull();
  });

  it('推奨方案が変わると該当ボタンに .is-recommended が付与・解除される', async () => {
    cleanup = setupQuickReplyButtons({} as never);
    const toolbar = addToolbar();
    const group = await waitForGroup(toolbar);

    // 推奨 = 方案3
    capturedOnChange?.(3);
    expect((group.querySelector('[data-cb-qr-3]') as HTMLElement).classList.contains('is-recommended')).toBe(true);
    expect((group.querySelector('[data-cb-qr-2]') as HTMLElement).classList.contains('is-recommended')).toBe(false);

    // 推奨なし
    capturedOnChange?.(null);
    expect((group.querySelector('[data-cb-qr-3]') as HTMLElement).classList.contains('is-recommended')).toBe(false);
  });
});
