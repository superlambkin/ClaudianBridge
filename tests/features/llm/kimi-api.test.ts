import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKimiClient } from '../../../src/features/llm/kimi-api';

const fetchMock = vi.fn();
(globalThis as any).fetch = fetchMock;

function mockJsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createKimiClient.runPrompt', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => fetchMock.mockReset());

  it('thinking.enabled=true で model=kimi-thinking-preview を使う', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: 'OK' } }],
      }),
    );
    const client = createKimiClient('sk-xxx', { enabled: true, effort: 'high' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'high' } });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.moonshot.cn/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-xxx' }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('kimi-thinking-preview');
    // Moonshot は body の thinking フィールドをサポートしないため送信しない
    expect(body.thinking).toBeUndefined();
    // reasoning_effort サポート未確定のため送信しない
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('thinking.enabled=false で model=moonshot-v1-128k を使う（thinking.type なし）', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: 'OK' } }],
      }),
    );
    const client = createKimiClient('sk-xxx', { enabled: false, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('moonshot-v1-128k');
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('HTTP 401 で null 返却', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, 401));
    const client = createKimiClient('bad-key', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', {
      thinking: { enabled: false, effort: 'medium' },
    });
    expect(result).toBeNull();
  });

  it('HTTP 500 で null 返却', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, 500));
    const client = createKimiClient('sk-xxx', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', {
      thinking: { enabled: false, effort: 'medium' },
    });
    expect(result).toBeNull();
  });
});