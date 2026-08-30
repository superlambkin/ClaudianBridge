import type { App } from 'obsidian';
import { createTokenRateCounter } from './counter';
import type { ConfigStore } from '../../core/config-store';

const CONTAINER_SELECTOR = '.claudian-input-container';
const MESSAGES_SELECTOR = '.claudian-messages';

interface CounterHandle {
  destroy: () => void;
}

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

  const injectInto = (container: Element): void => {
    const messages = container.querySelector(MESSAGES_SELECTOR);
    if (!messages) return;
    if (counters.has(container)) return;
    // Pass the container itself: createTokenRateCounter appends a .cb-token-rate
    // child at the end, which becomes messages.nextElementSibling.
    const counter = createTokenRateCounter(messages.parentElement as HTMLElement);
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
    counters.forEach((_, el) => {
      if (!document.contains(el)) counters.get(el)?.destroy();
    });
    injectAll();
  };

  injectAll();

  // Reactive detection (production behaviour, async via microtask).
  const observer = new MutationObserver(() => rescan());
  observer.observe(document.body, { childList: true, subtree: true });

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
