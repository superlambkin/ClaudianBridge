// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractMessages, findFirstHeadingText, MESSAGES_SELECTOR } from '../../../src/features/memory/extract';

function makeMessages(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'claudian-messages';
  root.innerHTML = `
    <div class="claudian-message-user"><div class="claudian-message-content"><p>質問1</p></div></div>
    <div class="claudian-message-assistant"><div class="claudian-message-content"><h2>回答1</h2></div></div>
    <div class="claudian-message-user"><div class="claudian-message-content"><p>質問2</p></div></div>
    <div class="claudian-message-assistant"><div class="claudian-message-content"><h2>回答2</h2></div></div>
  `;
  return root;
}

describe('extractMessages', () => {
  it('pair: 最後の assistant + 直前の user を返す', () => {
    const msgs = extractMessages('pair', makeMessages());
    expect(msgs).not.toBeNull();
    expect(msgs!.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect((msgs![1].element as HTMLElement).textContent).toContain('回答2');
    expect((msgs![0].element as HTMLElement).textContent).toContain('質問2');
  });

  it('pair: user が無ければ assistant のみ', () => {
    const root = document.createElement('div');
    root.className = 'claudian-messages';
    root.innerHTML = '<div class="claudian-message-assistant"><div class="claudian-message-content"><p>A</p></div></div>';
    const msgs = extractMessages('pair', root);
    expect(msgs!.map((m) => m.role)).toEqual(['assistant']);
  });

  it('conversation: 全メッセージを時系列で返す', () => {
    const msgs = extractMessages('conversation', makeMessages());
    expect(msgs!.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('conversation: グループ/コンテナにネストされたメッセージもドキュメント順で返す', () => {
    const root = document.createElement('div');
    root.className = 'claudian-messages';
    root.innerHTML = `
      <div class="group">
        <div class="claudian-message-user"><div class="claudian-message-content"><p>Q1</p></div></div>
        <div class="claudian-message-assistant"><div class="claudian-message-content"><h2>A1</h2></div></div>
      </div>
      <div class="group">
        <div class="claudian-message-user"><div class="claudian-message-content"><p>Q2</p></div></div>
        <div class="claudian-message-assistant"><div class="claudian-message-content"><h2>A2</h2></div></div>
      </div>
    `;
    const msgs = extractMessages('conversation', root);
    expect(msgs).not.toBeNull();
    expect(msgs!.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect((msgs![1].element as HTMLElement).textContent).toContain('A1');
    expect((msgs![3].element as HTMLElement).textContent).toContain('A2');
  });

  it('assistant が無ければ null', () => {
    const root = document.createElement('div');
    root.className = 'claudian-messages';
    root.innerHTML = '<div class="claudian-message-user"><div class="claudian-message-content"><p>Q</p></div></div>';
    expect(extractMessages('pair', root)).toBeNull();
  });

  it('findFirstHeadingText は最初の見出しを返す', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>前置き</p><h3>タイトル</h3><p>本文</p>';
    expect(findFirstHeadingText(el)).toBe('タイトル');
  });

  it('MESSAGES_SELECTOR が .claudian-messages である', () => {
    expect(MESSAGES_SELECTOR).toBe('.claudian-messages');
  });
});
