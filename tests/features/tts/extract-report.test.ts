// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractReportText, AUTO_READ_MARK } from '../../../src/features/tts/extract-report';

const REPORT_HTML = `
  <div class="claudian-message-assistant">
    <div class="claudian-message-content">
      <h6>✅ 完了 · テストタスク</h6>
      <blockquote>
        <p>📢 テストタスクを完了しました。</p>
        <p>検証は テスト 通過しました。</p>
      </blockquote>
      <hr>
      <p>詳細セクション（読まない）</p>
    </div>
  </div>`;

function makeMessages(inner: string): Element {
  const el = document.createElement('div');
  el.className = 'claudian-messages';
  el.innerHTML = inner;
  return el;
}

describe('extractReportText', () => {
  it('header scope: 📢 blockquote のテキストのみ抽出し、詳細を含まない', () => {
    const text = extractReportText(makeMessages(REPORT_HTML), 'header');
    expect(text).toContain('📢 テストタスクを完了しました。');
    expect(text).toContain('検証は テスト 通過しました。');
    expect(text).not.toContain('詳細セクション');
  });

  it('full scope: メッセージ全文を抽出（詳細を含む）', () => {
    const text = extractReportText(makeMessages(REPORT_HTML), 'full');
    expect(text).toContain('📢 テストタスクを完了しました。');
    expect(text).toContain('詳細セクション');
  });

  it('full scope: 📢 が無くても最後の応答全文を返す（v0.13.0 全応答統一）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常の応答</p><p>詳細も含む</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'full');
    expect(text).toContain('通常の応答');
    expect(text).toContain('詳細も含む');
  });

  it('full scope: 📢 なし全文抽出も dedup マークで 2 回目は null', () => {
    const el = makeMessages(`<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常応答</p></div></div>`);
    expect(extractReportText(el, 'full')).not.toBeNull();
    expect(extractReportText(el, 'full')).toBeNull();
    expect(el.querySelector('.claudian-message-assistant')!.hasAttribute(AUTO_READ_MARK)).toBe(true);
  });

  it('📢 blockquote が無いメッセージ → null', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常の応答</p></div></div>`;
    expect(extractReportText(makeMessages(html), 'header')).toBeNull();
  });

  it('📢 で始まらない blockquote は無視 → null', () => {
    const html = `<div class="claudian-message-assistant"><blockquote><p>引用です 📢 途中は対象外</p></blockquote></div>`;
    expect(extractReportText(makeMessages(html), 'header')).toBeNull();
  });

  it('assistant メッセージが無い → null', () => {
    expect(extractReportText(makeMessages('<p>空</p>'), 'header')).toBeNull();
  });

  it('抽出済みマーク: 2回目は null（header）', () => {
    const el = makeMessages(REPORT_HTML);
    expect(extractReportText(el, 'header')).not.toBeNull();
    expect(extractReportText(el, 'header')).toBeNull();
    expect(el.querySelector('blockquote')!.hasAttribute(AUTO_READ_MARK)).toBe(true);
  });

  it('抽出済みマーク: 2回目は null（full はメッセージ要素にマーク）', () => {
    const el = makeMessages(REPORT_HTML);
    expect(extractReportText(el, 'full')).not.toBeNull();
    expect(extractReportText(el, 'full')).toBeNull();
    expect(el.querySelector('.claudian-message-assistant')!.hasAttribute(AUTO_READ_MARK)).toBe(true);
  });

  it('最後の assistant メッセージのみ対象（手前の 📢 は読まない）', () => {
    const older = REPORT_HTML;
    const latest = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>補足コメント</p></div></div>`;
    expect(extractReportText(makeMessages(older + latest), 'header')).toBeNull();
  });
});
