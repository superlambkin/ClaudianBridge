import type { ProviderQuota } from './types';

export type QuotaColor = 'green' | 'orange' | 'red' | 'gray';

/** 使用率 → 信号色。null / 非有限値はグレー（データ無し） */
export function colorFor(pct: number | null): QuotaColor {
  if (pct === null || !Number.isFinite(pct)) return 'gray';
  if (pct >= 90) return 'red';
  if (pct >= 70) return 'orange';
  return 'green';
}

/**
 * NewTab ボタンの左隣に表示するコンパクトインジケータ (v0.4.0)。
 *
 * 旧 v0.3.0 の `claudian-quota-bar` は廃止。1 プロバイダ = 1 行で
 * ドット + ラベル + 値の最小構成。`MultiQuotaService.onUpdate` から
 * 渡される `ProviderQuota` をそのまま描画する。
 */
export class QuotaBarView {
  private el: HTMLElement | null = null;

  isMounted(): boolean {
    return this.el !== null;
  }

  isConnected(): boolean {
    return this.el?.isConnected ?? false;
  }

  mount(anchor: HTMLElement): void {
    if (this.el) return;
    const parent = anchor.parentElement;
    if (!parent) return;
    const el = anchor.ownerDocument.createElement('div');
    el.className = 'cb-quota-indicator';
    parent.insertBefore(el, anchor);
    this.el = el;
  }

  unmount(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  render(q: ProviderQuota | null): void {
    if (!this.el) return;
    this.el.replaceChildren();
    if (!q) {
      this.el.setAttribute('data-status', 'idle');
      return;
    }
    this.el.setAttribute('data-status', q.status);
    if (q.detail) this.el.title = q.detail;

    const dot = this.el.ownerDocument.createElement('span');
    dot.className = 'cb-quota-indicator__dot';
    dot.setAttribute('data-color', colorFor(q.pct));

    const label = this.el.ownerDocument.createElement('span');
    label.className = 'cb-quota-indicator__label';
    label.textContent = q.label;

    const value = this.el.ownerDocument.createElement('span');
    value.className = 'cb-quota-indicator__value';
    value.textContent =
      q.status === 'success' ? q.value : q.status === 'expired' ? '⚠' : '❌';

    this.el.append(dot, label, value);
  }
}