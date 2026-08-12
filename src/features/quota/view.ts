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
 * DeepSeek 残金（CNY）→ 信号色。
 * 100以上 = 緑（安全）、50超〜100未満 = 橙（注意）、50以下 = 赤（危険）。
 */
export function colorForBalance(balance: number | null | undefined): QuotaColor {
  if (balance === null || balance === undefined || !Number.isFinite(balance)) return 'gray';
  if (balance >= 100) return 'green';
  if (balance > 50) return 'orange';
  return 'red';
}

/** QuotaColor を CSS data-level に変換する補助 */
export function colorToLevel(c: QuotaColor): 'safe' | 'caution' | 'danger' | 'unknown' {
  if (c === 'green') return 'safe';
  if (c === 'orange') return 'caution';
  if (c === 'red') return 'danger';
  return 'unknown';
}

/**
 * NewTab ボタンの左隣に表示するコンパクトインジケータ (v0.4.0)。
 *
 * 旧 v0.3.0 の `claudian-quota-bar` は廃止。1 プロバイダ = 1 行で
 * ドット + ラベル + 値の最小構成。`MultiQuotaService.onUpdate` から
 * 渡される `ProviderQuota` をそのまま描画する。
 *
 * v0.5.0: 現在使用中モデル（LLM 検出結果）をラベルの左隣に表示する。
 */
export class QuotaBarView {
  private el: HTMLElement | null = null;
  private model: string | null = null;

  isMounted(): boolean {
    return this.el !== null;
  }

  isConnected(): boolean {
    return this.el?.isConnected ?? false;
  }

  /** 現在使用中モデルを設定（ラベルの左隣に表示） */
  setModel(model: string | null): void {
    this.model = model;
    this.renderCurrent();
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

  private renderCurrent(): void {
    if (!this.el) return;
    const q = this.lastQuota;
    if (q) this.render(q);
  }

  private lastQuota: ProviderQuota | null = null;

  render(q: ProviderQuota | null): void {
    this.lastQuota = q;
    if (!this.el) return;
    this.el.replaceChildren();
    if (!q) {
      this.el.setAttribute('data-status', 'idle');
      return;
    }
    this.el.setAttribute('data-status', q.status);
    if (q.detail) this.el.title = q.detail;

    const label = this.el.ownerDocument.createElement('span');
    label.className = 'cb-quota-indicator__label';
    label.textContent = q.label;

    const value = this.el.ownerDocument.createElement('span');
    value.className = 'cb-quota-indicator__value';
    value.textContent =
      q.status === 'success' ? q.value : q.status === 'expired' ? '⚠' : '❌';
    // 値に色レベルを付与（CSS で 3 色 + 太字）
    const valueColor = q.providerId === 'deepseek' && q.balance !== undefined
      ? colorForBalance(q.balance)
      : colorFor(q.pct);
    value.setAttribute('data-level', colorToLevel(valueColor));

    // 表示順: プロバイダー → 値 → 現在モデル
    if (this.model) {
      const model = this.el.ownerDocument.createElement('span');
      model.className = 'cb-quota-indicator__model';
      model.textContent = this.model;
      this.el.append(label, value, model);
    } else {
      this.el.append(label, value);
    }
  }
}