export interface TokenRateState {
  startTime: number | null;
  startChars: number;
  currentChars: number;
  lastUpdateTime: number;
  lastTokens: number;
  rate: number;
  isStreaming: boolean;
}

export interface CounterOptions {
  charPerToken?: number;
  intervalMs?: number;
  fadeOutMs?: number;
}

const DEFAULTS: Required<CounterOptions> = {
  charPerToken: 3,
  intervalMs: 250,
  fadeOutMs: 3000,
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
    isStreaming: false,
  };

  const el = document.createElement('div');
  el.className = 'cb-token-rate';
  el.innerHTML = `<span class="cb-token-rate-value">0.0 tok/s</span><span class="cb-token-rate-dot"></span>`;
  containerEl.appendChild(el);

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let observer: MutationObserver | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastChangeTime = 0;

  const readChars = (): number => {
    const target = document.querySelector('.claudian-message[data-role="assistant"]:last-of-type');
    if (target) return target.textContent?.length ?? 0;
    const anyAssistant = document.querySelector('.claudian-message:last-of-type');
    if (anyAssistant) return anyAssistant.textContent?.length ?? 0;
    return (document.body.textContent?.length ?? 0) - (el.textContent?.length ?? 0);
  };

  const tick = (): void => {
    const chars = readChars();
    const tokens = chars / opts.charPerToken;
    const now = Date.now();
    if (state.startTime === null) {
      state.startTime = now;
      state.startChars = chars;
      state.lastTokens = tokens;
      state.lastUpdateTime = now;
    } else {
      const dt = (now - state.lastUpdateTime) / 1000;
      const dTokens = tokens - state.lastTokens;
      state.rate = dt > 0 ? dTokens / dt : 0;
      state.lastTokens = tokens;
      state.lastUpdateTime = now;
    }
    state.currentChars = chars;
    state.isStreaming = now - lastChangeTime < 2500;
    el.classList.toggle('is-streaming', state.isStreaming);
    el.querySelector('.cb-token-rate-value')!.textContent = `${state.rate.toFixed(1)} ${'tok/s'}`;
  };

  const handleMutation = (): void => {
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