// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHighlightColorPalette, HIGHLIGHT_COLOR_PRESETS } from '../../src/settings/color-palette';

describe('renderHighlightColorPalette (v0.35.2)', () => {
  it('プリセットは 16 色（濃い色 8 含む）', () => {
    expect(HIGHLIGHT_COLOR_PRESETS.length).toBe(16);
    expect(HIGHLIGHT_COLOR_PRESETS.filter((p) => p.dark).length).toBe(8);
  });

  it('スウォッチクリックで onPick に色が渡る', () => {
    const onPick = vi.fn();
    const container = document.createElement('div');
    renderHighlightColorPalette(container, '#ffb300', onPick);
    const swatches = container.querySelectorAll<HTMLButtonElement>('.cb-color-swatch:not(.cb-color-custom)');
    expect(swatches.length).toBe(16);
    (swatches[3] as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith(HIGHLIGHT_COLOR_PRESETS[3].value);
  });

  it('現在色のスウォッチに選択強調クラスが付く', () => {
    const container = document.createElement('div');
    renderHighlightColorPalette(container, '#a5d6a7', vi.fn());
    const active = container.querySelector('.cb-color-swatch.is-selected');
    expect(active).not.toBeNull();
  });

  it('カスタムピッカーの変更で onPick が呼ばれる', () => {
    const onPick = vi.fn();
    const container = document.createElement('div');
    renderHighlightColorPalette(container, '#ffb300', onPick);
    const custom = container.querySelector<HTMLInputElement>('input[type="color"]');
    expect(custom).not.toBeNull();
    custom!.value = '#123456';
    custom!.dispatchEvent(new Event('change'));
    expect(onPick).toHaveBeenCalledWith('#123456');
  });
});
