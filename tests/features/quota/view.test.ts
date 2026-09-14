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

  it('ツールチップに 値・残量・リセット時刻 を表示', () => {
    const { view } = mount();
    view.render(makeQuota({ remaining: '5,444', resetAt: 1787194106998 }));
    const el = document.querySelector('.cb-quota-indicator')!;
    expect(el.title).toContain('DeepSeek: ¥110.00');
    expect(el.title).toContain('Remaining: 5,444');
    expect(el.title).toContain('Reset:');
  });

  it('残量/リセット無しなら ツールチップは 値のみ', () => {
    const { view } = mount();
    view.render(makeQuota());
    const el = document.querySelector('.cb-quota-indicator')!;
    expect(el.title).toBe('DeepSeek: ¥110.00');
  });

  it('ツールチップは 現在 LLM の Quota を優先する（表示プロバイダと別でも）', () => {
    const { view } = mount();
    view.render(makeQuota({ providerId: 'kimi', label: 'Kimi', value: '42%', pct: 42 }));
    view.setCurrentLlmQuota(makeQuota({ providerId: 'zhipu', label: 'Zhipu', value: '45%', pct: 45, remaining: '5,444', resetAt: 1787194106998 }));
    const el = document.querySelector('.cb-quota-indicator')!;
    expect(el.title).toContain('Zhipu: 45%');
    expect(el.title).not.toContain('Kimi');
    expect(el.title).toContain('Remaining: 5,444');
  });

  it('現在 LLM 未設定なら 表示中プロバイダのデータを表示', () => {
    const { view } = mount();
    view.render(makeQuota({ providerId: 'kimi', label: 'Kimi', value: '42%', pct: 42 }));
    view.setCurrentLlmQuota(null);
    const el = document.querySelector('.cb-quota-indicator')!;
    expect(el.title).toContain('Kimi: 42%');
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

describe('QuotaBarView: Think モード バッジ (v0.39.0, F-039)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  function mount(anchorCls = 'new-tab-btn') {
    const anchor = document.createElement('button');
    anchor.className = anchorCls;
    document.body.appendChild(anchor);
    const view = new QuotaBarView();
    view.mount(anchor);
    return { anchor, view };
  }

  function makeQuota(over: Partial<ProviderQuota> = {}): ProviderQuota {
    return { status: 'success', providerId: 'deepseek', label: 'DeepSeek', value: '¥110.00', pct: null, ...over };
  }

  it('setThinking していないと バッジは描画されない', () => {
    const { view } = mount();
    view.render(makeQuota());
    expect(document.querySelector('.cb-think-badge')).toBeNull();
  });

  it('setThinking(null) は バッジを消去', () => {
    const { view } = mount();
    view.setThinking({ enabled: true, effort: 'medium' });
    view.render(makeQuota());
    expect(document.querySelector('.cb-think-badge')).not.toBeNull();
    view.setThinking(null);
    expect(document.querySelector('.cb-think-badge')).toBeNull();
  });

  it('enabled=true で バッジ ON 表示（cb-think-badge--on）', () => {
    const { view } = mount();
    view.render(makeQuota());
    view.setThinking({ enabled: true, effort: 'medium' });
    const badge = document.querySelector('.cb-think-badge')!;
    expect(badge).not.toBeNull();
    expect(badge.classList.contains('cb-think-badge--on')).toBe(true);
    expect(badge.classList.contains('cb-think-badge--off')).toBe(false);
    expect(badge.textContent).toBe('🧠 ON');
  });

  it('enabled=false で バッジ OFF 表示（cb-think-badge--off）', () => {
    const { view } = mount();
    view.render(makeQuota());
    view.setThinking({ enabled: false, effort: 'low' });
    const badge = document.querySelector('.cb-think-badge')!;
    expect(badge).not.toBeNull();
    expect(badge.classList.contains('cb-think-badge--off')).toBe(true);
    expect(badge.classList.contains('cb-think-badge--on')).toBe(false);
    expect(badge.textContent).toBe('🧠 OFF');
  });

  it('ツールチップは "Think Mode: <effort>" 形式（既定 locale=en）', () => {
    const { view } = mount();
    view.render(makeQuota());
    view.setThinking({ enabled: true, effort: 'high' });
    const badge = document.querySelector('.cb-think-badge')!;
    expect(badge.title).toBe('Think Mode: high');
  });

  it('effort=off のときも ツールチップに effort 値が出る', () => {
    const { view } = mount();
    view.render(makeQuota());
    view.setThinking({ enabled: false, effort: 'off' });
    const badge = document.querySelector('.cb-think-badge')!;
    expect(badge.title).toBe('Think Mode: off');
  });

  it('バッジは value/model の右隣に配置される', () => {
    const { view } = mount();
    view.setModel('deepseek-v4');
    view.render(makeQuota());
    view.setThinking({ enabled: true, effort: 'medium' });
    const el = document.querySelector('.cb-quota-indicator')!;
    const label = el.querySelector('.cb-quota-indicator__label')!;
    const value = el.querySelector('.cb-quota-indicator__value')!;
    const model = el.querySelector('.cb-quota-indicator__model')!;
    const badge = el.querySelector('.cb-think-badge')!;
    expect(el.children[0]).toBe(label);
    expect(el.children[1]).toBe(value);
    expect(el.children[2]).toBe(model);
    expect(el.children[3]).toBe(badge);
  });

  it('setThinking は 直前の Quota を再描画する', () => {
    const { view } = mount();
    view.render(makeQuota({ label: 'Claude', value: '40%', pct: 40 }));
    // setThinking 呼び出し時点で再描画 → バッジが反映される
    view.setThinking({ enabled: true, effort: 'medium' });
    const label = document.querySelector('.cb-quota-indicator__label')!;
    expect(label.textContent).toBe('Claude');
    expect(document.querySelector('.cb-think-badge')).not.toBeNull();
  });
});