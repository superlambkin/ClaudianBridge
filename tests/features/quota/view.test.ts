/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { colorFor, formatCountdown, QuotaBarView } from '../../../src/features/quota/view';
import type { QuotaSnapshot } from '../../../src/features/quota/types';
import { getLocaleStrings } from '../../../src/core/i18n';

describe('colorFor', () => {
  it('<70 → green', () => expect(colorFor(0)).toBe('green'));
  it('69 → green', () => expect(colorFor(69)).toBe('green'));
  it('70 → orange', () => expect(colorFor(70)).toBe('orange'));
  it('89 → orange', () => expect(colorFor(89)).toBe('orange'));
  it('90 → red', () => expect(colorFor(90)).toBe('red'));
  it('100 → red', () => expect(colorFor(100)).toBe('red'));
  it('null → gray', () => expect(colorFor(null)).toBe('gray'));
});

describe('formatCountdown', () => {
  const now = Date.now();

  it('null → 空文字', () => expect(formatCountdown(null, now)).toBe(''));

  it('負数 → "0m"', () => {
    const past = new Date(now - 60_000).toISOString();
    expect(formatCountdown(past, now)).toBe('0m');
  });

  it('47 分後 → "47m"', () => {
    const future = new Date(now + 47 * 60_000).toISOString();
    expect(formatCountdown(future, now)).toBe('47m');
  });

  it('2 時間 45 分後 → "2h45m"', () => {
    const future = new Date(now + (2 * 60 + 45) * 60_000).toISOString();
    expect(formatCountdown(future, now)).toBe('2h45m');
  });

  it('3 日 4 時間後 → "3d 4h"', () => {
    const future = new Date(now + (3 * 24 + 4) * 60 * 60_000).toISOString();
    expect(formatCountdown(future, now)).toBe('3d 4h');
  });
});

describe('QuotaBarView', () => {
  let container: HTMLElement;
  let view: QuotaBarView | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.className = 'claudian-input-wrapper';
    document.body.appendChild(container);
    view = new QuotaBarView();
  });

  // mount した tick タイマーを必ず止める（テストプロセスに interval を残さない）
  afterEach(() => {
    view?.unmount();
    view = null;
    document.body.innerHTML = '';
  });

  it('mount で .claudian-quota-bar が生成される', () => {
    view!.mount(container);
    expect(container.parentElement?.querySelector('.claudian-quota-bar')).not.toBeNull();
  });

  it('mount 二重呼び出しは冪等', () => {
    view!.mount(container);
    view!.mount(container);
    expect(container.parentElement?.querySelectorAll('.claudian-quota-bar').length).toBe(1);
  });

  it('unmount で DOM 除去', () => {
    view!.mount(container);
    view!.unmount();
    expect(container.parentElement?.querySelector('.claudian-quota-bar')).toBeNull();
  });

  it('render(success+62%) → data-color="green" + テキスト 62%', () => {
    const snap: QuotaSnapshot = {
      status: 'success',
      windows: {
        fiveHour: { utilization: 62, resetsAt: '2099-01-01T00:00:00Z' },
        sevenDay: { utilization: 10, resetsAt: '2099-01-01T00:00:00Z' },
      },
      extraUsage: null,
      fetchedAt: Date.now(),
      tokenSource: 'file',
    };
    view!.mount(container);
    view!.render(snap);

    const bar = container.parentElement?.querySelector('.claudian-quota-bar');
    expect(bar?.getAttribute('data-status')).toBe('success');
    expect(bar?.querySelector('[data-color="green"]')).not.toBeNull();
    expect(bar?.textContent).toContain('62%');
  });

  it('render(expired) → data-status="expired"', () => {
    const snap: QuotaSnapshot = {
      status: 'expired',
      windows: {
        fiveHour: { utilization: null, resetsAt: null },
        sevenDay: { utilization: null, resetsAt: null },
      },
      extraUsage: null,
      fetchedAt: Date.now(),
      tokenSource: 'none',
    };
    view!.mount(container);
    view!.render(snap);

    const bar = container.parentElement?.querySelector('.claudian-quota-bar');
    expect(bar?.getAttribute('data-status')).toBe('expired');
  });

  it('render(error) → i18n 文案を表示', () => {
    const s = getLocaleStrings('en');
    const snap: QuotaSnapshot = {
      status: 'error',
      windows: {
        fiveHour: { utilization: null, resetsAt: null },
        sevenDay: { utilization: null, resetsAt: null },
      },
      extraUsage: null,
      fetchedAt: Date.now(),
      tokenSource: 'none',
    };
    view!.mount(container);
    view!.render(snap);

    const bar = container.parentElement?.querySelector('.claudian-quota-bar');
    expect(bar?.textContent).toContain(s.quotaError);
    expect(bar?.querySelector('[data-color="red"]')).not.toBeNull();
  });

  it('render(fetching) → i18n 文案を表示', () => {
    const s = getLocaleStrings('en');
    const snap: QuotaSnapshot = {
      status: 'fetching',
      windows: {
        fiveHour: { utilization: null, resetsAt: null },
        sevenDay: { utilization: null, resetsAt: null },
      },
      extraUsage: null,
      fetchedAt: Date.now(),
      tokenSource: 'none',
    };
    view!.mount(container);
    view!.render(snap);

    const bar = container.parentElement?.querySelector('.claudian-quota-bar');
    expect(bar?.textContent).toContain(s.quotaFetching);
    expect(bar?.classList.contains('claudian-quota-bar--pulse')).toBe(true);
  });

  it('render(unsupported) → i18n 文案を表示', () => {
    const s = getLocaleStrings('en');
    const snap: QuotaSnapshot = {
      status: 'unsupported',
      windows: {
        fiveHour: { utilization: null, resetsAt: null },
        sevenDay: { utilization: null, resetsAt: null },
      },
      extraUsage: null,
      fetchedAt: Date.now(),
      tokenSource: 'none',
    };
    view!.mount(container);
    view!.render(snap);

    const bar = container.parentElement?.querySelector('.claudian-quota-bar');
    expect(bar?.textContent).toContain(s.quotaUnsupportedMobile);
  });
});
