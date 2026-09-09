import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeepSeekClient } from '../../../src/features/llm/deepseek-api';

const fetchMock = vi.fn();
(globalThis as any).fetch = fetchMock;

function mockJsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createDeepSeekClient.runPrompt', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => fetchMock.mockReset());

  it('thinking.enabled=true で thinking.type=enabled と reasoning_effort=high を送る', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: 'OK', reasoning_content: 'thinking...' } }],
      }),
    );
    const client = createDeepSeekClient('sk-xxx', { enabled: true, effort: 'high' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'high' } });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-xxx' }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.reasoning_effort).toBe('high');
  });

  it('thinking.enabled=false で thinking.type=disabled', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: 'OK' } }],
      }),
    );
    const client = createDeepSeekClient('sk-xxx', { enabled: false, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('effort=medium は high にフォールバック（DeepSeek API 仕様）', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: 'OK' } }],
      }),
    );
    const client = createDeepSeekClient('sk-xxx', { enabled: true, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'medium' } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe('high');
  });

  it('HTTP 401 で null 返却', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, 401));
    const client = createDeepSeekClient('bad-key', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', {
      thinking: { enabled: false, effort: 'medium' },
    });
    expect(result).toBeNull();
  });

  it('HTTP 500 で null 返却', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}, 500));
    const client = createDeepSeekClient('sk-xxx', { enabled: false, effort: 'medium' });
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
    const client = createDeepSeekClient('sk-xxx', { enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', {
      thinking: { enabled: false, effort: 'medium' },
    });
    expect(result).toBeNull();
  });
});
