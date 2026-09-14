import { describe, it, expect, beforeEach } from 'vitest';
import { beginLlmSession, abortCurrentLlm, isCurrent, endLlmSession } from '../../../src/features/tts/llm-session';

describe('llm-session (v0.37.1)', () => {
  beforeEach(() => { endLlmSession(); });

  it('新規セッションは current', () => {
    const s = beginLlmSession();
    expect(isCurrent(s.gen)).toBe(true);
    expect(s.signal.aborted).toBe(false);
  });

  it('abortCurrentLlm で signal が aborted になる（gen は次回 begin まで現役扱い）', () => {
    const s = beginLlmSession();
    abortCurrentLlm();
    expect(s.signal.aborted).toBe(true);
    expect(isCurrent(s.gen)).toBe(true); // stale 判定は次回 begin が担う
  });

  it('2 回目 begin で 1 回目の gen は stale', () => {
    const a = beginLlmSession();
    const b = beginLlmSession();
    expect(isCurrent(a.gen)).toBe(false);
    expect(isCurrent(b.gen)).toBe(true);
    expect(a.signal.aborted).toBe(true);
  });
});
