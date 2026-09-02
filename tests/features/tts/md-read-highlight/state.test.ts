import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mdReadState } from '../../../../src/features/tts/md-read-highlight/state';
import type { MdReadChunkAnchor } from '../../../../src/features/tts/md-read-highlight/types';

const chunks: MdReadChunkAnchor[] = [
  { index: 0, startLine: 0, anchor: 'abc', text: 'abc...', headingLevel: 1 },
  { index: 1, startLine: 1, anchor: 'def', text: 'def...', headingLevel: 2 },
];

describe('mdReadState', () => {
  beforeEach(() => mdReadState.clear());

  it('register で state 初期化', () => {
    mdReadState.register('/a.md', chunks);
    const s = mdReadState.get();
    expect(s?.filePath).toBe('/a.md');
    expect(s?.chunks).toEqual(chunks);
    expect(s?.activeIdx).toBe(-1);
    expect(s?.phase).toBe('pending');
  });

  it('setActiveIdx で idx 更新 + 購読者コールバック', () => {
    const cb = vi.fn();
    mdReadState.subscribe(cb);
    mdReadState.register('/a.md', chunks);
    mdReadState.setActiveIdx(1);
    expect(mdReadState.get()?.activeIdx).toBe(1);
    expect(mdReadState.get()?.phase).toBe('playing');
    expect(cb).toHaveBeenCalled();
  });

  it('pause / resume', () => {
    mdReadState.register('/a.md', chunks);
    mdReadState.setActiveIdx(0);
    mdReadState.pause();
    expect(mdReadState.get()?.paused).toBe(true);
    expect(mdReadState.get()?.phase).toBe('paused');
    mdReadState.resume();
    expect(mdReadState.get()?.paused).toBe(false);
    expect(mdReadState.get()?.phase).toBe('playing');
  });

  it('clear で state 破棄', () => {
    mdReadState.register('/a.md', chunks);
    mdReadState.setActiveIdx(0);
    mdReadState.clear();
    expect(mdReadState.get()).toBeNull();
  });
});