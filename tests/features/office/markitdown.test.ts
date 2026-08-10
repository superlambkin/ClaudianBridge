import { describe, it, expect, vi, beforeEach } from 'vitest';

const makeChild = () => {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  return {
    stdin: { write() {}, end() {} },
    stdout: {
      on(ev: string, fn: (...a: unknown[]) => void) { (listeners['stdout:' + ev] ??= []).push(fn); return this; },
    },
    stderr: {
      on(ev: string, fn: (...a: unknown[]) => void) { (listeners['stderr:' + ev] ??= []).push(fn); return this; },
    },
    on(ev: string, fn: (...a: unknown[]) => void) { (listeners[ev] ??= []).push(fn); return this; },
    emit(ev: string, ...args: unknown[]) { (listeners[ev] ?? []).forEach((fn) => fn(...args)); },
    emitStdout(data: string) { (listeners['stdout:data'] ?? []).forEach((fn) => fn(data)); },
    emitStderr(data: string) { (listeners['stderr:data'] ?? []).forEach((fn) => fn(data)); },
  };
};

vi.mock('child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'child_process';
import { MarkItDownRunner, spawnPython } from '../../../src/features/office/markitdown';

const spawnMock = vi.mocked(spawn);

beforeEach(() => { spawnMock.mockReset(); });

describe('spawnPython', () => {
  it('useShell=true は手動クォートしたコマンドラインで spawn する', () => {
    spawnPython({ cmd: 'py', useShell: true }, ['C:/path with space/a.py', 'C:/src.xlsx'], 'C:/cwd');
    expect(spawnMock).toHaveBeenCalledWith('"py" "C:/path with space/a.py" "C:/src.xlsx"', [], {
      cwd: 'C:/cwd', shell: true, env: expect.any(Object),
    });
  });
  it('useShell=false は args 配列で spawn する', () => {
    spawnPython({ cmd: 'python', useShell: false }, ['a.py'], 'C:/cwd');
    expect(spawnMock).toHaveBeenCalledWith('python', ['a.py'], { cwd: 'C:/cwd', env: expect.any(Object) });
  });
});

describe('MarkItDownRunner.run', () => {
  it('ヘルパースクリプト不在なら exitCode 127', async () => {
    vi.spyOn(MarkItDownRunner, 'resolvePython').mockResolvedValue({ cmd: 'py', useShell: false });
    const r = await MarkItDownRunner.run('C:/src.docx', { pythonPath: 'py' }, 'C:/vault-no-scripts');
    expect(r.exitCode).toBe(127);
    expect(r.stderr).toContain('helper script not found');
  });
  it('JSON エンベロープを unwrap する', async () => {
    vi.spyOn(MarkItDownRunner, 'resolvePython').mockResolvedValue({ cmd: 'py', useShell: false });
    const child = makeChild();
    setImmediate(() => {
      child.emitStdout(JSON.stringify({ exitCode: 0, stdout: '# Markdown', stderr: '' }));
      child.emit('exit', 0);
    });
    spawnMock.mockReturnValue(child as never);
    const r = await MarkItDownRunner.run('C:/src.docx', { pythonPath: 'py' }, 'C:/vault');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('# Markdown');
  });
  it('exit コードが 0 でない場合は stderr を返す', async () => {
    vi.spyOn(MarkItDownRunner, 'resolvePython').mockResolvedValue({ cmd: 'py', useShell: false });
    const child = makeChild();
    setImmediate(() => { child.emitStdout('not-json'); child.emitStderr('boom'); child.emit('exit', 1); });
    spawnMock.mockReturnValue(child as never);
    const r = await MarkItDownRunner.run('C:/src.docx', { pythonPath: 'py' }, 'C:/vault');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBe('boom');
  });
});
