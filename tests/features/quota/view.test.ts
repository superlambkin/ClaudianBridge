// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { QuotaBarView, colorFor } from '../../../src/features/quota/view';
import type { ProviderQuota } from '../../../src/features/quota/types';

function makeQuota(over: Partial<ProviderQuota> = {}): ProviderQuota {
  return { status: 'success', providerId: 'deepseek', label: 'DeepSeek', value: '¥110.00', pct: null, ...over };
}

describe('colorFor', () => {
  it('閾値で色分け', () => {
    expect(colorFor(10)).toBe('green');
    expect(colorFor(75)).toBe('orange');
    expect(colorFor(95)).toBe('red');
    expect(colorFor(null)).toBe('gray');
  });
});

describe('QuotaBarView', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  function mount(anchorCls = 'new-tab-btn') {
    const anchor = document.createElement('button');
    anchor.className = anchorCls;
    document.body.appendChild(anchor);
    const view = new QuotaBarView();
    view.mount(anchor);
    return { anchor, view };
  }

  it('mount で anchor の直前に挿入', () => {
    const { anchor } = mount();
    const bar = document.querySelector('.cb-quota-indicator')!;
    expect(bar).not.toBeNull();
    expect(bar.nextElementSibling).toBe(anchor);
  });

  it('render で label + value を表示', () => {
    const { view } = mount();
    view.render(makeQuota());
    const el = document.querySelector('.cb-quota-indicator')!;
    expect(el.querySelector('.cb-quota-indicator__label')?.textContent).toBe('DeepSeek');
    expect(el.querySelector('.cb-quota-indicator__value')?.textContent).toBe('¥110.00');
  });

  it('expired は ⚠ 表示', () => {
    const { view } = mount();
    view.render(makeQuota({ status: 'expired', value: '' }));
    expect(document.querySelector('.cb-quota-indicator__value')?.textContent).toBe('⚠');
  });

  it('unmount で除去', () => {
    const { view } = mount();
    view.unmount();
    expect(document.querySelector('.cb-quota-indicator')).toBeNull();
  });
});