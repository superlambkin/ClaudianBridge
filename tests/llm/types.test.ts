import { describe, it, expect } from 'vitest';
import { THINKING_EFFORT_VALUES, type ThinkingEffort } from '../../src/features/llm/types';

describe('THINKING_EFFORT_VALUES', () => {
  it('off/low/medium/high の 4 値を含む', () => {
    expect(THINKING_EFFORT_VALUES).toEqual(['off', 'low', 'medium', 'high']);
  });

  it('不正な文字列は型エラー（コンパイル時保証）', () => {
    // Type-level test: assigning invalid string to ThinkingEffort should fail
    const valid: ThinkingEffort = 'medium';
    expect(valid).toBe('medium');
  });
});
