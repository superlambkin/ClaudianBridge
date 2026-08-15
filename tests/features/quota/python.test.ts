// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseJsonOutput } from '../../../src/features/quota/python';

describe('parseJsonOutput', () => {
  it('有効 JSON → ok=true, data を返す', () => {
    expect(parseJsonOutput('{"ok": true, "pct": 45}')).toEqual({
      ok: true,
      data: { ok: true, pct: 45 },
    });
  });
  it('空文字 → ok=false, error=empty stdout', () => {
    const r = parseJsonOutput('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });
  it('不正 JSON → ok=false, error に JSON parse を含む', () => {
    const r = parseJsonOutput('not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('JSON');
  });
});
