import { describe, it, expect } from 'vitest';
import { getImageGenProvider } from '../../../src/features/image-gen/registry';

describe('ImageGenProvider registry', () => {
  it('minimax を取得', () => {
    const p = getImageGenProvider('minimax', () => 'sk-test');
    expect(p.id).toBe('minimax');
    expect(p.isConfigured()).toBe(true);
  });

  it('zhipu を取得', () => {
    const p = getImageGenProvider('zhipu', () => 'sk-test');
    expect(p.id).toBe('zhipu');
    expect(p.isConfigured()).toBe(true);
  });

  it('settings key が空でも env var が見つかれば設定済み', () => {
    const p = getImageGenProvider(
      'minimax',
      () => '',
      (k) => (k === 'MINIMAX_API_KEY' ? 'from-env' : undefined),
    );
    expect(p.isConfigured()).toBe(true);
  });

  it('settings key も env var もないと未設定', () => {
    const p = getImageGenProvider(
      'zhipu',
      () => undefined,
      () => undefined,
    );
    expect(p.isConfigured()).toBe(false);
  });
});
