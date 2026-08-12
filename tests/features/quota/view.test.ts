// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { QuotaBarView, colorFor, colorForBalance, colorToLevel } from '../../../src/features/quota/view';
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

describe('colorForBalance', () => {
  it('100以上は緑（安全）', () => {
    expect(colorForBalance(100)).toBe('green');
    expect(colorForBalance(150)).toBe('green');
  });
  it('50超〜100未満は橙（注意）', () => {
    expect(colorForBalance(99)).toBe('orange');
    expect(colorForBalance(51)).toBe('orange');
  });
  it('50以下は赤（危険）', () => {
    expect(colorForBalance(50)).toBe('red');
    expect(colorForBalance(0)).toBe('red');
  });
  it('null はグレー', () => {
    expect(colorForBalance(null)).toBe('gray');
    expect(colorForBalance(undefined)).toBe('gray');
  });
});

describe('colorToLevel', () => {
  it('green→safe, orange→caution, red→danger, gray→unknown', () => {
    expect(colorToLevel('green')).toBe('safe');
    expect(colorToLevel('orange')).toBe('caution');
    expect(colorToLevel('red')).toBe('danger');
    expect(colorToLevel('gray')).toBe('unknown');
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

  it('ドットは描画されない', () => {
    const { view } = mount();
    view.render(makeQuota());
    expect(document.querySelector('.cb-quota-indicator__dot')).toBeNull();
  });

  it('DeepSeek 残金 0 は値に data-level=danger', () => {
    const { view } = mount();
    view.render(makeQuota({ balance: 0, value: '¥0.00', zeroBalance: true }));
    const value = document.querySelector('.cb-quota-indicator__value');
    expect(value?.getAttribute('data-level')).toBe('danger');
  });

  it('DeepSeek 残金 120 は値に data-level=safe', () => {
    const { view } = mount();
    view.render(makeQuota({ balance: 120, value: '¥120.00' }));
    const value = document.querySelector('.cb-quota-indicator__value');
    expect(value?.getAttribute('data-level')).toBe('safe');
  });

  it('KIMI 使用率 95% は値に data-level=danger', () => {
    const { view } = mount();
    view.render(makeQuota({ providerId: 'kimi', label: 'Kimi', value: '95%', pct: 95, balance: undefined }));
    const value = document.querySelector('.cb-quota-indicator__value');
    expect(value?.getAttribute('data-level')).toBe('danger');
  });

  it('setModel で ラベル→値→モデル の順に表示', () => {
    const { view } = mount();
    view.setModel('deepseek-v4-flash[1M]');
    view.render(makeQuota());
    const el = document.querySelector('.cb-quota-indicator')!;
    const label = el.querySelector('.cb-quota-indicator__label');
    const model = el.querySelector('.cb-quota-indicator__model');
    const value = el.querySelector('.cb-quota-indicator__value');
    expect(model?.textContent).toBe('deepseek-v4-flash[1M]');
    // 表示順: ラベル → 値 → モデル
    expect(el.children[0]).toBe(label);
    expect(el.children[1]).toBe(value);
    expect(el.children[2]).toBe(model);
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