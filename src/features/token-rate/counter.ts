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

export interface TokenRateVisible {
  ttft: boolean;
  current: boolean;
  avg: boolean;
  max: boolean;
}

export interface CounterOptions {
  charPerToken?: number;
  intervalMs?: number;
  fadeOutMs?: number;
  /** 指定時は containerEl 末尾ではなくこの要素の直後に .cb-token-rate を挿入する */
  insertAfter?: Element | null;
  /** 指定時はこの要素の直前に .cb-token-rate を挿入する（insertAfter より優先） */
  insertBefore?: Element | null;
  /** 表示項目の選択（既定: 全 true） */
  visible?: Partial<TokenRateVisible>;
}

const DEFAULTS: Required<CounterOptions> = {
  charPerToken: 3,
  intervalMs: 500,
  fadeOutMs: 3000,
  insertAfter: null,
  insertBefore: null,
  visible: {},
};

const DEFAULT_VISIBLE: TokenRateVisible = { ttft: true, current: true, avg: true, max: true };

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
  const vis: TokenRateVisible = { ...DEFAULT_VISIBLE, ...opts.visible };
  const SEGMENTS: Array<{ key: keyof TokenRateVisible; html: string }> = [
    { key: 'ttft', html: '<span class="cb-token-rate-ttft">首 0.0s</span>' },
    { key: 'current', html: '<span class="cb-token-rate-label">現在</span><span class="cb-token-rate-value">0.0</span><span class="cb-token-rate-unit">tok/s</span>' },
    { key: 'avg', html: '<span class="cb-token-rate-avg">平均 0.0 tok/s</span>' },
    { key: 'max', html: '<span class="cb-token-rate-max">最大 0.0 tok/s</span>' },
  ];
  const visibleSegments = SEGMENTS.filter((sg) => vis[sg.key]);
  el.innerHTML =
    visibleSegments.map((sg) => sg.html).join('<span class="cb-token-rate-sep">·</span>') +
    '<span class="cb-token-rate-dot"></span>';
  el.setAttribute('data-visible', visibleSegments.map((sg) => sg.key).join(','));
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
  let rateAnchorEl: Element | null = null;
  // 縮小窓（dTokens < 0）検出後の隔離フラグ: 次の 1 窓を baseline-only にする
  //（縮小 → 復帰の 2 窓で全文字数が一括計上される偽スパイク防止）
  let quarantine = false;

  const getAssistant = (): { el: Element | null; chars: number | null } => {
    let list = document.querySelectorAll('[data-role="assistant"].claudian-message-assistant, [data-role="assistant"]');
    if (list.length === 0) list = document.querySelectorAll('.claudian-message-assistant, .claudian-message');
    const target = list.length ? list[list.length - 1] : null;
    if (target) return { el: target, chars: target.textContent?.length ?? 0 };
    // フォールバック（body 全文字数）は廃止: 偽スパイク防止のため null を返す
    return { el: null, chars: null };
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
    const tokens = chars !== null ? chars / opts.charPerToken : state.lastTokens;
    if (state.startTime === null) {
      state.startTime = now;
      state.startChars = chars ?? 0;
      state.lastTokens = tokens;
      state.lastUpdateTime = now;
      rateAnchorEl = assistantEl;
    } else if (chars !== null) {
      // 初回アンカー確立（rateAnchorEl === null）・既存アンカーからの要素交代は
      // いずれも baseline-only（再注入時の全文字数一括計上スパイク防止のため
      // rate/maxRate を更新せず lastTokens / lastUpdateTime / rateAnchorEl のみ設定）
      const elementChanged = assistantEl !== rateAnchorEl;
      const dt = (now - state.lastUpdateTime) / 1000;
      const dTokens = tokens - state.lastTokens;
      if (quarantine || elementChanged) {
        // 縮小窓の直後の復帰窓（quarantine）・初回アンカー確立 / 要素交代は
        // baseline-only: rate/maxRate を更新せずベースラインのみ引き直す
        quarantine = false;
      } else if (dTokens >= 0 && dt > 0) {
        state.rate = dTokens / dt;
        if (state.rate > state.maxRate) state.maxRate = state.rate;
      }
      // dTokens < 0（DOM 再構成による減少）のときは次の 1 窓も baseline-only にする。
      // 要素交代のときは baseline-only 済みなのでフラグは立てない
      quarantine = dTokens < 0;
      state.lastTokens = tokens;
      state.lastUpdateTime = now;
      rateAnchorEl = assistantEl;
    } else {
      // アシスタント要素が消失した窓: レート計算はスキップし
      // 次回計算の dt 基準（lastUpdateTime）の更新のみ行う。
      // アンカーも解除し、同一要素の再 attach 時も初回確立（baseline-only）扱いにする
      state.lastUpdateTime = now;
      rateAnchorEl = null;
    }
    state.currentChars = chars ?? state.currentChars;
    // 平均 = 累積トークン / 経過秒
    const elapsed = state.startTime !== null ? (now - state.startTime) / 1000 : 0;
    state.avgRate = elapsed > 0 ? tokens / elapsed : 0;
    // TTFT = サイクル開始（ユーザー送信）から最初のアシスタントコンテンツまで
    if (state.ttftMs === null && cycleStartTime !== null && assistantEl !== null && (chars ?? 0) > 0) {
      state.ttftMs = Math.max(0, now - cycleStartTime);
    }
    state.isStreaming = now - lastChangeTime < 2500;
    el.classList.toggle('is-streaming', state.isStreaming);
    const setText = (selector: string, text: string): void => {
      const target = el.querySelector(selector);
      if (target) target.textContent = text;
    };
    setText('.cb-token-rate-ttft', `首 ${(state.ttftMs !== null ? state.ttftMs / 1000 : 0).toFixed(1)}s`);
    setText('.cb-token-rate-value', state.rate.toFixed(1));
    setText('.cb-token-rate-avg', `平均 ${state.avgRate.toFixed(1)} tok/s`);
    setText('.cb-token-rate-max', `最大 ${state.maxRate.toFixed(1)} tok/s`);
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