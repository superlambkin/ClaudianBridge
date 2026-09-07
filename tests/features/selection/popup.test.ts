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

describe('positionPopup - bottom モード（既存互換）', () => {
  it('選択範囲の直下（bottom + 6px）に配置する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 200, right: 300, bottom: 220 }, 'bottom');
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('226px');
  });

  it('右端にはみ出す場合は左にクランプする', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 950, top: 200, right: 990, bottom: 220 }, 'bottom');
    // 950 + 100 + 6 = 1056 > 1000 → 1000 - 100 - 6 = 894
    expect(el.style.left).toBe('894px');
    expect(el.style.top).toBe('226px');
  });

  it('下端にはみ出す場合は選択範囲の上に反転する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 640, right: 300, bottom: 680 }, 'bottom');
    // 680 + 6 + 40 = 726 > 700 → 640 - 40 - 6 = 594
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('594px');
  });

  it('クランプ時も margin 未満にはならない', () => {
    setViewport(100, 100);
    const el = makePopupEl(80, 80);
    positionPopup(el, { left: -50, top: 90, right: 50, bottom: 100 }, 'bottom');
    expect(Number.parseFloat(el.style.left)).toBeGreaterThanOrEqual(6);
    expect(Number.parseFloat(el.style.top)).toBeGreaterThanOrEqual(6);
  });
});

describe('positionPopup - top-right モード（新既定）', () => {
  it('選択範囲の右上に外接配置する（rect.right - w, rect.top - h - margin）', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 200, right: 300, bottom: 220 }, 'top-right');
    // right(300) - w(100) = 200, top(200) - h(40) - 6 = 154
    expect(el.style.left).toBe('200px');
    expect(el.style.top).toBe('154px');
  });

  it('上端にはみ出す場合は選択範囲の下に反転する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    // rect.top=10, h=40 → 10-40-6=-36 < margin(6) → bottom(220)+6=226
    positionPopup(el, { left: 100, top: 10, right: 300, bottom: 220 }, 'top-right');
    expect(el.style.top).toBe('226px');
  });

  it('右端にはみ出す場合は左にクランプする', () => {
    setViewport(800, 700);
    const el = makePopupEl(100, 40);
    // right(895) - w(100) = 795, 795+100+6=901 > 800 → 800-100-6=694
    positionPopup(el, { left: 800, top: 200, right: 895, bottom: 240 }, 'top-right');
    expect(el.style.left).toBe('694px');
  });

  it('上端にはみ出し反転後さらに下端を超える場合はクランプで margin を保つ', () => {
    setViewport(1000, 100);
    const el = makePopupEl(80, 80);
    // rect.top=10, h=80 → 10-80-6=-76 < margin → 90+6=96, 96+80+6=182 > vh(100) → Math.max(6,...) でクランプ
    positionPopup(el, { left: 100, top: 10, right: 200, bottom: 90 }, 'top-right');
    expect(Number.parseFloat(el.style.top)).toBeGreaterThanOrEqual(6);
  });
});

describe('positionPopup - mode 既定値', () => {
  it('mode 未指定時は top-right として配置する', () => {
    setViewport(1000, 700);
    const el = makePopupEl(100, 40);
    positionPopup(el, { left: 100, top: 200, right: 300, bottom: 220 });
    expect(el.style.left).toBe('200px');
    expect(el.style.top).toBe('154px');
  });
});
