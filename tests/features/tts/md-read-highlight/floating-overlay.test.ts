// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountOverlay } from '../../../../src/features/tts/md-read-highlight/floating-overlay';

function makePreview(): HTMLElement {
  document.body.innerHTML = '';
  const p = document.createElement('div');
  p.className = 'preview-container';
  document.body.appendChild(p);
  return p;
}

describe('mountOverlay (v0.33.5: document.body 起点)', () => {
  beforeEach(() => document.body.innerHTML = '');

  it('mount で overlay を document.body に挿入 → unmount で削除', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    const unmount = mountOverlay(view, handlers);
    // v0.33.5: overlay は document.body 直下（previewMode.containerEl ではなく）
    expect(document.body.querySelector('.cb-md-read-overlay')).not.toBeNull();
    unmount();
    expect(document.body.querySelector('.cb-md-read-overlay')).toBeNull();
  });

  it('previewMode 内のコンテンツ差し替えでも overlay は消えない（document.body 起点のため）', () => {
    const container = makePreview();
    container.innerHTML = '<p>Before switch</p>';
    const view = { previewMode: { containerEl: container } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    mountOverlay(view, handlers);
    expect(document.body.querySelector('.cb-md-read-overlay')).not.toBeNull();

    // simulate mode switch: replace previewMode.containerEl contents
    container.innerHTML = '<p>After mode switch to preview</p>';
    expect(document.body.querySelector('.cb-md-read-overlay')).not.toBeNull();
  });

  it('⏸ ボタンクリックで onPause 発火', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    mountOverlay(view, handlers);
    const pauseBtn = document.body.querySelector<HTMLElement>('[data-cb-md-read-pause]');
    pauseBtn?.click();
    expect(handlers.onPause).toHaveBeenCalled();
  });

  it('⏭ ボタンクリックで onSkip 発火', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    mountOverlay(view, handlers);
    const skipBtn = document.body.querySelector<HTMLElement>('[data-cb-md-read-skip]');
    skipBtn?.click();
    expect(handlers.onSkip).toHaveBeenCalled();
  });

  it('🔇 ボタンクリックで onMute 発火', () => {
    const view = { previewMode: { containerEl: makePreview() } };
    const handlers = { onPause: vi.fn(), onResume: vi.fn(), onSkip: vi.fn(), onMute: vi.fn() };
    mountOverlay(view, handlers);
    const muteBtn = document.body.querySelector<HTMLElement>('[data-cb-md-read-mute]');
    muteBtn?.click();
    expect(handlers.onMute).toHaveBeenCalled();
  });
});
