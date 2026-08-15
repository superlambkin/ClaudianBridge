// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import { detectProviderFromBaseUrl, readLlmInfoFromSettings } from '../../../src/features/quota/llm-info';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, readFileSync: vi.fn() };
});

const readFileSyncMock = vi.mocked(fs.readFileSync);

afterEach(() => {
  readFileSyncMock.mockReset();
});

describe('detectProviderFromBaseUrl', () => {
  it('deepseek URL → deepseek', () => {
    expect(detectProviderFromBaseUrl('https://api.deepseek.com/anthropic')).toBe('deepseek');
  });
  it('kimi URL → kimi', () => {
    expect(detectProviderFromBaseUrl('https://api.kimi.com/coding/')).toBe('kimi');
  });
  it('minimax URL → minimax', () => {
    expect(detectProviderFromBaseUrl('https://api.minimaxi.com')).toBe('minimax');
  });
  it('zhipu bigmodel URL → zhipu', () => {
    expect(detectProviderFromBaseUrl('https://open.bigmodel.cn/api/paas/v4')).toBe('zhipu');
  });
  it('zhipu z.ai URL → zhipu', () => {
    expect(detectProviderFromBaseUrl('https://api.z.ai/api/paas/v4')).toBe('zhipu');
  });
  it('anthropic URL → claude', () => {
    expect(detectProviderFromBaseUrl('https://api.anthropic.com')).toBe('claude');
  });
  it('null → claude', () => {
    expect(detectProviderFromBaseUrl(null)).toBe('claude');
  });
});

describe('readLlmInfoFromSettings', () => {
  it('settings.json から env を読み取る', () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
        ANTHROPIC_MODEL: 'deepseek-v4-flash[1M]',
        ANTHROPIC_AUTH_TOKEN: 'sk-test',
      },
    }));
    const info = readLlmInfoFromSettings('C:\\x\\settings.json');
    expect(info.provider).toBe('deepseek');
    expect(info.model).toBe('deepseek-v4-flash[1M]');
    expect(info.authTokenPresent).toBe(true);
  });

  it('ファイル不在 → unknown', () => {
    readFileSyncMock.mockImplementation(() => { throw new Error('ENOENT'); });
    const info = readLlmInfoFromSettings('C:\\missing\\settings.json');
    expect(info.provider).toBe('unknown');
    expect(info.authTokenPresent).toBe(false);
  });

  it('トークン未設定 → authTokenPresent=false', () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'https://api.anthropic.com' },
    }));
    const info = readLlmInfoFromSettings('C:\\x\\settings.json');
    expect(info.provider).toBe('claude');
    expect(info.authTokenPresent).toBe(false);
  });
});
