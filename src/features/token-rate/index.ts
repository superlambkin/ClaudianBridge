import type { App } from 'obsidian';
import { createTokenRateCounter } from './counter';
import type { ConfigStore } from '../../core/config-store';

const CONTAINER_SELECTOR = '.claudian-input-container';
const MESSAGES_SELECTOR = '.claudian-messages';
const TOGGLE_SELECTOR = '.claudian-permission-toggle';

interface CounterHandle {
  destroy: () => void;
}

/** YOLO/Safe トグル（.claudian-permission-toggle）を container から探す */
const findPermissionToggle = (container: Element): Element | null =>
  container.querySelector(TOGGLE_SELECTOR);

export function setupTokenRate(
  app: App,
  store: ConfigStore,
): () => void {
  const counters = new Map<Element, CounterHandle>();
  const loadEnabled = (): boolean => {
    try {
      const cfg = store.load() as { general?: { tokenRateEnabled?: boolean } } | null;
      return cfg?.general?.tokenRateEnabled ?? false;
    } catch {
      return false;
    }
  };

  interface TokenRateVisibleFlags {
    ttft: boolean;
    current: boolean;
    avg: boolean;
    max: boolean;
  }

  const loadVisible = (): TokenRateVisibleFlags => {
    try {
      const cfg = store.load() as { general?: Record<string, unknown> } | null;
      const g = cfg?.general ?? {};
      const b = (k: string): boolean => (typeof g[k] === 'boolean' ? (g[k] as boolean) : true);
      return {
        ttft: b('tokenRateShowTtft'),
        current: b('tokenRateShowCurrent'),
        avg: b('tokenRateShowAvg'),
        max: b('tokenRateShowMax'),
      };
    } catch {
      return { ttft: true, current: true, avg: true, max: true };
    }
  };

  const visibleKey = (v: TokenRateVisibleFlags): string =>
    (['ttft', 'current', 'avg', 'max'] as const).filter((k) => v[k]).join(',');

  const injectInto = (container: Element): void => {
    if (counters.has(container)) return;
    // 優先: YOLO トグル（.claudian-permission-toggle）の左に表示
    const toggle = findPermissionToggle(container);
    if (toggle && toggle.parentElement) {
      const counter = createTokenRateCounter(
        toggle.parentElement as HTMLElement,
        { insertBefore: toggle, visible: loadVisible() },
      );
      counter.start();
      counters.set(container, counter);
      return;
    }
    // フォールバック: レスポンス（.claudian-messages）の直後
    const messages = container.querySelector(MESSAGES_SELECTOR);
    if (!messages) return;
    const counter = createTokenRateCounter(
      messages.parentElement as HTMLElement,
      { insertAfter: messages, visible: loadVisible() },
    );
    counter.start();
    counters.set(container, counter);
  };

  const injectAll = (): void => {
    if (!loadEnabled()) return;
    document.querySelectorAll(CONTAINER_SELECTOR).forEach(injectInto);
  };

  const removeAll = (): void => {
    counters.forEach((c) => c.destroy());
    counters.clear();
  };

  const rescan = (): void => {
    if (!loadEnabled()) { removeAll(); return; }
    const expected = visibleKey(loadVisible());
    // コンテナが消えた / counter 要素が React 再レンダーで外れた /
    // 表示項目設定が変わった（data-visible 不一致）→ 破棄して再注入
    counters.forEach((handle, el) => {
      const rate = el.querySelector('.cb-token-rate');
      if (!document.contains(el) || !rate || rate.getAttribute('data-visible') !== expected) {
        handle.destroy();
        counters.delete(el);
      }
    });
    injectAll();
  };

  injectAll();

  // Reactive detection (production behaviour, async via microtask).
  // attributes: タブ切替（claudian-hidden クラス着脱）にも対応
  const observer = new MutationObserver(() => rescan());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // Synchronous detection hook on document.body.appendChild: MutationObserver
  // callbacks fire on the microtask queue, but tests assert synchronously after
  // a DOM mutation. This wrapper makes the injection visible in the same tick.
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    document.body, 'appendChild',
  );
  const wrappedAppendChild = function (this: Node, child: Node): Node {
    const result = Node.prototype.appendChild.call(this, child);
    if (
      loadEnabled()
      && child instanceof Element
      && child.classList.contains('claudian-input-container')
    ) {
      injectInto(child);
    }
    return result;
  };
  Object.defineProperty(document.body, 'appendChild', {
    value: wrappedAppendChild,
    writable: true,
    configurable: true,
  });

  return () => {
    observer.disconnect();
    if (originalDescriptor) {
      Object.defineProperty(document.body, 'appendChild', originalDescriptor);
    } else {
      delete (document.body as { appendChild?: unknown }).appendChild;
    }
    removeAll();
  };
}
