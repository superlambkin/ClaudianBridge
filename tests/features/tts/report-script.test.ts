/**
 * v0.28.0 (F026): タスク完了報告 → 読上げ用スクリプト整形のテスト。
 * 設計書: 02_設計文書/2026-08-30-report-speech-script-design.md
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isCompletionReport, buildReportScript } from '../../../src/features/tts/report-script';
import { extractReportText } from '../../../src/features/tts/extract-report';

/**
 * 報告 1 件分の DOM を組み立てるヘルパー。
 * innerText 非対応環境（jsdom）向けに textContent が正しく返る構造にする。
 */
function makeReport(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <h2>✅ 完了 · 修正タスク · 2026-08-30 · 🟡 M</h2>
    <blockquote><p>📢 修正を完了しました。テスト 790 件 PASS です。</p></blockquote>
    <h3>🎯 結論</h3>
    <p>読上げの言語不具合 2 件がすべて解決しました。</p>
    <table><tr><td>作業</td><td>状態</td></tr></table>
    <h3>🎁 成果物</h3>
    <p>修正コミットとタグを作成しました。</p>
    <h3>✅ 検証結果</h3>
    <table><tr><td>テスト</td><td>✅ PASS</td></tr></table>
    <h3>📚 参照文献</h3>
    <table><tr><td>1</td><td>LLM</td></tr></table>
    <h3>🔜 次のアクション提案</h3>
    <p>残りの読上げ問題 2 件の調査をお勧めします。</p>
    <table><tr><td>1</td><td>調査</td></tr></table>
  `;
  return root;
}

describe('isCompletionReport', () => {
  it('✅ 完了見出しがあれば true', () => {
    expect(isCompletionReport(makeReport())).toBe(true);
  });
  it('完了見出しが無ければ false', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h3>🎯 結論</h3><p>普通の回答です。</p>';
    expect(isCompletionReport(root)).toBe(false);
  });
});

describe('buildReportScript', () => {
  it('完了報告を ヘッダー/結論/次のアクション提案 のスクリプトに変換する', () => {
    const script = buildReportScript(makeReport(), '');
    expect(script).toBe(
      [
        'タスク完了です。',
        '📢 修正を完了しました。テスト 790 件 PASS です。',
        '結論。 読上げの言語不具合 2 件がすべて解決しました。',
        '次のアクション提案です。 残りの読上げ問題 2 件の調査をお勧めします。',
      ].join('\n'),
    );
  });

  it('成果物・検証結果・参照文献・テーブルは含まない', () => {
    const script = buildReportScript(makeReport(), '') ?? '';
    expect(script).not.toContain('成果物');
    expect(script).not.toContain('検証結果');
    expect(script).not.toContain('参照文献');
    expect(script).not.toContain('PASS</td>');
    expect(script).not.toContain('修正コミットとタグ');
  });

  it('サマリー欠落の章は読み飛ばす', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <h2>✅ 完了 · タスク · 2026-08-30 · 🟢 S</h2>
      <blockquote><p>📢 完了しました。</p></blockquote>
      <h3>🎯 結論</h3>
      <table><tr><td>項目</td><td>状態</td></tr></table>
      <h3>🔜 次のアクション提案</h3>
      <p>次は実機確認をお勧めします。</p>
    `;
    const script = buildReportScript(root, '') ?? '';
    expect(script).toContain('タスク完了です。');
    expect(script).not.toContain('結論。');
    expect(script).toContain('次のアクション提案です。 次は実機確認をお勧めします。');
  });

  it('📢・結論・次のアクション提案が全て空なら null（フォールバック）', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h2>✅ 完了 · タスク · 2026-08-30 · 🟢 S</h2><p>本文のみ。</p>';
    expect(buildReportScript(root, '')).toBe(null);
  });
});

/** extractReportText へ渡す .claudian-messages 相当のラッパ */
function makeMessages(report: HTMLElement): Element {
  const messages = document.createElement('div');
  const assistant = document.createElement('div');
  assistant.className = 'claudian-message-assistant';
  const content = document.createElement('div');
  content.className = 'claudian-message-content';
  const block = document.createElement('div');
  block.className = 'claudian-text-block';
  while (report.firstChild) block.appendChild(report.firstChild);
  content.appendChild(block);
  assistant.appendChild(content);
  messages.appendChild(assistant);
  return messages;
}

describe('extractReportText reportScript オプション', () => {
  it('reportScript: true + 完了報告 → スクリプトを返す', () => {
    const messages = makeMessages(makeReport());
    const text = extractReportText(messages, 'full', { reportScript: true });
    expect(text).toContain('タスク完了です。');
    expect(text).toContain('結論。');
  });

  it('reportScript: false → 従来どおり全文を返す', () => {
    const messages = makeMessages(makeReport());
    const text = extractReportText(messages, 'full', { reportScript: false });
    expect(text).toContain('成果物');
    expect(text).not.toContain('タスク完了です。');
  });

  it('完了報告でない通常回答は reportScript: true でも全文を返す', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h3>🎯 結論</h3><p>普通の回答です。</p>';
    const messages = makeMessages(root);
    const text = extractReportText(messages, 'full', { reportScript: true });
    expect(text).toContain('普通の回答です。');
    expect(text).not.toContain('タスク完了です。');
  });
});
