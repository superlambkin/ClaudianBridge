export interface TokenRateState {
  startTime: number | null;
  startChars: number;
  currentChars: number;
  lastUpdateTime: number;
  lastTokens: number;
  rate: number;
  avgRate: number;
  maxRate: number;
  ttftMs: number | null;
  isStreaming: boolean;
}

export interface CounterOptions {
  charPerToken?: number;
  intervalMs?: number;
  fadeOutMs?: number;
  /** 指定時は containerEl 末尾ではなくこの要素の直後に .cb-token-rate を挿入する */
  insertAfter?: Element | null;
  /** 指定時はこの要素の直前に .cb-token-rate を挿入する（insertAfter より優先） */
  insertBefore?: Element | null;
}

const DEFAULTS: Required<CounterOptions> = {
  charPerToken: 3,
  intervalMs: 500,
  fadeOutMs: 3000,
  insertAfter: null,
  insertBefore: null,
};

export function createTokenRateCounter(
  containerEl: HTMLElement,
  options: CounterOptions = {},
) {
  const opts = { ...DEFAULTS, ...options };
  const state: TokenRateState = {
    startTime: null,
    startChars: 0,
    currentChars: 0,
    lastUpdateTime: 0,
    lastTokens: 0,
    rate: 0,
    avgRate: 0,
    maxRate: 0,
    ttftMs: null,
    isStreaming: false,
  };

  const el = document.createElement('div');
  el.className = 'cb-token-rate';
  el.innerHTML =
    '<span class="cb-token-rate-ttft">首 0.0s</span>' +
    '<span class="cb-token-rate-sep">·</span>' +
    '<span class="cb-token-rate-label">現在</span>' +
    '<span class="cb-token-rate-value">0.0</span>' +
    '<span class="cb-token-rate-unit">tok/s</span>' +
    '<span class="cb-token-rate-sep">·</span>' +
    '<span class="cb-token-rate-avg">平均 0.0 tok/s</span>' +
    '<span class="cb-token-rate-sep">·</span>' +
    '<span class="cb-token-rate-max">最大 0.0 tok/s</span>' +
    '<span class="cb-token-rate-dot"></span>';
  if (opts.insertAfter) {
    opts.insertAfter.insertAdjacentElement('afterend', el);
  } else if (opts.insertBefore) {
    opts.insertBefore.insertAdjacentElement('beforebegin', el);
  } else {
    containerEl.appendChild(el);
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let observer: MutationObserver | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastChangeTime = 0;
  let lastAssistantEl: Element | null = null;
  let lastUserEl: Element | null = null;
  let cycleStartTime: number | null = null;

  const getAssistant = (): { el: Element | null; chars: number } => {
    let list = document.querySelectorAll('[data-role="assistant"].claudian-message-assistant, [data-role="assistant"]');
    if (list.length === 0) list = document.querySelectorAll('.claudian-message-assistant, .claudian-message');
    const target = list.length ? list[list.length - 1] : null;
    if (target) return { el: target, chars: target.textContent?.length ?? 0 };
    return { el: null, chars: (document.body.textContent?.length ?? 0) - (el.textContent?.length ?? 0) };
  };

  const getLastUserEl = (): Element | null => {
    const list = document.querySelectorAll('.claudian-message-user, [data-role="user"]');
    return list.length ? list[list.length - 1] : null;
  };

  const tick = (): void => {
    const { el: assistantEl, chars } = getAssistant();
    const now = Date.now();
    // TTFT 起点: ユーザーメッセージ送信（新規ユーザー要素を検出）を「請求開始」とする
    const userEl = getLastUserEl();
    if (userEl !== lastUserEl) {
      lastUserEl = userEl;
      cycleStartTime = now;
      state.ttftMs = null;
    }
    // フォールバック: ユーザー要素が無い環境では新しいアシスタント要素出現を起点にする
    if (cycleStartTime === null && assistantEl !== lastAssistantEl) {
      lastAssistantEl = assistantEl;
      cycleStartTime = now;
    }
    lastAssistantEl = assistantEl;
    const tokens = chars / opts.charPerToken;
    if (state.startTime === null) {
      state.startTime = now;
      state.startChars = chars;
      state.lastTokens = tokens;
      state.lastUpdateTime = now;
    } else {
      const dt = (now - state.lastUpdateTime) / 1000;
      const dTokens = tokens - state.lastTokens;
      state.rate = dt > 0 ? dTokens / dt : 0;
      if (state.rate > state.maxRate) state.maxRate = state.rate;
      state.lastTokens = tokens;
      state.lastUpdateTime = now;
    }
    state.currentChars = chars;
    // 平均 = 累積トークン / 経過秒
    const elapsed = state.startTime !== null ? (now - state.startTime) / 1000 : 0;
    state.avgRate = elapsed > 0 ? tokens / elapsed : 0;
    // TTFT = サイクル開始（ユーザー送信）から最初のアシスタントコンテンツまで
    if (state.ttftMs === null && cycleStartTime !== null && assistantEl !== null && chars > 0) {
      state.ttftMs = Math.max(0, now - cycleStartTime);
    }
    state.isStreaming = now - lastChangeTime < 2500;
    el.classList.toggle('is-streaming', state.isStreaming);
    el.querySelector('.cb-token-rate-ttft')!.textContent =
      `首 ${(state.ttftMs !== null ? state.ttftMs / 1000 : 0).toFixed(1)}s`;
    el.querySelector('.cb-token-rate-value')!.textContent = state.rate.toFixed(1);
    el.querySelector('.cb-token-rate-avg')!.textContent = `平均 ${state.avgRate.toFixed(1)} tok/s`;
    el.querySelector('.cb-token-rate-max')!.textContent = `最大 ${state.maxRate.toFixed(1)} tok/s`;
  };

  const handleMutation = (mutations: MutationRecord[]): void => {
    // 自分自身（.cb-token-rate）への再帰更新は無視（自己フィードバック防止）
    const relevant = mutations.some((m) => {
      const t = m.target;
      return t instanceof Node && !(el.contains(t));
    });
    if (!relevant) return;
    lastChangeTime = Date.now();
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    el.classList.remove('is-fading');
    state.isStreaming = true;
  };

  const start = (): void => {
    const now = Date.now();
    state.startTime = now;
    state.lastUpdateTime = now;
    state.startChars = state.currentChars;
    state.lastTokens = state.currentChars / opts.charPerToken;
    lastChangeTime = now;
    observer = new MutationObserver(handleMutation);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    intervalId = setInterval(tick, opts.intervalMs);
  };

  const stop = (): void => {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    state.isStreaming = false;
    el.classList.remove('is-streaming');
    fadeTimer = setTimeout(() => el.classList.add('is-fading'), opts.fadeOutMs);
  };

  const destroy = (): void => {
    if (intervalId !== null) clearInterval(intervalId);
    if (observer) observer.disconnect();
    if (fadeTimer) clearTimeout(fadeTimer);
    el.remove();
  };

  return { start, stop, destroy, getState: () => ({ ...state }) };
}