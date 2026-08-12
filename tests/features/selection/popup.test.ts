import { describe, it, expect, afterEach } from 'vitest';
import { positionPopup } from '../../../src/features/selection/popup';

function makePopupEl(offsetWidth: number, offsetHeight: number): HTMLElement {
  return { offsetWidth, offsetHeight, style: {} } as unknown as HTMLElement;
}

function setViewport(width: number, height: number): void {
  (globalThis as { window?: { innerWidth: number; innerHeight: number } }).window = { innerWidth: width, innerHeight: height };
}

const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

describe('positionPopup', () => {
  it('選択範囲の直下（bottom + 6px）に配置する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 200, right: 300, bottom: 220 });
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('226px');
  });

  it('右端にはみ出す場合は左にクランプする', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 950, top: 200, right: 990, bottom: 220 });
    // 950 + 100 + 6 = 1056 > 1000 → 1000 - 100 - 6 = 894
    expect(el.style.left).toBe('894px');
    expect(el.style.top).toBe('226px');
  });

  it('下端にはみ出す場合は選択範囲の上に反転する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 640, right: 300, bottom: 680 });
    // 680 + 6 + 40 = 726 > 700 → 640 - 40 - 6 = 594
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('594px');
  });

  it('クランプ時も margin 未満にはならない', () => {
    setViewport(100, 100);
    const el = makePopupEl(80, 80);
    positionPopup(el, { left: -50, top: 90, right: 50, bottom: 100 });
    expect(Number.parseFloat(el.style.left)).toBeGreaterThanOrEqual(6);
    expect(Number.parseFloat(el.style.top)).toBeGreaterThanOrEqual(6);
  });
});
