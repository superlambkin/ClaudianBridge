import { describe, it, expect, beforeEach } from 'vitest';
import {
  prepareMdRead,
  finalizeMdRead,
  createChunkStartHook,
} from '../../../../src/features/tts/md-read-highlight/runtime';
import { mdReadState } from '../../../../src/features/tts/md-read-highlight/state';

describe('runtime helpers (F-028)', () => {
  beforeEach(() => mdReadState.clear());

  describe('createChunkStartHook', () => {
    it('enabled=false のとき undefined を返す（hook 無効化）', () => {
      expect(createChunkStartHook(false)).toBeUndefined();
    });

    it('enabled=true のとき hook 関数を返す', () => {
      const hook = createChunkStartHook(true);
      expect(typeof hook).toBe('function');
    });

    it('hook(idx) を呼ぶと mdReadState.setActiveIdx(idx) で active 切替', () => {
      mdReadState.register('/a.md', [
        { index: 0, startLine: 0, anchor: 'a', text: 'a', headingLevel: 0 },
        { index: 1, startLine: 1, anchor: 'b', text: 'b', headingLevel: 0 },
      ]);
      const hook = createChunkStartHook(true);
      hook!(1);
      expect(mdReadState.get()?.activeIdx).toBe(1);
      expect(mdReadState.get()?.phase).toBe('playing');
    });
  });

  describe('prepareMdRead', () => {
    it('enabled=false のとき何もしない（register されない）', () => {
      prepareMdRead({
        enabled: false,
        filePath: '/a.md',
        content: '# タイトル',
        filteredText: 'タイトル',
        chunkMax: 500,
      });
      expect(mdReadState.get()).toBeNull();
    });

    it('enabled=true で register される（filePath + chunks 構築）', () => {
      prepareMdRead({
        enabled: true,
        filePath: '/a.md',
        content: '# タイトル\n本文のテキスト',
        filteredText: 'タイトル\n本文のテキスト',
        chunkMax: 500,
      });
      const s = mdReadState.get();
      expect(s?.filePath).toBe('/a.md');
      expect(s?.chunks.length).toBeGreaterThan(0);
      expect(s?.activeIdx).toBe(-1);
      expect(s?.phase).toBe('pending');
    });
  });

  describe('finalizeMdRead', () => {
    it('ok=true で state を completed フェーズに', () => {
      mdReadState.register('/a.md', [
        { index: 0, startLine: 0, anchor: 'a', text: 'a', headingLevel: 0 },
      ]);
      finalizeMdRead(true);
      expect(mdReadState.get()?.phase).toBe('completed');
    });

    it('ok=false で state を clear（null 化）', () => {
      mdReadState.register('/a.md', [
        { index: 0, startLine: 0, anchor: 'a', text: 'a', headingLevel: 0 },
      ]);
      finalizeMdRead(false);
      expect(mdReadState.get()).toBeNull();
    });

    it('state 未登録（null）でもクラッシュしない', () => {
      expect(() => finalizeMdRead(true)).not.toThrow();
      expect(() => finalizeMdRead(false)).not.toThrow();
    });
  });
});
