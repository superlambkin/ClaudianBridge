// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/features/quota/python', () => ({
  runPython: vi.fn(),
  parseJsonOutput: (stdout: string) => {
    try {
      return { ok: true as const, data: JSON.parse(stdout) as unknown };
    } catch {
      return { ok: false as const, error: 'JSON parse error', data: null };
    }
  },
}));

import { createZhipuProvider } from '../../../../src/features/quota/providers/zhipu';
import { runPython } from '../../../../src/features/quota/python';

const runPythonMock = vi.mocked(runPython);

function makeProvider() {
  return createZhipuProvider({
    getKey: () => 'sk-zhipu',
    getPythonPath: () => 'py',
    getVaultRoot: () => 'C:\\vault',
  });
}

describe('createZhipuProvider', () => {
  beforeEach(() => {
    runPythonMock.mockReset();
  });

  it('キー未設定 → isConfigured=false', () => {
    const p = createZhipuProvider({
      getKey: () => undefined,
      getPythonPath: () => 'py',
      getVaultRoot: () => '',
    });
    expect(p.isConfigured()).toBe(false);
  });

  it('成功 → 5h 使用率 % を返す', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: true, pct: 45, nextResetTime: '2099-01-01T00:00:00Z' }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('success');
    expect(q.value).toBe('45%');
    expect(q.pct).toBe(45);
    expect(q.detail).toBe('5h');
  });

  it('expired（401/403）→ status expired', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: false, error: 'expired' }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('expired');
  });

  it('error → status error + error メッセージ', async () => {
    runPythonMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ ok: false, error: 'code 500' }),
      stderr: '',
    });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('error');
    expect(q.error).toBe('code 500');
  });

  it('Python 不在（exitCode 127）→ error', async () => {
    runPythonMock.mockResolvedValue({ exitCode: 127, stdout: '', stderr: 'python not found' });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('error');
  });

  it('stdout が不正 JSON → error', async () => {
    runPythonMock.mockResolvedValue({ exitCode: 0, stdout: 'not json', stderr: '' });
    const q = await makeProvider().fetch();
    expect(q.status).toBe('error');
  });
});
