// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountOverlay } from '../../../../src/features/tts/md-read-highlight/floating-overlay';

function makePreview(): HTMLElement {
  document.body.innerHTML = '';
  const p = document.createElement('div');
  document.body.appendChild(p);
  return p;
}

describe('mountOverlay', () => {
  beforeEach(() => document.body.innerHTML = '');

  it('mount で overlay DOM を挿入 → unmount で削除', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    const unmount = mountOverlay(view, handlers);
    expect(view.previewMode.containerEl.querySelector('.cb-md-read-overlay')).not.toBeNull();
    unmount();
    expect(view.previewMode.containerEl.querySelector('.cb-md-read-overlay')).toBeNull();
  });

  it('⏸ ボタンクリックで onPause 発火', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    mountOverlay(view, handlers);
    const pauseBtn = view.previewMode.containerEl.querySelector<HTMLElement>('[data-cb-md-read-pause]');
    pauseBtn?.click();
    expect(handlers.onPause).toHaveBeenCalled();
  });

  it('⏭ ボタンクリックで onSkip 発火', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    mountOverlay(view, handlers);
    const skipBtn = view.previewMode.containerEl.querySelector<HTMLElement>('[data-cb-md-read-skip]');
    skipBtn?.click();
    expect(handlers.onSkip).toHaveBeenCalled();
  });
});