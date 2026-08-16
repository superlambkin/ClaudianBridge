import { describe, it, expect, vi, beforeEach } from 'vitest';

const makeChild = () => {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  return {
    stdin: { write() {}, end() {} },
    stdout: { on(ev: string, fn: (...a: unknown[]) => void) { (listeners['stdout:' + ev] ??= []).push(fn); return this; } },
    stderr: { on() {} },
    on(ev: string, fn: (...a: unknown[]) => void) { (listeners[ev] ??= []).push(fn); return this; },
    emit(ev: string, ...args: unknown[]) { (listeners[ev] ?? []).forEach((fn) => fn(...args)); },
    emitStdout(data: string) { (listeners['stdout:data'] ?? []).forEach((fn) => fn(data)); },
  };
};

vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('../../../src/features/office/markitdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/features/office/markitdown')>();
  return {
    ...actual,
    MarkItDownRunner: { resolvePython: vi.fn() },
  };
});

import { spawn } from 'child_process';
import { SplitterRunner } from '../../../src/features/office/splitter';
import { MarkItDownRunner } from '../../../src/features/office/markitdown';

const spawnMock = vi.mocked(spawn);
const resolvePythonMock = vi.mocked(MarkItDownRunner.resolvePython);

beforeEach(() => { spawnMock.mockReset(); resolvePythonMock.mockReset(); });

describe('SplitterRunner', () => {
  const pluginDir = 'C:/vault/.obsidian/plugins/claudian-bridge';
  it('未対応拡張子は exitCode 1', async () => {
    resolvePythonMock.mockResolvedValue({ cmd: 'py', useShell: false });
    const r = await SplitterRunner.split('xyz', 'C:/a.md', 'C:/a.xyz', 'C:/out', { pythonPath: 'py' }, 'C:/vault', pluginDir);
    expect(r.exitCode).toBe(1);
  });
  it('stdout を行に分割して outputs を返す', async () => {
    resolvePythonMock.mockResolvedValue({ cmd: 'py', useShell: false });
    const child = makeChild();
    setImmediate(() => { child.emitStdout('C:/out/1.md\nC:/out/2.md\n'); child.emit('exit', 0); });
    spawnMock.mockReturnValue(child as never);
    const r = await SplitterRunner.split('docx', 'C:/a.md', 'C:/a.docx', 'C:/out', { pythonPath: 'py' }, 'C:/vault', pluginDir);
    expect(r.exitCode).toBe(0);
    expect(r.outputs).toEqual(['C:/out/1.md', 'C:/out/2.md']);
  });
});
