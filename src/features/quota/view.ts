import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import type { QuotaSnapshot } from './types';

export type QuotaColor = 'green' | 'orange' | 'red' | 'gray';

/** 使用率 → 信号色。null / 非有限値はグレー（データ無し） */
export function colorFor(util: number | null): QuotaColor {
  if (util === null || !Number.isFinite(util)) return 'gray';
  if (util >= 90) return 'red';
  if (util >= 70) return 'orange';
  return 'green';
}

/** ISO 文字列 → 残り時間の短縮表記（"3d 4h" / "2h45m" / "47m"） */
export function formatCountdown(resetsAt: string | null, nowMs?: number): string {
  if (!resetsAt) return '';
  const now = nowMs ?? Date.now();
  const target = new Date(resetsAt).getTime();
  if (Number.isNaN(target)) return '';
  const diffMs = target - now;
  if (diffMs <= 0) return '0m';

  const m = Math.floor(diffMs / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h${m % 60}m`;
  return `${m}m`;
}

/** 使用率の表示文字列。データ無しは "--" */
function pct(util: number | null): string {
  return util !== null ? `${util}%` : '--';
}

/**
 * span を生成して parent に追加する。
 * Obsidian の createSpan は HTMLElement へのランタイム拡張のため、
 * jsdom / ポップアウトウィンドウの両方で動く標準 DOM API を使う。
 */
function appendSpan(parent: HTMLElement, cls: string, text?: string): HTMLSpanElement {
  const el = parent.ownerDocument.createElement('span');
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

/** 入力欄の上に残量バーを表示するビュー */
export class QuotaBarView {
  private el: HTMLElement | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: QuotaSnapshot | null = null;

  mount(anchor: HTMLElement): void {
    if (this.el) return; // 冪等
    const parent = anchor.parentElement;
    if (!parent) return;

    const el = anchor.ownerDocument.createElement('div');
    el.className = 'claudian-quota-bar';
    el.setAttribute('data-status', 'idle');
    parent.insertBefore(el, anchor); // anchor の直前に挿入
    this.el = el;

    // 60 秒ごとのローカル tick（カウントダウンのみ再描画）
    this.tickTimer = setInterval(() => {
      if (this.lastSnapshot) this.render(this.lastSnapshot);
    }, 60_000);
  }

  unmount(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
    this.lastSnapshot = null;
  }

  render(snap: QuotaSnapshot): void {
    if (!this.el) return;
    this.lastSnapshot = snap;
    this.el.replaceChildren();
    this.el.setAttribute('data-status', snap.status);

    const s = getLocaleStrings(getUILanguage());

    if (snap.status === 'success') {
      this.renderSuccess(snap, s);
      return;
    }

    this.renderMessageState(snap.status, s);
  }

  private renderSuccess(snap: QuotaSnapshot, s: ReturnType<typeof getLocaleStrings>): void {
    const { fiveHour, sevenDay } = snap.windows;

    const main = appendSpan(this.el!, 'claudian-quota-bar__main');
    const dot = appendSpan(main, 'claudian-quota-bar__dot');
    dot.setAttribute('data-color', colorFor(fiveHour.utilization));
    appendSpan(main, 'claudian-quota-bar__label', s.quotaWindow5h);
    appendSpan(main, 'claudian-quota-bar__value', pct(fiveHour.utilization));
    const cd = formatCountdown(fiveHour.resetsAt);
    if (cd) appendSpan(main, 'claudian-quota-bar__countdown', `🕘 ${cd}`);

    const sub = appendSpan(this.el!, 'claudian-quota-bar__sub');
    appendSpan(sub, 'claudian-quota-bar__sub-label', s.quotaWindow7d);
    appendSpan(sub, 'claudian-quota-bar__value', pct(sevenDay.utilization));

    const btn = this.el!.ownerDocument.createElement('button');
    btn.className = 'claudian-quota-bar__refresh clickable-icon';
    btn.setAttribute('aria-label', s.quotaRefresh);
    btn.textContent = '↻';
    this.el!.appendChild(btn);
  }

  private renderMessageState(
    status: QuotaSnapshot['status'],
    s: ReturnType<typeof getLocaleStrings>,
  ): void {
    if (!this.el) return;

    const main = appendSpan(this.el, 'claudian-quota-bar__main');
    const dot = appendSpan(main, 'claudian-quota-bar__dot');
    const label = appendSpan(main, 'claudian-quota-bar__label');

    this.el.classList.toggle('claudian-quota-bar--pulse', status === 'fetching');

    switch (status) {
      case 'fetching':
        dot.setAttribute('data-color', 'gray');
        label.textContent = s.quotaFetching;
        break;
      case 'expired':
        dot.setAttribute('data-color', 'gray');
        label.textContent = `⚠ ${s.quotaNotLoggedIn}`;
        break;
      case 'error':
        dot.setAttribute('data-color', 'red');
        label.textContent = `❌ ${s.quotaError}`;
        break;
      case 'unsupported':
        dot.setAttribute('data-color', 'gray');
        label.textContent = s.quotaUnsupportedMobile;
        break;
      default:
        label.textContent = '';
    }

    const btn = this.el.ownerDocument.createElement('button');
    btn.className = 'claudian-quota-bar__refresh clickable-icon';
    btn.setAttribute('aria-label', s.quotaRefresh);
    btn.textContent = '↻';
    this.el.appendChild(btn);
  }
}
