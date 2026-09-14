import type { MdReadState, MdReadChunkAnchor } from './types';

let current: MdReadState | null = null;
const subs = new Set<(s: MdReadState) => void>();

function notify(): void {
  if (current) subs.forEach((fn) => fn(current!));
}

export const mdReadState = {
  get(): MdReadState | null {
    return current;
  },
  register(filePath: string, chunks: MdReadChunkAnchor[]): void {
    current = {
      filePath,
      chunks,
      activeIdx: -1,
      paused: false,
      phase: 'pending',
    };
    notify();
  },
  setActiveIdx(idx: number): void {
    if (!current) return;
    current.activeIdx = idx;
    if (idx >= 0 && !current.paused) current.phase = 'playing';
    notify();
  },
  pause(): void {
    if (!current) return;
    current.paused = true;
    current.phase = 'paused';
    notify();
  },
  resume(): void {
    if (!current) return;
    current.paused = false;
    current.phase = 'playing';
    notify();
  },
  complete(): void {
    if (!current) return;
    current.phase = 'completed';
    notify();
  },
  clear(): void {
    current = null;
    subs.forEach((fn) => fn({ filePath: '', chunks: [], activeIdx: -1, paused: false, phase: 'cleared' }));
  },
  subscribe(fn: (s: MdReadState) => void): () => void {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

/**
 * テスト用: 全 subscriber を解除（テスト isolation 用）。
 * 本番コードから呼ばないこと。
 */
export function __resetMdReadSubscribersForTesting(): void {
  subs.clear();
}