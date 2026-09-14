// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initMermaidLog, mermaidLog } from '../../../src/features/mermaid-render/logger';

describe('mermaidLog', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-mermaid-')); });

  it('init 後は追記される', () => {
    initMermaidLog(dir);
    mermaidLog('render error', { code: 'graph X' });
    const content = fs.readFileSync(path.join(dir, 'debug.mermaid.log'), 'utf-8');
    expect(content).toContain('render error');
    expect(content).toContain('graph X');
  });

  it('書き込めないディレクトリでも例外を出さない', () => {
    initMermaidLog(path.join(dir, 'no-such-dir'));
    expect(() => mermaidLog('boom')).not.toThrow();
  });
});
