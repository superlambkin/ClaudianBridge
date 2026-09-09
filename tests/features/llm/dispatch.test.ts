import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveLlmClient } from '../../../src/features/llm/dispatch';

describe('resolveLlmClient', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('provider=claude で createClaudeClient を返す', () => {
    const client = resolveLlmClient('claude', undefined, { enabled: true, effort: 'medium' });
    expect(client.id).toBe('claude');
  });

  it('provider=deepseek で createDeepSeekClient を返す', () => {
    const client = resolveLlmClient('deepseek', 'sk-xxx', { enabled: true, effort: 'high' });
    expect(client.id).toBe('deepseek');
  });

  it('provider=zhipu で createZhipuClient を返す', () => {
    const client = resolveLlmClient('zhipu', 'zai-xxx', { enabled: false, effort: 'medium' });
    expect(client.id).toBe('zhipu');
  });

  it('provider=minimax で createMiniMaxClient を返す', () => {
    const client = resolveLlmClient('minimax', 'mini-xxx', { enabled: true, effort: 'low' });
    expect(client.id).toBe('minimax');
  });

  it('provider=kimi で createKimiClient を返す', () => {
    const client = resolveLlmClient('kimi', 'kimi-xxx', { enabled: true, effort: 'medium' });
    expect(client.id).toBe('kimi');
  });

  it('provider=unknown は Claude にフォールバック（warn ログあり）', () => {
    const client = resolveLlmClient('unknown', undefined, { enabled: false, effort: 'medium' });
    expect(client.id).toBe('claude');
    expect(warnSpy).toHaveBeenCalled();
  });
});
