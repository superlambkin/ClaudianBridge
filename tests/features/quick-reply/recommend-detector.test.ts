// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractRecommendedOption } from '../../../src/features/quick-reply/recommend-detector';

describe('extractRecommendedOption', () => {
  it('ja: 「推奨は方案2」→ 2', () => {
    expect(extractRecommendedOption('案内:\n- 方案1: A\n- 方案2: B\n推奨は方案2です')).toBe(2);
  });
  it('ja: 「おすすめ: 方案3」→ 3', () => {
    expect(extractRecommendedOption('おすすめ: 方案3')).toBe(3);
  });
  it('zh: 「推荐方案1」→ 1', () => {
    expect(extractRecommendedOption('推荐方案1')).toBe(1);
  });
  it('zh: 「建议选择方案4」→ 4', () => {
    expect(extractRecommendedOption('建议选择方案4')).toBe(4);
  });
  it('en: "I recommend option 5." → 5', () => {
    expect(extractRecommendedOption('I recommend option 5.')).toBe(5);
  });
  it('en: "recommended: 2" → 2', () => {
    expect(extractRecommendedOption('recommended: 2')).toBe(2);
  });
  it('推奨なし → null', () => {
    expect(extractRecommendedOption('方案1: A\n方案2: B')).toBeNull();
  });
  it('範囲外（6 以上）→ null', () => {
    expect(extractRecommendedOption('推奨は方案6')).toBeNull();
  });
  it('空文字 → null', () => {
    expect(extractRecommendedOption('')).toBeNull();
  });
});
