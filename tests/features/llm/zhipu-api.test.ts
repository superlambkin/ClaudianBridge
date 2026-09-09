import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createZhipuClient } from '../../../src/features/llm/zhipu-api';

const fetchMock = vi.fn();
(globalThis as any).fetch = fetchMock;

function mockJsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createZhipuClient.runPrompt', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => fetchMock.mockReset());

  it('thinking.enabled=true で thinking.type=enabled を送る', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: 'OK' } }],
      }),
    );
    const client = createZhipuClient('sk-xxx', { enabled: true, effort: 'high' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'high' } });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.z.ai/api/paas/v4/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-xxx' }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('glm-4.5');
    expect(body.thinking).toEqual({ type: 'enabled' });
    // Zhipu は reasoning_effort 非対応なので送信しない
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('thinking.enabled=false で thinking.type=disabled', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: 'OK' } }],
      }),
    );
    const client = createZhipuClient('sk-xxx', { enabled: false, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('HTTP 401 で null 返却', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, 401));
    const client = createZhipuClient('bad-key', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', {
      thinking: { enabled: false, effort: 'medium' },
    });
    expect(result).toBeNull();
  });

  it('HTTP 500 で null 返却', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, 500));
    const client = createZhipuClient('sk-xxx', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', {
      thinking: { enabled: false, effort: 'medium' },
    });
    expect(result).toBeNull();
  });

  it('response.content が空文字なら null', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: '' } }],
      }),
    );
    const client = createZhipuClient('sk-xxx', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', {
      thinking: { enabled: false, effort: 'medium' },
    });
    expect(result).toBeNull();
  });
});