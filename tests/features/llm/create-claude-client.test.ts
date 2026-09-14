import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClaudeClient } from '../../../src/features/llm/claude-cli';

// child_process.spawn をモック
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(() => 'C:\\fake\\claude.cmd'),
}));

import { spawn } from 'child_process';
const spawnMock = vi.mocked(spawn);

describe('createClaudeClient.runPrompt', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('enabled=false で MAX_THINKING_TOKENS=0 を env に注入', async () => {
    const child = makeFakeChild('result', 0);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: false, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({ MAX_THINKING_TOKENS: '0' }),
      }),
    );
  });

  it('enabled=true, effort=high で MAX_THINKING_TOKENS=4096', async () => {
    const child = makeFakeChild('ok', 0);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: true, effort: 'high' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'high' } });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String), expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ MAX_THINKING_TOKENS: '4096' }) }),
    );
  });

  it('enabled=true, effort=medium で MAX_THINKING_TOKENS=1024', async () => {
    const child = makeFakeChild('ok', 0);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: true, effort: 'medium' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'medium' } });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String), expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ MAX_THINKING_TOKENS: '1024' }) }),
    );
  });

  it('enabled=true, effort=low で MAX_THINKING_TOKENS=512', async () => {
    const child = makeFakeChild('ok', 0);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: true, effort: 'low' });
    await client.runPrompt('test', { thinking: { enabled: true, effort: 'low' } });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String), expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ MAX_THINKING_TOKENS: '512' }) }),
    );
  });

  it('exit code 0 以外で null 返却', async () => {
    const child = makeFakeChild('error msg', 1);
    spawnMock.mockReturnValue(child);
    const client = createClaudeClient({ enabled: false, effort: 'medium' });
    const result = await client.runPrompt('test', { thinking: { enabled: false, effort: 'medium' } });
    expect(result).toBeNull();
  });

  it('client.id === "claude"', () => {
    const client = createClaudeClient({ enabled: true, effort: 'medium' });
    expect(client.id).toBe('claude');
  });
});

function makeFakeChild(stdout: string = '', exitCode: number = 0) {
  const stdoutHandlers: Array<(d: Buffer) => void> = [];
  const closeHandlers: Array<(code: number) => void> = [];
  const autoFire = (code: number): void => {
    setTimeout(() => {
      if (stdout && stdoutHandlers.length > 0) {
        stdoutHandlers.forEach(h => h(Buffer.from(stdout)));
      }
      closeHandlers.forEach(h => h(code));
    }, 0);
  };
  return {
    stdout: { on: (ev: string, cb: (d: Buffer) => void) => {
      if (ev === 'data') {
        stdoutHandlers.push(cb);
        if (stdout) cb(Buffer.from(stdout));
      }
    } },
    stderr: { on: () => {} },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: (ev: string, cb: (code: number) => void) => {
      if (ev === 'close') {
        closeHandlers.push(cb);
        autoFire(exitCode);
      }
    },
    kill: vi.fn(),
    _emit: (chunk: string, code: number) => {
      stdoutHandlers.forEach(h => h(Buffer.from(chunk)));
      closeHandlers.forEach(h => h(code));
    },
  } as any;
}