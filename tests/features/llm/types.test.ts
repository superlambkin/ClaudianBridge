import { describe, it, expect } from 'vitest';
import { THINKING_EFFORT_VALUES, type ThinkingEffort } from '../../../src/features/llm/types';

describe('THINKING_EFFORT_VALUES', () => {
  it('off/low/medium/high の 4 値を含む', () => {
    expect(THINKING_EFFORT_VALUES).toEqual(['off', 'low', 'medium', 'high']);
  });

  it('不正な文字列はコンパイル時エラー（@ts-expect-error）', () => {
    expect(THINKING_EFFORT_VALUES).toEqual(['off', 'low', 'medium', 'high']);
    // @ts-expect-error - 'invalid' は ThinkingEffort ではない
    const invalid: ThinkingEffort = 'invalid';
    expect(invalid).toBe('invalid');  // ランタイムでは到達しない（コンパイル時エラー）
  });
});
